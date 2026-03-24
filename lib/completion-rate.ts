import { SupabaseClient } from '@supabase/supabase-js'
import { subDays, format } from 'date-fns'

/**
 * Calculate 7-day rolling completion rate for a goal
 * Returns: tasks_completed / total_tasks in last 7 days
 */
export async function calculateCompletionRate(
  supabase: SupabaseClient,
  goalId: string,
  userId: string
): Promise<{
  completionRate: number
  tasksCompleted: number
  tasksTotal: number
  daysAnalyzed: number
}> {
  const today = new Date()
  const sevenDaysAgo = subDays(today, 7)

  // Get all tasks from the last 7 days (completed or not)
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('goal_id', goalId)
    .eq('user_id', userId)
    .gte('scheduled_for', format(sevenDaysAgo, 'yyyy-MM-dd'))
    .lte('scheduled_for', format(today, 'yyyy-MM-dd'))

  if (error) {
    console.error('Error fetching tasks for completion rate:', error)
    return { completionRate: 0.6, tasksCompleted: 0, tasksTotal: 1, daysAnalyzed: 0 }
  }

  if (!tasks || tasks.length === 0) {
    // No tasks in 7-day window, assume default (60% is a reasonable middle ground)
    return { completionRate: 0.6, tasksCompleted: 0, tasksTotal: 0, daysAnalyzed: 0 }
  }

  // Count completed tasks
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length
  const total = tasks.length

  // Calculate rate (0-1 scale)
  const rate = total > 0 ? completed / total : 0.6

  return {
    completionRate: Math.round(rate * 100) / 100, // Round to 2 decimals
    tasksCompleted: completed,
    tasksTotal: total,
    daysAnalyzed: 7,
  }
}

/**
 * Update goal's completion_rate_history in database
 * Should be called after task status changes
 */
export async function updateGoalCompletionRate(
  supabase: SupabaseClient,
  goalId: string,
  userId: string
): Promise<void> {
  const rateData = await calculateCompletionRate(supabase, goalId, userId)

  await supabase
    .from('goals')
    .update({
      completion_rate_history: rateData.completionRate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
}
