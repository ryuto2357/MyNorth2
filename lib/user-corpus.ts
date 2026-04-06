import { createServerClient } from './supabase-server'
import type {
  UserCorpus,
  GoalCorpus,
  SupervisorLinkCorpus,
  Schedule,
  PatternData,
  DISCProfile,
  ConstellationNodeSummary,
  NodeInteraction,
  AttemptedTaskYesterday,
} from '../types/index'

// ---------------------------------------------------------------------------
// DB row types — match Supabase table schemas exactly.
// Cast once at the query boundary; never use `any` inside mapping functions.
// ---------------------------------------------------------------------------

interface GoalRow {
  id: string
  title: string
  category?: string | null
  category_text?: string | null
  motivation_type?: string | null
  deadline_horizon?: string | null
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
  completion_rate_history?: number | null
  demonstrated_capacity_minutes?: number | null
}

interface NodeRow {
  id: string
  goal_id: string
  cluster_id?: string | null
  seniority_level: number
  label: string
  description?: string | null
  status: 'ACTIVE' | 'WITHERING' | 'ARCHIVED'
  familiarity_score: number
  last_accessed_at: string
}

interface SupervisorLinkRow {
  supervisor_id: string
  supervisor_role: 'PARENT' | 'COUNSELOR'
  consent_level: string
  // Supabase returns joined rows as an array even for single-row foreign key joins
  users: { name: string }[] | null
}

interface NodeInteractionRow {
  node_id: string
  interaction_type: 'VIEWED' | 'DISCUSSED' | 'APPLIED'
  created_at: string
  nodes: { label: string } | null
}

interface AttemptedTaskRow {
  id: string
  title: string
  duration_minutes: number
  node_id: string | null
}

/**
 * Assembles the complete UserCorpus object that Morgan reads at the start of
 * every session. Pulls data from multiple Supabase tables and returns the
 * structured JSON matching PRD Section 11.3.
 */
