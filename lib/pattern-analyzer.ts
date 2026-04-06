import { createServerClient } from './supabase-server'
import type { PatternData } from '../types/index'

type SupabaseClient = ReturnType<typeof createServerClient>

/**
 * Analyzes behavioral patterns + recent completion rate to adjust stretch_factor.
 * Called from the midnight cron — runs once per day per student.
 *
 * Rules:
 * - completion_rate (last 7 days) > 0.8 AND no avoidance signals → nudge UP by 0.02 (max 1.25)
 * - completion_rate < 0.4 OR strong avoidance signals in patterns → nudge DOWN by 0.03 (min 1.0)
 * - Otherwise → no change
 */
export async function analyzeAndAdjustStretchFactor(
  userId: string,
  patterns: PatternData,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: tasks } = await supabase
      .from('tasks')
      .select('status')
      .eq('user_id', userId)
      .in('status', ['COMPLETED', 'ATTEMPTED', 'SKIPPED'])
      .gte('updated_at', sevenDaysAgo.toISOString())

    if (!tasks || tasks.length < 3) return

    const completed = tasks.filter(t => t.status === 'COMPLETED').length
    const attempted = tasks.filter(t => t.status === 'ATTEMPTED').length
    const total = tasks.length
    const completionRate = (completed + attempted * 0.5) / total

    const avoidanceText = (patterns.avoidance_patterns ?? '').toLowerCase()
    const hasAvoidanceSignal = avoidanceText.includes('skip') ||
      avoidanceText.includes('avoid') ||
      avoidanceText.includes('postpone') ||
      avoidanceText.includes('overwhelm')

    const { data: user } = await supabase
      .from('users')
      .select('stretch_factor')
      .eq('id', userId)
      .single()

    if (!user) return
    const current = user.stretch_factor ?? 1.1

    let next = current
    if (completionRate > 0.8 && !hasAvoidanceSignal) {
      next = Math.min(1.25, current + 0.02)
    } else if (completionRate < 0.4 || hasAvoidanceSignal) {
      next = Math.max(1.0, current - 0.03)
    }

    if (next !== current) {
      await supabase.from('users').update({ stretch_factor: next }).eq('id', userId)
    }
  } catch {
    return
  }
}