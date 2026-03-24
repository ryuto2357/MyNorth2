import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface GoalWorkload {
  goalId: string
  goalTitle: string
  priority_rank: number
  deadline: string
  raw_L_daily: number // Hours/day needed if goal alone
  days_remaining: number
}

interface AllocationResult {
  goalId: string
  goalTitle: string
  priority_rank: number
  allocated_L_daily: number // Final allocated hours/day
  allocated_daily_budget_min: number
  base_weight: number
  deadline_urgency: number
  final_weight: number
}

export async function POST(req: NextRequest) {
  const { userId } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // ============================================
    // STEP 1: Get all ACTIVE goals for user
    // ============================================
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .order('priority_rank', { ascending: true })

    if (goalsError || !goals || goals.length === 0) {
      return NextResponse.json({
        success: true,
        goalCount: 0,
        hasConflict: false,
        message: 'No active goals',
      })
    }

    // If only 1 goal, no arbitration needed
    if (goals.length === 1) {
      return NextResponse.json({
        success: true,
        goalCount: 1,
        hasConflict: false,
        allocations: [
          {
            goalId: goals[0].id,
            goalTitle: goals[0].title,
            allocated_L_daily: null, // Calculate per-goal
            message: 'Single goal - no arbitration needed',
          },
        ],
      })
    }

    // ============================================
    // STEP 2: Get user's free time
    // ============================================
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    const freeTime = user?.schedule?.daily_free_time_hours || 2
    const capacityThreshold = freeTime * 0.6 // Conflict threshold

    // ============================================
    // STEP 3: Calculate raw workload for each goal
    // ============================================
    const goalWorkloads: GoalWorkload[] = []
    let totalRawLoad = 0

    for (const goal of goals) {
      // Call workload engine for this goal
      const workloadRes = await fetch(
        new URL('/api/workload/calculate', process.env.VERCEL_URL || 'http://localhost:3000'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goalId: goal.id, userId }),
        }
      )

      if (!workloadRes.ok) {
        console.error(`Failed to calculate workload for goal ${goal.id}`)
        continue
      }

      const workload = await workloadRes.json()

      goalWorkloads.push({
        goalId: goal.id,
        goalTitle: goal.title,
        priority_rank: goal.priority_rank,
        deadline: goal.deadline,
        raw_L_daily: workload.L_daily,
        days_remaining: workload.days_remaining,
      })

      totalRawLoad += workload.L_daily
    }

    // ============================================
    // STEP 4: Detect conflict
    // ============================================
    const hasConflict = totalRawLoad > capacityThreshold

    // ============================================
    // STEP 5: Calculate deadline urgency modifiers
    // ============================================
    const getUrgencyModifier = (daysRemaining: number): number => {
      if (daysRemaining < 7) return 1.4 // Crunch mode
      if (daysRemaining < 14) return 1.2 // High priority
      if (daysRemaining < 30) return 1.0 // Normal
      return 0.85 // Low priority
    }

    // ============================================
    // STEP 6: Calculate base weights by priority rank
    // ============================================
    const getBaseWeight = (priorityRank: number): number => {
      if (priorityRank === 1) return 0.55 // Primary goal gets majority
      if (priorityRank === 2) return 0.30 // Secondary goal
      return 0.15 // Tertiary+ goals share remainder
    }

    // ============================================
    // STEP 7: Apply urgency modifiers and normalize
    // ============================================
    let totalWeightedLoad = 0
    const weightedGoals = goalWorkloads.map((gw) => {
      const baseWeight = getBaseWeight(gw.priority_rank)
      const urgency = getUrgencyModifier(gw.days_remaining)
      const weightedLoad = gw.raw_L_daily * (baseWeight * urgency)

      totalWeightedLoad += weightedLoad

      return {
        goalId: gw.goalId,
        goalTitle: gw.goalTitle,
        priority_rank: gw.priority_rank,
        base_weight: baseWeight,
        deadline_urgency: urgency,
        weighted_load: weightedLoad,
      }
    })

    // ============================================
    // STEP 8: Allocate time proportionally
    // ============================================
    // Start with available budget, cap at human ceiling (4.0 hrs)
    let availableBudget = Math.min(freeTime * 0.8, 4.0) // Use 80% of free time, max 4hrs

    // If conflict detected, reduce to 3.5 hrs max to give breathing room
    if (hasConflict) {
      availableBudget = 3.5
    }

    // Allocate based on weighted load proportions
    const allocations: AllocationResult[] = weightedGoals.map((wg) => {
      const proportion = totalWeightedLoad > 0 ? wg.weighted_load / totalWeightedLoad : 1 / weightedGoals.length
      const allocatedHours = availableBudget * proportion

      return {
        goalId: wg.goalId,
        goalTitle: wg.goalTitle,
        priority_rank: wg.priority_rank,
        allocated_L_daily: allocatedHours,
        allocated_daily_budget_min: Math.round(allocatedHours * 60 / 5) * 5, // Round to 5min increments
        base_weight: wg.base_weight,
        deadline_urgency: wg.deadline_urgency,
        final_weight: proportion,
      }
    })

    // ============================================
    // STEP 9: Return arbitration result
    // ============================================
    return NextResponse.json({
      success: true,
      goalCount: goals.length,
      hasConflict: hasConflict,
      conflictSeverity: hasConflict ? totalRawLoad / capacityThreshold : 0, // >1.0 = conflict
      studentFreeTime: freeTime,
      capacityThreshold: capacityThreshold,
      totalRawLoad: totalRawLoad,
      availableBudget: availableBudget,
      allocations: allocations,
      message: hasConflict
        ? `⚠️ Conflict detected! Combined load (${totalRawLoad.toFixed(1)}h) exceeds capacity (${capacityThreshold.toFixed(1)}h). Time has been intelligently allocated.`
        : `✓ All goals fit within capacity. No conflict.`,
    })
  } catch (error: any) {
    console.error('Multi-goal arbitration error:', error)
    return NextResponse.json(
      { error: error.message || 'Arbitration failed' },
      { status: 500 }
    )
  }
}
