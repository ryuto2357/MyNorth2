import type { DISCProfile } from '@/types'

// Signal word lists for each DISC quadrant
const D_SIGNALS = ['now', 'immediately', 'just do', 'let\'s go', 'next', 'hurry', 'asap', 'done', 'move on', 'skip']
const I_SIGNALS = ['awesome', 'amazing', 'love', 'excited', 'fun', 'great', 'wow', 'haha', 'lol', '!', '😊', '🎉', '❤️', 'cool', 'yay']
const S_SIGNALS = ['thank you', 'thanks', 'please', 'take your time', 'no rush', 'appreciate', 'kind', 'patient', 'sorry', 'understand']
const C_SIGNALS = ['specifically', 'exactly', 'how many', 'what percentage', 'data', 'detail', 'precise', 'numbers', 'evidence', 'source']

function countSignals(text: string, signals: string[]): number {
  const lower = text.toLowerCase()
  return signals.reduce((count, signal) => count + (lower.split(signal).length - 1), 0)
}

/**
 * Analyze recent chat messages and return an updated DISC profile.
 * Update is gradual: new = old × 0.95 + signal × 0.05
 */
export function inferDISCUpdate(
  currentProfile: DISCProfile,
  recentMessages: { role: string; content: string }[]
): DISCProfile {
  // Only analyze user messages
  const userMessages = recentMessages.filter(m => m.role === 'user')
  if (userMessages.length === 0) return currentProfile

  const allText = userMessages.map(m => m.content).join(' ')

  const dCount = countSignals(allText, D_SIGNALS)
  const iCount = countSignals(allText, I_SIGNALS)
  const sCount = countSignals(allText, S_SIGNALS)
  const cCount = countSignals(allText, C_SIGNALS)

  const total = dCount + iCount + sCount + cCount
  if (total === 0) return currentProfile

  // Normalize to 0-1
  const dNorm = dCount / total
  const iNorm = iCount / total
  const sNorm = sCount / total
  const cNorm = cCount / total

  // Map to 2D axes
  // task_people: D+C are task-focused, I+S are people-focused
  const taskSignal = (dNorm + cNorm) // high = task
  // fast_slow: D+I are fast-paced, S+C are slow-paced
  const fastSignal = (dNorm + iNorm) // high = fast

  // Gradual update: 95% old + 5% new signal
  const DECAY = 0.95
  const LEARNING = 0.05

  return {
    task_people: Math.max(0, Math.min(1, currentProfile.task_people * DECAY + taskSignal * LEARNING)),
    fast_slow: Math.max(0, Math.min(1, currentProfile.fast_slow * DECAY + fastSignal * LEARNING)),
  }
}

export interface DISCHistoryEntry {
  date: string
  task_people: number
  fast_slow: number
}

export interface DailyMinutesEntry {
  date: string
  minutes: number
}

export interface ToneNudge {
  task_people_delta: number
  fast_slow_delta: number
}

/**
 * Proactive tone optimization:
 * Correlates DISC snapshots with actual completion minutes over the last 14 days.
 * Returns a gentle nudge (±0.02) toward the higher-performing communication style.
 */
export function computeToneOptimization(
  history: DISCHistoryEntry[],
  logs: DailyMinutesEntry[]
): ToneNudge | null {
  if (history.length < 7 || logs.length < 7) return null

  // Create a map for quick log lookup
  const logMap = new Map<string, number>()
  logs.forEach((l) => logMap.set(l.date, l.minutes))

  // Group days by task_people axis
  const taskGroup = history.filter((h) => h.task_people > 0.5)
  const peopleGroup = history.filter((h) => h.task_people <= 0.5)

  // Group days by fast_slow axis
  const fastGroup = history.filter((h) => h.fast_slow > 0.5)
  const slowGroup = history.filter((h) => h.fast_slow <= 0.5)

  // Safety check: require at least 7 days in each group to nudge that axis
  let taskPeopleDelta = 0
  let fastSlowDelta = 0

  // 1. Optimize Task vs People
  if (taskGroup.length >= 7 && peopleGroup.length >= 7) {
    const avgTask = taskGroup.reduce((sum, h) => sum + (logMap.get(h.date) || 0), 0) / taskGroup.length
    const avgPeople = peopleGroup.reduce((sum, h) => sum + (logMap.get(h.date) || 0), 0) / peopleGroup.length

    if (avgTask > avgPeople * 1.15) {
      taskPeopleDelta = 0.02
    } else if (avgPeople > avgTask * 1.15) {
      taskPeopleDelta = -0.02
    }
  }

  // 2. Optimize Fast vs Slow
  if (fastGroup.length >= 7 && slowGroup.length >= 7) {
    const avgFast = fastGroup.reduce((sum, h) => sum + (logMap.get(h.date) || 0), 0) / fastGroup.length
    const avgSlow = slowGroup.reduce((sum, h) => sum + (logMap.get(h.date) || 0), 0) / slowGroup.length

    if (avgFast > avgSlow * 1.15) {
      fastSlowDelta = 0.02
    } else if (avgSlow > avgFast * 1.15) {
      fastSlowDelta = -0.02
    }
  }

  if (taskPeopleDelta === 0 && fastSlowDelta === 0) return null

  return {
    task_people_delta: taskPeopleDelta,
    fast_slow_delta: fastSlowDelta,
  }
}
