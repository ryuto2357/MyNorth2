/**
 * User Corpus Schema
 *
 * Represents complete student context for:
 * - Morgan's system prompt injection
 * - Workload engine calculations
 * - Multi-goal arbitration
 * - Counselor analytics
 * - Crisis detection
 */

export interface UserIdentity {
  role: 'STUDENT' | 'COUNSELOR' | 'PARENT'
  name: string
  age?: number
  school?: string
  grade?: string
  tier: 'FREE' | 'PREMIUM' | 'ACHIEVER'
  onboarding_complete: boolean
}

export interface Schedule {
  daily_free_time_hours: number
  free_time_slots?: string[] // e.g., ["09:00-12:00", "14:00-18:00"]
  committed_hours?: string[] // e.g., ["School", "Sports"]
  preferred_study_times?: string[] // e.g., ["morning", "afternoon"]
  study_start_time?: string // e.g., "09:00"
  study_end_time?: string // e.g., "21:00"
}

export interface GoalSnapshot {
  id: string
  title: string
  why: string
  deadline: string
  priority_rank: number
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  familiarity_baseline: number
  days_remaining: number
  hours_remaining: number
  hours_completed: number
  completion_rate_history: number
  current_achievement?: string
  inefficiency_score?: number
}

export interface Preferences {
  tone_preference: 'straightforward' | 'friendly' | 'supportive'
  language?: string
  timezone?: string
  notifications_enabled?: boolean
  show_workload_calculations?: boolean
}

export interface Pattern {
  type: string // 'time_pattern', 'avoidance_pattern', 'learning_style', 'energy_level'
  description: string
  confidence: number // 0-1
  last_observed?: string
}

export interface UserCorpus {
  // Core identity
  identity: UserIdentity

  // Time & availability
  schedule: Schedule

  // All goals (snapshot)
  goals: GoalSnapshot[]

  // Student preferences
  preferences: Preferences

  // Detected patterns (ML-ready for future)
  patterns: Pattern[]

  // Recent history for context (RAG)
  recent_chat_context?: {
    goalId: string
    lastMessages: Array<{
      role: 'user' | 'assistant'
      content: string
      timestamp: string
    }>
  }

  // Streaming metadata (updated regularly)
  metadata: {
    last_updated: string
    last_task_completed?: string
    last_hard_day?: string
    current_streak_days: number
    total_tasks_completed: number
    average_daily_completion_rate: number
  }
}

/**
 * Minimal Corpus (for quick updates)
 * Used when we don't need full context - just update a specific field
 */
export interface UserCorpusUpdate {
  identity?: Partial<UserIdentity>
  schedule?: Partial<Schedule>
  goals?: GoalSnapshot[]
  preferences?: Partial<Preferences>
  patterns?: Pattern[]
  metadata?: Partial<UserCorpus['metadata']>
}
