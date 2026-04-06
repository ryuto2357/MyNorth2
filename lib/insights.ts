import { chat } from './gemini'
import { createServerClient } from './supabase-server'

export interface InsightData {
  total_minutes_worked: number
  tasks_completed: number
  tasks_attempted: number
  tasks_skipped: number
  completion_rate: number
  avg_daily_minutes: number
  streak_days: number
  top_nodes: { label: string; minutes: number }[]
  withering_nodes: string[]
  familiarity_changes: { label: string; from: number; to: number }[]
  disc_shift: {
    task_people_start: number
    task_people_end: number
    fast_slow_start: number
    fast_slow_end: number
  }
}

export interface Insight {
  user_id: string
  period_type: 'WEEKLY' | 'MONTHLY'
  period_start: string
  period_end: string
  data: InsightData
  narrative: string
}

export async function computeInsights(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  periodType: 'WEEKLY' | 'MONTHLY',
  periodStart: string,
  periodEnd: string,
): Promise<Insight> {
  // 1. Fetch tasks in the period
  const { data: tasks } = await supabase
    .from('tasks')
    .select('duration_minutes, status, node_id, completed_at')
    .eq('user_id', userId)
    .gte('scheduled_for', periodStart)
    .lte('scheduled_for', periodEnd)

  const taskList = tasks ?? []
  const completed = taskList.filter((t: Record<string, unknown>) => t.status === 'COMPLETED')
  const attempted = taskList.filter((t: Record<string, unknown>) => t.status === 'ATTEMPTED')
  const skipped = taskList.filter((t: Record<string, unknown>) => t.status === 'SKIPPED')

  const totalMinutes = completed.reduce(
    (sum: number, t: Record<string, unknown>) => sum + ((t.duration_minutes as number) || 0),
    0,
  )
  const completionRate = taskList.length > 0 ? completed.length / taskList.length : 0

  // 2. Days in period and average
  const dayCount = Math.max(
    1,
    Math.ceil(
      (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000,
    ),
  )
  const avgDaily = totalMinutes / dayCount

  // 3. Fetch nodes for top-nodes and withering detection
  const { data: nodes } = await supabase
    .from('nodes')
    .select('id, label, familiarity_score, status')
    .eq('user_id', userId)

  const nodeMap = new Map<string, string>()
  for (const n of nodes ?? []) {
    nodeMap.set(n.id as string, n.label as string)
  }

  const nodeMinutes = new Map<string, number>()
  for (const t of completed) {
    const nodeId = (t as Record<string, unknown>).node_id as string
    if (nodeId) {
      nodeMinutes.set(nodeId, (nodeMinutes.get(nodeId) ?? 0) + ((t as Record<string, unknown>).duration_minutes as number || 0))
    }
  }

  const topNodes = [...nodeMinutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nodeId, minutes]) => ({ label: nodeMap.get(nodeId) ?? 'Unknown', minutes }))

  const witheringNodes = (nodes ?? [])
    .filter((n: Record<string, unknown>) => n.status === 'WITHERING')
    .map((n: Record<string, unknown>) => n.label as string)

  // 4. Fetch DISC history for shift detection
  const { data: user } = await supabase
    .from('users')
    .select('disc_history')
    .eq('id', userId)
    .single()

  const discHistory: { date: string; task_people: number; fast_slow: number }[] =
    Array.isArray(user?.disc_history) ? user.disc_history : []

  const periodDisc = discHistory.filter(
    (d: { date: string }) => d.date >= periodStart && d.date <= periodEnd,
  )
  const discShift =
    periodDisc.length >= 2
      ? {
          task_people_start: periodDisc[periodDisc.length - 1].task_people,
          task_people_end: periodDisc[0].task_people,
          fast_slow_start: periodDisc[periodDisc.length - 1].fast_slow,
          fast_slow_end: periodDisc[0].fast_slow,
        }
      : { task_people_start: 0.5, task_people_end: 0.5, fast_slow_start: 0.5, fast_slow_end: 0.5 }

  // 5. Streak (consecutive days with completed tasks, counting back from periodEnd)
  const completedDates = new Set(
    completed
      .filter((t: Record<string, unknown>) => t.completed_at)
      .map((t: Record<string, unknown>) =>
        new Date(t.completed_at as string).toISOString().slice(0, 10),
      ),
  )
  let streak = 0
  const endDate = new Date(periodEnd)
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(endDate)
    d.setUTCDate(d.getUTCDate() - i)
    if (completedDates.has(d.toISOString().slice(0, 10))) {
      streak++
    } else {
      break
    }
  }

  const data: InsightData = {
    total_minutes_worked: totalMinutes,
    tasks_completed: completed.length,
    tasks_attempted: attempted.length,
    tasks_skipped: skipped.length,
    completion_rate: Math.round(completionRate * 100) / 100,
    avg_daily_minutes: Math.round(avgDaily * 10) / 10,
    streak_days: streak,
    top_nodes: topNodes,
    withering_nodes: witheringNodes,
    familiarity_changes: [],
    disc_shift: discShift,
  }

  // 6. Gemini narrative summary
  let narrative: string
  try {
    narrative = await chat(
      [
        {
          role: 'user',
          content: `Generate a brief, encouraging ${periodType.toLowerCase()} progress summary for a student based on this data:\n${JSON.stringify(data, null, 2)}\n\nKeep it under 150 words. Be specific about numbers. Highlight what went well and one thing to improve. Do not use filler phrases.`,
        },
      ],
      'You are Morgan, a supportive AI study coach. Write in second person ("you"). Be concise and specific.',
    )
  } catch {
    narrative = `This ${periodType.toLowerCase()} you completed ${completed.length} tasks (${Math.round(completionRate * 100)}% completion rate) for a total of ${totalMinutes} minutes of focused work.`
  }

  return {
    user_id: userId,
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    data,
    narrative,
  }
}
