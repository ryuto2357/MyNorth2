// ============================================================================
// Shared TypeScript types for MyNorth
// Import from '@/types' or '../types/index'
// ============================================================================

// ── DISC Profile ─────────────────────────────────────────────────────────────

export interface DISCProfile {
  task_people: number  // 0 = people-focus, 1 = task-focus
  fast_slow: number    // 0 = slow/methodical, 1 = fast/direct
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export interface Schedule {
  committed_hours: string[]
  free_time_slots: string[]
  daily_free_time_hours: number
  preferred_study_times: string[]
  time_scarce: boolean
}

// ── Pattern Data ─────────────────────────────────────────────────────────────

export interface PatternData {
  time_patterns?: string | null
  avoidance_patterns?: string | null
  emotional_patterns?: string | null
  learning_style?: string | null
  communication_effectiveness?: string | null
}

// ── Goal (frontend + corpus use) ─────────────────────────────────────────────

export interface Goal {
  id: string
  user_id: string
  title: string
  why?: string | null
  north_star?: string | null
  deadline?: string | null
  priority_rank: number
  status: string
  familiarity_baseline?: number | null
  hours_initial?: number | null
  hours_completed?: number | null
  hours_override?: number | null
  estimation_method?: string | null
  days_effective?: number | null
  current_achievement?: string | null
  motivation_type?: string | null
  category?: string | null
  category_text?: string | null
  deadline_horizon?: string | null
  completion_rate_history?: number | null
  demonstrated_capacity_minutes?: number | null
  created_at?: string
  updated_at?: string
}

// ── Task (frontend + corpus use) ─────────────────────────────────────────────

export interface Task {
  id: string
  user_id: string
  goal_id: string
  node_id?: string | null
  game_plan_node_id?: string | null
  title: string
  description?: string | null
  duration_minutes?: number | null
  completion_definition?: string | null
  scheduled_for?: string | null
  scheduled_time?: string | null
  status: string
  completed_at?: string | null
  created_at?: string
  updated_at?: string
}

// ── User (frontend use) ───────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name?: string | null
  age?: number | null
  school?: string | null
  grade?: string | null
  role?: string | null
  tier?: string | null
  onboarding_complete?: boolean | null
  schedule?: Schedule | null
  disc_profile?: DISCProfile | null
  patterns?: PatternData | null
  daily_minutes_log?: number[] | null
  demonstrated_capacity_minutes?: number | null
  i_gap?: number | null
  stretch_factor?: number | null
  gate_pace?: number | null
  pace_gap?: number | null
  gates_cleared_log?: Record<string, unknown>[] | null
  primary_blocker?: string | null
  created_at?: string
  updated_at?: string
}

// ── Corpus types (used by buildUserCorpus → Morgan) ──────────────────────────

export interface GoalCorpus {
  goal_id: string
  title: string
  why?: string
  north_star?: string
  deadline?: string
  priority_rank: number
  status: string
  familiarity_baseline?: number
  hours_initial?: number
  hours_completed?: number
  hours_override?: number
  estimation_method?: string
  days_effective?: number
  current_achievement?: string
  motivation_type?: string
  completion_rate_history?: number
  demonstrated_capacity_minutes?: number
}

export interface ConstellationNodeSummary {
  id: string
  goal_id: string
  cluster_id?: string
  seniority_level: number
  label: string
  description?: string
  status: 'ACTIVE' | 'WITHERING' | 'ARCHIVED'
  familiarity_score: number
  last_accessed_at: string
}

export interface NodeInteraction {
  node_id: string
  node_label: string
  interaction_type: 'VIEWED' | 'DISCUSSED' | 'APPLIED'
  created_at: string
}

export interface AttemptedTaskYesterday {
  task_id: string
  title: string
  duration_minutes: number
  node_id?: string
}

export interface SupervisorLinkCorpus {
  supervisor_id: string
  supervisor_name?: string
  role: 'PARENT' | 'COUNSELOR'
  consent_level: string
}

export interface UserCorpus {
  identity: {
    user_id: string
    role: string
    name: string
    age?: number
    school?: string
    grade?: string
    tier: string
    primary_blocker?: string
  }
  schedule: Schedule
  goals: GoalCorpus[]
  constellation: {
    node_count: number
    cluster_ids: string[]
    last_updated?: string
    nodes: ConstellationNodeSummary[]
  }
  recent_node_interactions: NodeInteraction[]
  attempted_tasks_yesterday: AttemptedTaskYesterday[]
  supervisor_links: SupervisorLinkCorpus[]
  patterns: PatternData
  disc_profile: DISCProfile
  onboarding_complete: boolean
  demonstrated_capacity: number
  stretch_factor: number
  i_gap: number
  daily_minutes_log: number[]
}

// ── Game Plan types (Outcome-Based Execution Engine) ─────────────────────────

export interface GamePlanNode {
  id: string
  user_id: string
  goal_id: string
  parent_id?: string | null
  title: string
  completion_definition: string
  gate_type: 'ACHIEVEMENT' | 'MILESTONE' | 'SKILL' | 'TASK'
  status: 'LOCKED' | 'UNLOCKED' | 'ATTEMPTED' | 'COMPLETED'
  prerequisite_ids: string[]
  order_index: number
  confidence: 'HIGH' | 'LOW'
  source_url?: string | null
  created_at?: string
  updated_at?: string
}

export interface GamePlanLink {
  id: string
  source_id: string
  target_id: string
  relation_type: 'PARENT_OF' | 'REQUIRES' | 'BUILDS_ON'
  created_at?: string
}

export interface GamePlanNodeSummary {
  id: string
  title: string
  completion_definition: string
  gate_type: 'ACHIEVEMENT' | 'MILESTONE' | 'SKILL' | 'TASK'
  status: 'LOCKED' | 'UNLOCKED' | 'ATTEMPTED' | 'COMPLETED'
  prerequisite_ids: string[]
}
