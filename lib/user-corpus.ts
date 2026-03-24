import { SupabaseClient } from '@supabase/supabase-js'
import { UserCorpus, GoalSnapshot } from '@/types/user-corpus'
import { calculateCompletionRate } from './completion-rate'
import { subDays, format } from 'date-fns'

/**
 * Build complete user_corpus from database
 * Called after significant updates (onboarding, task completion, new goal)
 */
export async function buildUserCorpus(
  supabase: SupabaseClient,
  userId: string
): Promise<UserCorpus | null> {
  try {
    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) return null

    // Get all active goals
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .order('priority_rank', { ascending: true })

    if (goalsError) {
      console.error('Error fetching goals:', goalsError)
      return null
    }

    // Build goal snapshots with completion data
    const goalSnapshots: GoalSnapshot[] = []
    for (const goal of goals || []) {
      const completion = await calculateCompletionRate(supabase, goal.id, userId)
      const now = new Date()
      const deadline = new Date(goal.deadline)
      const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

      goalSnapshots.push({
        id: goal.id,
        title: goal.title,
        why: goal.why || '',
        deadline: goal.deadline || '',
        priority_rank: goal.priority_rank || 1,
        status: goal.status,
        familiarity_baseline: goal.familiarity_baseline || 5,
        days_remaining: daysRemaining,
        hours_remaining: goal.hours_remaining || 40,
        hours_completed: goal.hours_completed || 0,
        completion_rate_history: completion.completionRate,
        current_achievement: goal.current_achievement,
        inefficiency_score: 0, // Calculated per-goal in workload engine
      })
    }

    // Get recent chat for RAG context
    const sevenDaysAgo = subDays(new Date(), 7)
    const { data: recentChats } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    // Calculate metadata
    const sevenDaysAgoDate = subDays(new Date(), 7)
    const { data: recentTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgoDate.toISOString())

    const completedInWeek = recentTasks?.filter((t) => t.status === 'COMPLETED').length || 0
    const totalInWeek = recentTasks?.length || 1
    const weeklyCompletionRate = completedInWeek / totalInWeek

    // Get last completed task
    const { data: lastCompleted } = await supabase
      .from('tasks')
      .select('completion_timestamp:completed_at')
      .eq('user_id', userId)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false })
      .limit(1)

    // Calculate current streak (simplified - last consecutive days with task completion)
    const { data: lastSevenDays } = await supabase
      .from('tasks')
      .select('scheduled_for, status')
      .eq('user_id', userId)
      .gte('scheduled_for', format(sevenDaysAgoDate, 'yyyy-MM-dd'))
      .order('scheduled_for', { ascending: false })

    const completedDates = new Set(
      (lastSevenDays || [])
        .filter((t) => t.status === 'COMPLETED')
        .map((t) => t.scheduled_for)
    )

    let streak = 0
    for (let i = 0; i < 7; i++) {
      const checkDate = format(subDays(new Date(), i), 'yyyy-MM-dd')
      if (completedDates.has(checkDate)) {
        streak++
      } else {
        break
      }
    }

    // Get total completed tasks ever
    const { count: totalCompleted } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'COMPLETED')

    // Build final corpus
    const corpus: UserCorpus = {
      identity: {
        role: 'STUDENT',
        name: user.name || 'Student',
        age: user.age,
        school: user.school,
        grade: user.grade,
        tier: user.tier || 'FREE',
        onboarding_complete: user.onboarding_complete,
      },

      schedule: {
        daily_free_time_hours: user.schedule?.daily_free_time_hours || 2,
        free_time_slots: user.schedule?.free_time_slots,
        committed_hours: user.schedule?.committed_hours,
        preferred_study_times: user.schedule?.preferred_study_times,
      },

      goals: goalSnapshots,

      preferences: {
        tone_preference: user.tone_preference || 'friendly',
        language: user.schedule?.language || 'en',
        timezone: user.schedule?.timezone || 'UTC',
      },

      patterns: [], // ML-ready for future pattern detection

      recent_chat_context:
        goalSnapshots.length > 0
          ? {
              goalId: goalSnapshots[0].id,
              lastMessages: (recentChats || []).map((msg) => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.created_at,
              })),
            }
          : undefined,

      metadata: {
        last_updated: new Date().toISOString(),
        last_task_completed: lastCompleted?.[0]?.completion_timestamp || undefined,
        current_streak_days: streak,
        total_tasks_completed: totalCompleted || 0,
        average_daily_completion_rate: weeklyCompletionRate,
      },
    }

    return corpus
  } catch (error) {
    console.error('Error building user_corpus:', error)
    return null
  }
}

/**
 * Get or build user_corpus
 * First tries to load from users.user_corpus JSONB
 * If stale or missing, rebuilds from database
 */
export async function getUserCorpus(
  supabase: SupabaseClient,
  userId: string,
  forceRebuild = false
): Promise<UserCorpus | null> {
  try {
    if (!forceRebuild) {
      // Try to load cached corpus
      const { data: user } = await supabase
        .from('users')
        .select('user_corpus, user_corpus_updated_at')
        .eq('id', userId)
        .single()

      if (user?.user_corpus) {
        const lastUpdate = new Date(user.user_corpus_updated_at || 0)
        const now = new Date()
        const minutesOld = (now.getTime() - lastUpdate.getTime()) / (1000 * 60)

        // Use cache if less than 1 hour old
        if (minutesOld < 60) {
          return user.user_corpus as UserCorpus
        }
      }
    }

    // Rebuild corpus
    const corpus = await buildUserCorpus(supabase, userId)

    if (corpus) {
      // Cache it in database
      await supabase
        .from('users')
        .update({
          user_corpus: corpus,
          user_corpus_updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
    }

    return corpus
  } catch (error) {
    console.error('Error getting user_corpus:', error)
    return null
  }
}

/**
 * Invalidate corpus cache (call after significant updates)
 */
export async function invalidateUserCorpus(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    await supabase
      .from('users')
      .update({
        user_corpus_updated_at: new Date(0).toISOString(), // Force rebuild on next get
      })
      .eq('id', userId)
  } catch (error) {
    console.error('Error invalidating corpus:', error)
  }
}
