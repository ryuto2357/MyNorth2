import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { goalId, userId } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Get goal data
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single()

    if (goalError || !goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    // Get user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ============================================
    // STAGE 1: Calculate H_remaining (hours needed)
    // ============================================
    // Priority: Counselor Override → Recorded History → Decomposition → Self-Report

    let H_remaining = goal.hours_override
    let estimationMethod = 'COUNSELOR_OVERRIDE'

    if (!H_remaining) {
      // TODO: Future - Query reference_hours table for UTBK/goals
      // For MVP: Use self-report estimate (default 40 hours for most goals)
      H_remaining = 40
      estimationMethod = 'SELF_REPORT'
    }

    // ============================================
    // STAGE 2: Calculate D_effective (days remaining)
    // ============================================
    const deadline = new Date(goal.deadline)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    deadline.setHours(0, 0, 0, 0)

    const daysUntilDeadline = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const D_effective = Math.max(1, daysUntilDeadline) // Floor at 1 day minimum

    // ============================================
    // STAGE 3: Calculate I_total (inefficiency coefficient)
    // ============================================
    // Formula: I_total = (C_load × S_gap) + H_history

    // C_load: Based on available daily free time
    const freeTime = user.schedule?.daily_free_time_hours || 2
    let C_load: number
    if (freeTime > 4) {
      C_load = 0.1 // Lots of time, little friction
    } else if (freeTime >= 2) {
      C_load = 0.2 // Moderate time
    } else if (freeTime >= 1) {
      C_load = 0.3 // Tight schedule
    } else {
      C_load = 0.5 // Very constrained
    }

    // S_gap: Based on current familiarity (knowledge gap)
    const familiarity = goal.familiarity_baseline || 5
    let S_gap: number
    if (familiarity >= 8) {
      S_gap = 1.0 // Expert already, minimal gap
    } else if (familiarity >= 4) {
      S_gap = 1.5 // Intermediate
    } else {
      S_gap = 2.0 // Complete beginner, large gap
    }

    // H_history: Based on historical completion rate (7-day rolling average)
    const completionRate = goal.completion_rate_history || 0.6
    let H_history: number
    if (completionRate >= 0.8) {
      H_history = 0.0 // Great track record, no inefficiency penalty
    } else if (completionRate >= 0.5) {
      H_history = 0.2 // Decent follow-through
    } else {
      H_history = 0.4 // Poor follow-through, high inefficiency
    }

    const I_total = C_load * S_gap + H_history

    // ============================================
    // STAGE 4: Calculate L_daily (daily study load in hours)
    // ============================================
    // Formula: L_daily = (H_remaining / D_effective) × (1 + I_total)

    let L_daily = (H_remaining / D_effective) * (1 + I_total)

    // ============================================
    // STAGE 5: Apply Safety Valves
    // ============================================

    // Hard ceiling: Students cannot be asked to study more than 3.5 hours/day
    if (L_daily > 3.5) {
      L_daily = 3.5
    }

    // Mercy rule: If deadline is urgent (< 5 days) and load is unrealistic (> 6hr)
    // Cap it at 4 hours but acknowledge crunch in the response
    let inCrunchMode = false
    if (D_effective < 5 && L_daily > 4.0) {
      inCrunchMode = true
      L_daily = 4.0
    }

    // Floor: At least 15 minutes
    if (L_daily < 0.25) {
      L_daily = 0.25 // 15 minutes
    }

    // ============================================
    // STAGE 7: Calculate daily budget in minutes
    // ============================================
    // Round to nearest 5 minutes for clean task times
    let dailyBudgetMinutes = Math.round(L_daily * 60 / 5) * 5

    // Ensure reasonable bounds
    dailyBudgetMinutes = Math.max(15, Math.min(210, dailyBudgetMinutes))

    // ============================================
    // STAGE 8: Calculate task count and duration per task
    // ============================================
    // Standard task duration: 20 minutes (sweet spot: 15-25 min)
    // But scale based on budget
    const standardTaskDuration = 20
    let taskCount = Math.max(1, Math.ceil(dailyBudgetMinutes / standardTaskDuration))
    taskCount = Math.min(11, taskCount) // Hard cap at 11 tasks/day (can't sustain more)

    // Adjust per-task duration to fit budget
    const minutesPerTask = Math.floor(dailyBudgetMinutes / taskCount)

    // ============================================
    // Return calculations for use in task generation
    // ============================================
    return NextResponse.json({
      // Goal metadata
      goalId,
      goalTitle: goal.title,

      // Workload engine calculations
      H_remaining,
      D_effective,
      C_load,
      S_gap,
      H_history,
      I_total,
      L_daily,

      // Daily constraints for task generation
      daily_budget_minutes: dailyBudgetMinutes,
      task_count: taskCount,
      minutes_per_task: minutesPerTask,

      // Status indicators
      estimation_method: estimationMethod,
      in_crunch_mode: inCrunchMode,
      deadline: goal.deadline,
      days_remaining: D_effective,

      // Debug info for future optimization
      free_time_hours: freeTime,
      familiarity_level: familiarity,
      completion_history: completionRate,
    })
  } catch (error: any) {
    console.error('Workload calculation error:', error)
    return NextResponse.json(
      { error: error.message || 'Workload calculation failed' },
      { status: 500 }
    )
  }
}
