import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { computeToneOptimization, type DISCHistoryEntry } from '@/lib/disc'
import { GamePlanNode, GamePlanLink } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today in UTC as YYYY-MM-DD */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Return the last N dates (inclusive of today) as YYYY-MM-DD strings. */
function lastNDates(n: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

// ---------------------------------------------------------------------------
// Core per-user processing
// ---------------------------------------------------------------------------

async function processUser(
  supabase: ReturnType<typeof createServerClient>,
  user: any,
): Promise<{ userId: string; error?: string }> {
  const userId: string = user.id
  const today = todayUTC()

  try {
    // ------------------------------------------------------------------
    // 1. Snapshot DISC history
    // ------------------------------------------------------------------
    const recentDates = new Set(lastNDates(14))
    let discHistory: DISCHistoryEntry[] = Array.isArray(user.disc_history)
      ? user.disc_history
      : []
    
    const currentDisc = user.disc_profile || { task_people: 0.5, fast_slow: 0.5 }
    
    if (!discHistory.some(e => e.date === today)) {
      discHistory.unshift({
        date: today,
        task_people: currentDisc.task_people,
        fast_slow: currentDisc.fast_slow
      })
    }
    discHistory = discHistory.filter(e => recentDates.has(e.date))

    // ------------------------------------------------------------------
    // 2. Recalculate gate_pace (rolling 14d)
    // ------------------------------------------------------------------
    const log = Array.isArray(user.gates_cleared_log) ? user.gates_cleared_log : []
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    
    const recentClears = log.filter((entry: any) => new Date(entry.date) >= fourteenDaysAgo)
    const gatePace = recentClears.length / 14 // gates per day

    // ------------------------------------------------------------------
    // 3. Proactive Tone Optimization (using clear counts instead of minutes)
    // ------------------------------------------------------------------
    // We pass a dummy log of minutes since computeToneOptimization expects it, 
    // but the tone engine is being transitioned to outcome-based.
    // For now, we use a simple placeholder log to maintain the DISC nudge logic.
    const dummyMinutesLog = recentClears.map(() => 15) // placeholder
    const nudge = computeToneOptimization(discHistory, dummyMinutesLog)
    const updatedDisc = { ...currentDisc }
    if (nudge) {
      updatedDisc.task_people = Math.max(0, Math.min(1, updatedDisc.task_people + nudge.task_people_delta))
      updatedDisc.fast_slow = Math.max(0, Math.min(1, updatedDisc.fast_slow + nudge.fast_slow_delta))
    }

    // ------------------------------------------------------------------
    // 4. Compute pace_gap across all active goals
    // ------------------------------------------------------------------
    const { data: nodes } = await supabase
      .from('game_plan_nodes')
      .select('id, goal_id, status, deadline_at') // Added deadline_at placeholder
      .eq('user_id', userId)
    
    const activeNodes = (nodes || []) as any[]
    const activeGoals = [...new Set(activeNodes.map(n => n.goal_id))]
    
    // Fetch goals for deadlines
    const { data: goals } = await supabase
      .from('goals')
      .select('id, deadline')
      .in('id', activeGoals)
      .eq('status', 'ACTIVE')

    let totalPaceGap = 1.0
    if (goals && goals.length > 0) {
      const gaps: number[] = []
      for (const goal of goals) {
        const goalNodes = activeNodes.filter(n => n.goal_id === goal.id)
        const gatesRemaining = goalNodes.filter(n => n.status !== 'COMPLETED').length
        
        let daysRemaining = 30 // default
        if (goal.deadline) {
          const dl = new Date(goal.deadline)
          daysRemaining = Math.max(1, Math.ceil((dl.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        }

        // pace_gap = gates_remaining / (days_remaining * gate_pace)
        const effectivePace = Math.max(0.1, gatePace) // floor at 0.1 to avoid infinity
        const gap = gatesRemaining / (daysRemaining * effectivePace)
        gaps.push(gap)
      }
      totalPaceGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    }

    // ------------------------------------------------------------------
    // 5. Update user record
    // ------------------------------------------------------------------
    await supabase
      .from('users')
      .update({
        disc_history: discHistory,
        disc_profile: updatedDisc,
        gate_pace: gatePace,
        pace_gap: totalPaceGap,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    return { userId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { userId, error: message }
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const startTime = Date.now()
  const BATCH_SIZE = 50

  const { data: activeGoalRows, error: goalFetchError } = await supabase
    .from('goals')
    .select('user_id')
    .eq('status', 'ACTIVE')

  if (goalFetchError) {
    return NextResponse.json({ error: 'Failed to fetch active goals' }, { status: 500 })
  }

  const uniqueUserIds = [...new Set((activeGoalRows || []).map((r: any) => r.user_id))]
  console.log(`[midnight-cron] Processing ${uniqueUserIds.length} users`)

  const results: any[] = []

  for (let i = 0; i < uniqueUserIds.length; i += BATCH_SIZE) {
    const batchIds = uniqueUserIds.slice(i, i + BATCH_SIZE)
    const { data: users } = await supabase.from('users').select('*').in('id', batchIds)
    if (!users) continue

    const batchResults = await Promise.all(users.map((user) => processUser(supabase, user)))
    results.push(...batchResults)
  }

  // Monthly/Weekly Insight Generation (keep existing logic)
  const dayOfWeek = new Date().getUTCDay()
  const dayOfMonth = new Date().getUTCDate()
  
  if (dayOfWeek === 0 || dayOfMonth === 1) {
    const { computeInsights } = await import('@/lib/insights')
    const period = dayOfMonth === 1 ? 'MONTHLY' : 'WEEKLY'
    const now = new Date()
    const end = now.toISOString().slice(0, 10)
    const start = new Date(now.getTime() - (period === 'MONTHLY' ? 30 : 7) * 86400000).toISOString().slice(0, 10)

    for (const uid of uniqueUserIds) {
      try {
        const insight = await computeInsights(supabase, uid, period, start, end)
        await supabase.from('insights').insert([{
          user_id: uid,
          period_type: period,
          period_start: start,
          period_end: end,
          data: insight.data,
          narrative: insight.narrative,
        }])
      } catch (e) {
        console.error(`[midnight-cron] Insight generation failed for ${uid}:`, e)
      }
    }
  }

  const summary = {
    processed: results.length,
    succeeded: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
    elapsedMs: Date.now() - startTime,
  }

  return NextResponse.json(summary)
}
