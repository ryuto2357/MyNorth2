// Database types
export interface User {
  id: string
  email: string
  name?: string
  age?: number
  school?: string
  grade?: string
  tier: 'FREE' | 'PREMIUM' | 'ACHIEVER'
  onboarding_complete: boolean
  inefficiency_score: number
  schedule?: {
    committed_hours?: string[]
    free_time_slots?: string[]
    daily_free_time_hours?: number
    preferred_study_times?: string[]
  }
  created_at: string
  updated_at: string
}

export interface Goal {
  id: string
  user_id: string
  title: string
  why?: string
  north_star?: string
  deadline?: string
  priority_rank: number
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  familiarity_baseline?: number
  hours_remaining?: number
  days_effective?: number
  completion_rate_history?: number
  current_achievement?: string
  created_at: string
  updated_at: string
}

export interface Node {
  id: string
  user_id: string
  goal_id: string
  parent_id?: string
  cluster_id?: string
  seniority_level: number
  label: string
  description?: string
  status: 'ACTIVE' | 'WITHERING' | 'ARCHIVED'
  familiarity_score: number
  position_x?: number
  position_y?: number
  created_at: string
  updated_at: string
}

export interface Link {
  id: string
  source_id: string
  target_id: string
  relation_type: 'PARENT_OF' | 'SYNAPSE' | 'REQUIRES' | 'BUILDS_ON'
  strength: number
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  node_id: string
  goal_id: string
  title: string
  description?: string
  duration_minutes: number
  scheduled_for?: string
  scheduled_time?: string
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'ARCHIVED'
  created_at: string
  updated_at: string
}

export interface ChatSession {
  id: string
  user_id: string
  goal_id: string
  created_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// Onboarding form types
export interface OnboardingData {
  name: string
  age: number
  school: string
  grade: string
  goal_title: string
  goal_why: string
  deadline: string
  familiarity_baseline: number
  daily_free_time_hours: number
  completion_rate_history: number
}