export async function buildUserCorpus(userId: string): Promise<UserCorpus> {
  const supabase = createServerClient()

  // Calculate yesterday's date range for attempted tasks query
  const yesterdayStart = new Date()
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  yesterdayStart.setHours(0, 0, 0, 0)

  const yesterdayEnd = new Date()
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)
  yesterdayEnd.setHours(23, 59, 59, 999)

  // Run all queries in parallel — they are independent
  const [userRes, goalsRes, nodesRes, linksRes, interactionsRes, attemptedTasksRes] = await Promise.all([
    // 1. Fetch user
    supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single(),

    // 2. Fetch active goals ordered by priority
    supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .order('priority_rank'),

    // 3. Fetch active and withering constellation nodes (summary only)
    supabase
      .from('nodes')
      .select('id, goal_id, cluster_id, seniority_level, label, description, status, familiarity_score, last_accessed_at')
      .eq('user_id', userId)
      .in('status', ['ACTIVE', 'WITHERING']),

    // 4. Fetch active supervisor links with supervisor name via join
    supabase
      .from('supervisor_links')
      .select('supervisor_id, supervisor_role, consent_level, users!supervisor_links_supervisor_id_fkey(name)')
      .eq('student_id', userId)
      .eq('status', 'ACTIVE'),

    // 5. Fetch last 10 node interactions with node labels
    supabase
      .from('node_interactions')
      .select('node_id, interaction_type, created_at, nodes!node_interactions_node_id_fkey(label)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),

    // 6. Fetch yesterday's attempted tasks
    supabase
      .from('tasks')
      .select('id, title, duration_minutes, node_id')
      .eq('user_id', userId)
      .eq('status', 'ATTEMPTED')
      .gte('updated_at', yesterdayStart.toISOString())
      .lte('updated_at', yesterdayEnd.toISOString()),
  ])

  const user = userRes.data
  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  // Cast once at the query boundary — row types defined above
  const goals = (goalsRes.data ?? []) as GoalRow[]
  const nodes = (nodesRes.data ?? []) as NodeRow[]
  const links = (linksRes.data ?? []) as SupervisorLinkRow[]
  const interactions = (interactionsRes.data ?? []) as unknown as NodeInteractionRow[]
  const attemptedTasks = (attemptedTasksRes.data ?? []) as AttemptedTaskRow[]

  // Build node interactions array
  const recentInteractions: NodeInteraction[] = interactions.map((i) => ({
    node_id: i.node_id,
    node_label: Array.isArray(i.nodes) ? i.nodes[0]?.label ?? 'Unknown node' : i.nodes?.label ?? 'Unknown node',
    interaction_type: i.interaction_type,
    created_at: i.created_at,
  }))

  // Build yesterday's attempted tasks array
  const attemptedTasksYesterday: AttemptedTaskYesterday[] = attemptedTasks.map((t) => ({
    task_id: t.id,
    title: t.title,
    duration_minutes: t.duration_minutes,
    node_id: t.node_id ?? undefined,
  }))

  // Build goals array matching GoalCorpus shape
  const goalCorpus: GoalCorpus[] = goals.map((g) => ({
    goal_id: g.id,
    title: g.title,
    why: g.why ?? undefined,
    north_star: g.north_star ?? undefined,
    deadline: g.deadline ?? undefined,
    priority_rank: g.priority_rank,
    status: g.status,
    familiarity_baseline: g.familiarity_baseline ?? undefined,
    hours_initial: g.hours_initial ?? undefined,
    hours_completed: g.hours_completed ?? 0,
    hours_override: g.hours_override ?? undefined,
    estimation_method: g.estimation_method ?? undefined,
    days_effective: g.days_effective ?? undefined,
    current_achievement: g.current_achievement ?? undefined,
    motivation_type: g.motivation_type ?? undefined,
    completion_rate_history: g.completion_rate_history ?? undefined,
    demonstrated_capacity_minutes: g.demonstrated_capacity_minutes ?? undefined,
  }))

  // Build constellation summary
  const clusterIds = [...new Set(
    nodes
      .map((n) => n.cluster_id)
      .filter((id): id is string => id != null)
  )]

  const lastUpdated = nodes.length > 0
    ? [...nodes].sort((a, b) => a.last_accessed_at.localeCompare(b.last_accessed_at)).at(-1)?.last_accessed_at
    : undefined

  // Build constellation nodes summary
  const constellationNodes: ConstellationNodeSummary[] = nodes.map((n) => ({
    id: n.id,
    goal_id: n.goal_id,
    cluster_id: n.cluster_id ?? undefined,
    seniority_level: n.seniority_level,
    label: n.label,
    description: n.description ?? undefined,
    status: n.status,
    familiarity_score: n.familiarity_score,
    last_accessed_at: n.last_accessed_at,
  }))

  // Build supervisor links with resolved names
  const supervisorLinks: SupervisorLinkCorpus[] = links.map((l) => ({
    supervisor_id: l.supervisor_id,
    supervisor_name: l.users?.[0]?.name ?? undefined,
    role: l.supervisor_role,
    consent_level: l.consent_level,
  }))

  // Parse JSONB fields with safe defaults
  const discProfile: DISCProfile = (user.disc_profile as DISCProfile) ?? {
    task_people: 0.5,
    fast_slow: 0.5,
  }

  const patterns: PatternData = (user.patterns as PatternData) ?? {}

  const schedule: Schedule = (user.schedule as Schedule) ?? {
    committed_hours: [],
    free_time_slots: [],
    daily_free_time_hours: 0,
    preferred_study_times: [],
    time_scarce: false,
  }

  const dailyMinutesLog: number[] = (user.daily_minutes_log as number[]) ?? []

  // Assemble the full UserCorpus
  const corpus: UserCorpus = {
    identity: {
      user_id: user.id,
      role: user.role ?? 'STUDENT',
      name: user.name ?? 'Student',
      age: user.age ?? undefined,
      school: user.school ?? undefined,
      grade: user.grade ?? undefined,
      tier: user.tier ?? 'TIER_1',
      primary_blocker: user.primary_blocker ?? undefined,
    },
    schedule,
    goals: goalCorpus,
    constellation: {
      node_count: nodes.length,
      cluster_ids: clusterIds,
      last_updated: lastUpdated,
      nodes: constellationNodes,
    },
    recent_node_interactions: recentInteractions,
    attempted_tasks_yesterday: attemptedTasksYesterday,
    supervisor_links: supervisorLinks,
    patterns,
    disc_profile: discProfile,
    onboarding_complete: user.onboarding_complete ?? false,
    demonstrated_capacity: user.demonstrated_capacity_minutes ?? 0,
    stretch_factor: user.stretch_factor ?? 1.1,
    i_gap: user.i_gap ?? 1.0,
    daily_minutes_log: dailyMinutesLog,
  }

  return corpus
}
