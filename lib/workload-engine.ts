/**
 * MyNorth Workload Engine — Full 12-Stage Pipeline
 *
 * Implements PRD Section 15 (Workload Engine) and Section 16 (Capacity Model).
 * The backend computes every number. Morgan receives those numbers as constraints
 * and generates the task CONTENT. Morgan never calculates L_daily, task_count,
 * or daily_budget_minutes herself.
 *
 * Pipeline: Stages 1-8 compute daily workload, Stage 12 handles task completion.
 * Stages 9-11 (prompt construction, Morgan generation, calendar injection) are
 * handled by other modules.
 *
 * All L_daily calculations are in MINUTES internally.
 * H_remaining is stored in HOURS — convert with h_remaining * 60.
 */

// ---------------------------------------------------------------------------
// Types — defined locally for now; will be imported from @/types once P0.13 lands
// ---------------------------------------------------------------------------

/** Goal record from the goals table */
export interface Goal {
  id: string;
  user_id: string;
  title: string;
  why?: string;
  north_star?: string;
  deadline?: string;
  priority_rank: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  familiarity_baseline?: number;
  hours_initial?: number;
  hours_completed?: number;
  hours_override?: number | null;
  estimation_method?: string;
  i_gap?: number;
  current_achievement?: string;
  goal_category?: string;
  subcategory?: string | null;
  completion_rate_history?: number;
  created_at: string;
  updated_at: string;
}

/** Reference hours lookup row (Layer 1 of H_remaining estimation) */
export interface ReferenceHours {
  goal_category: string;
  subcategory?: string | null;
  hours_novice: number;
  hours_intermediate: number;
  hours_advanced: number;
  source?: string;
}

/** Budget allocation for a single goal in multi-goal arbitration */
export interface GoalBudget {
  goal_id: string;
  title: string;
  priority_rank: number;
  raw_weight: number;
  deadline_modifier: number;
  normalized_weight: number;
  budget_minutes: number;
}

/** Full result from the workload pipeline */
export interface WorkloadResult {
  // Stage 1
  h_remaining_hours: number;
  estimation_method: string;

  // Stage 2
  d_effective: number;

  // Stage 3
  demonstrated_capacity: number;
  today_modifier: number;
  l_capacity: number;

  // Stage 4
  l_required: number;
  l_daily: number;
  i_gap: number;

  // Stage 5
  mode: 'NORMAL' | 'MERCY';

  // Stage 7
  daily_budget_minutes: number;

  // Stage 8
  task_count: number;
  minutes_per_task: number;
  remainder: number;

  // Multi-goal (only populated by runFullWorkloadEngine)
  goal_budgets?: GoalBudget[];
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Round to nearest 0.5 (for hours). PRD: round_to_nearest_0.5 */
function roundToNearestHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Round to nearest 5 (for minutes). PRD: round_to_nearest_5 */
function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5;
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculate the median of a numeric array.
 * For even-length arrays, averages the two middle values.
 * Returns 0 for empty arrays.
 */
export function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Stage 3: Demonstrated Capacity
 * measured as the median of actual daily minutes worked over the past 14 days.
 */
export async function calculateDemonstratedCapacity(userId: string, supabase: any): Promise<number> {
  // 1. Fetch user to check current log
  const { data: user } = await supabase.from('users').select('daily_minutes_log').eq('id', userId).single();
  
  if (user?.daily_minutes_log && Array.isArray(user.daily_minutes_log)) {
    // If it's a simple number array, we can use it directly
    // If it's the newer {date, minutes} objects, we extract minutes
    const logs = user.daily_minutes_log.map((entry: any) => typeof entry === 'number' ? entry : entry.minutes);
    if (logs.length > 0) {
      return calculateMedian(logs.slice(-14));
    }
  }

  // Fallback: Calculate from tasks if log is empty
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const { data: tasks } = await supabase
    .from('tasks')
    .select('duration_minutes, completed_at, updated_at, status')
    .eq('user_id', userId)
    .in('status', ['COMPLETED', 'ATTEMPTED'])
    .gte('completed_at', fourteenDaysAgo.toISOString());

  if (!tasks || tasks.length === 0) return 0;

  // Aggregate by day to get daily totals (ATTEMPTED = 50% credit)
  const dailyMap: Record<string, number> = {};
  tasks.forEach((t: any) => {
    const dateStr = t.completed_at?.split('T')[0] ?? t.updated_at?.split('T')[0]
    if (!dateStr) return
    const credit = t.status === 'ATTEMPTED'
      ? (t.duration_minutes || 0) * 0.5
      : (t.duration_minutes || 0)
    dailyMap[dateStr] = (dailyMap[dateStr] || 0) + credit
  });

  // Sort values by date before median calculation
  const values = Object.keys(dailyMap).sort().map(day => dailyMap[day]);
  return calculateMedian(values);
}

/**
 * Calculate the number of calendar days between two ISO date strings.
 * Returns the difference in whole days (deadline - today).
 */
function daysBetween(todayISO: string, deadlineISO: string): number {
  const today = new Date(todayISO);
  const deadline = new Date(deadlineISO);
  // Zero out time components for clean day difference
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  const diffMs = deadline.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Get today's date as an ISO string (YYYY-MM-DD) */
function todayISO(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// STAGE 1: H_remaining Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate hours remaining for a goal.
 *
 * PRD Section 15, Stage 1 — Priority order:
 *   1. Counselor Override (hours_override on goal — ALWAYS WINS if set)
 *   2. Reference Database (Layer 1 — interpolation from reference_hours table)
 *   3. Decomposition (Layer 3 — sum of atomic habits × 1.15 buffer) — handled by Morgan, not here
 *   4. Self-Report (Layer 4 — correction factor applied to student estimate) — handled externally
 *
 * This function handles Layers 1 and 2 (the pure-math layers the backend owns).
 * Layers 3 and 4 require Morgan interaction and are set externally on the goal.
 *
 * If the goal already has hours_initial and hours_completed, the effective
 * H_remaining is: COALESCE(hours_override, hours_initial - hours_completed).
 *
 * @returns H_remaining in hours (minimum 1.0, rounded to nearest 0.5)
 */
export function estimateHRemaining(params: {
  goal: Goal;
  referenceHours?: ReferenceHours | null;
}): number {
  const { goal, referenceHours } = params;

  // Layer 2: Counselor Override — ALWAYS WINS if set
  if (goal.hours_override != null) {
    return Math.max(1.0, roundToNearestHalf(goal.hours_override));
  }

  // If we already have hours tracked, compute effective remaining
  if (goal.hours_initial != null && goal.hours_completed != null) {
    const remaining = goal.hours_initial - goal.hours_completed;
    return Math.max(1.0, roundToNearestHalf(remaining));
  }

  // Layer 1: Reference Database — interpolation based on familiarity_baseline
  if (referenceHours) {
    const f = clamp(goal.familiarity_baseline ?? 0, 0, 10);
    let hRemaining: number;

    if (f <= 3) {
      // Novice → Intermediate interpolation
      hRemaining =
        referenceHours.hours_novice +
        (f / 3) * (referenceHours.hours_intermediate - referenceHours.hours_novice);
    } else if (f <= 7) {
      // Intermediate → Advanced interpolation
      hRemaining =
        referenceHours.hours_intermediate +
        ((f - 3) / 4) * (referenceHours.hours_advanced - referenceHours.hours_intermediate);
    } else {
      // Advanced → near-zero (f 7-10)
      hRemaining = referenceHours.hours_advanced * (1 - (f - 7) / 3);
    }

    return Math.max(1.0, roundToNearestHalf(hRemaining));
  }

  // If we have hours_remaining set from a prior estimation (Layer 3 or 4)
  if (goal.hours_initial != null) {
    return Math.max(1.0, roundToNearestHalf(goal.hours_initial));
  }

  // Fallback: no data at all — return 1.0 (minimum).
  // This should not happen in practice; the pipeline should not run without H_remaining.
  return 1.0;
}

// ---------------------------------------------------------------------------
// STAGE 2: D_effective Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate effective days remaining until the deadline.
 *
 * PRD Section 15, Stage 2:
 *   D_calendar = (deadline - today) in days
 *   D_effective = D_calendar - blocked_days
 *   D_effective = max(1, D_effective)
 *
 * @param deadline - ISO 8601 date string (e.g. "2026-06-01")
 * @param blockedDays - Number of days where daily_free_time_hours == 0. Default 0.
 * @returns D_effective (minimum 1)
 */
export function calculateDEffective(deadline: string, blockedDays: number = 0): number {
  const dCalendar = daysBetween(todayISO(), deadline);
  const dEffective = dCalendar - blockedDays;
  return Math.max(1, dEffective);
}

// ---------------------------------------------------------------------------
// STAGE 3: Demonstrated Capacity
// ---------------------------------------------------------------------------

/**
 * Calculate the student's demonstrated capacity and today's capacity limit.
 *
 * PRD Section 15, Stage 3 — Demonstrated Capacity model:
 *
 * demonstrated_capacity = median(actual_minutes_worked, past 14 days)
 *
 * COLD START (< 14 data points):
 *   demonstrated_capacity = daily_free_time_hours × completion_rate × 60
 *
 * today_modifier = min(1.0, today_free_time / avg_free_time_14d)
 *   Range: [0.0, 1.0] — never assigns MORE than demonstrated capacity
 *
 * stretch_factor: adaptive [1.0, 1.25], default 1.10
 *   Gentle upward pressure (Zone of Proximal Development)
 *
 * L_capacity = demonstrated_capacity × today_modifier × stretch_factor
 */
export function calculateCapacity(params: {
  daily_minutes_log: number[];
  daily_free_time_hours: number;
  today_free_time_hours: number;
  stretch_factor: number;
  completion_rate_history?: number;
}): {
  demonstrated_capacity: number;
  today_modifier: number;
  l_capacity: number;
} {
  const {
    daily_minutes_log,
    daily_free_time_hours,
    today_free_time_hours,
    stretch_factor,
    completion_rate_history,
  } = params;

  // Clamp stretch_factor to valid range [1.0, 1.25]
  const clampedStretch = clamp(stretch_factor, 1.0, 1.25);

  let demonstrated_capacity: number;

  if (daily_minutes_log.length < 14) {
    // COLD START: use self-reported completion rate and free time
    // PRD: demonstrated_capacity = daily_free_time_hours × completion_rate_self_report × 60
    const completionRate = completion_rate_history ?? 0.6;
    demonstrated_capacity = daily_free_time_hours * completionRate * 60;
  } else {
    // Use the last 14 days of actual data
    const last14 = daily_minutes_log.slice(-14);
    demonstrated_capacity = calculateMedian(last14);
  }

  // Ensure demonstrated_capacity is at least 1 minute to avoid division by zero
  demonstrated_capacity = Math.max(1, demonstrated_capacity);

  // today_modifier: ratio of today's free time to average free time
  // PRD: today_modifier = min(1.0, today_free_time / avg_free_time_14d)
  // For cold start (< 14 days of schedule data), use daily_free_time_hours as avg
  const avgFreeTime = daily_free_time_hours > 0 ? daily_free_time_hours : 1;
  const today_modifier = Math.min(1.0, today_free_time_hours / avgFreeTime);

  // L_capacity = demonstrated_capacity × today_modifier × stretch_factor
  const l_capacity = demonstrated_capacity * today_modifier * clampedStretch;

  return {
    demonstrated_capacity,
    today_modifier,
    l_capacity,
  };
}

// ---------------------------------------------------------------------------
// STAGE 4: L_daily + I_gap
// ---------------------------------------------------------------------------

/**
 * Calculate the daily workload and gap diagnostic.
 *
 * PRD Section 15, Stage 4:
 *   L_required = H_remaining_minutes / D_effective  (what the goal needs per day)
 *   L_daily    = min(L_required, L_capacity)         (assign the lower)
 *   I_gap      = L_required / L_capacity             (diagnostic, never shown to student)
 *
 * I_gap thresholds (for Honesty Engine, handled by Morgan):
 *   < 1.2  → on track
 *   1.2–1.5 → gentle flag
 *   1.5–2.0 → direct flag
 *   > 2.0   → blunt
 *
 * @param h_remaining_hours - Total hours remaining (will be converted to minutes)
 * @param d_effective - Effective days remaining
 * @param l_capacity - Student's capacity for today (minutes)
 */
export function calculateLDaily(params: {
  h_remaining_hours: number;
  d_effective: number;
  l_capacity: number;
}): {
  l_daily: number;
  l_required: number;
  i_gap: number;
} {
  const { h_remaining_hours, d_effective, l_capacity } = params;

  // Convert hours to minutes for internal calculation
  const h_remaining_minutes = h_remaining_hours * 60;

  // L_required: what the goal needs per day (in minutes)
  const l_required = h_remaining_minutes / d_effective;

  // L_daily: assign the lower of what's needed and what the student can handle
  const l_daily = Math.min(l_required, l_capacity);

  // I_gap: diagnostic ratio — how far behind the student is
  // Guard against division by zero (l_capacity should be >= 1 from Stage 3)
  const i_gap = l_capacity > 0 ? l_required / l_capacity : Infinity;

  return {
    l_daily,
    l_required,
    i_gap,
  };
}

// ---------------------------------------------------------------------------
// STAGE 5: Safety Valves
// ---------------------------------------------------------------------------

/**
 * Apply safety valves to protect against overload.
 *
 * PRD Section 15, Stage 5:
 *
 * Human Ceiling:
 *   If L_daily > 210 min (3.5 hours), cap at 210.
 *   PRD says "if L_daily > 4.0 hours → L_daily = 3.5 hours" — the 4.0hr trigger
 *   caps down to 3.5hr (210 min).
 *
 * Mercy Rule:
 *   If D_effective < 5 AND L_daily > 360 min (6 hours) → MERCY mode (crunch).
 *   Show ONLY critical path tasks.
 *
 * Hard Day Protocol:
 *   Override to 5 min, 1 task — triggered EXTERNALLY (not computed here).
 *   The caller sets this based on student behavioral signals.
 */
export function applySafetyValves(params: {
  l_daily: number;
  d_effective: number;
}): {
  l_daily: number;
  mode: 'NORMAL' | 'MERCY';
} {
  let { l_daily, d_effective } = params;
  let mode: 'NORMAL' | 'MERCY' = 'NORMAL';

  // Mercy Rule: D_effective < 5 AND L_daily > 360 min (6 hours)
  if (d_effective < 5 && l_daily > 360) {
    mode = 'MERCY';
    // In Mercy mode, cap at 210 (Human Ceiling still applies)
    l_daily = Math.min(l_daily, 210);
  }

  // Human Ceiling: always enforce regardless of mode
  // PRD: if L_daily > 4.0 hours (240 min), cap at 3.5 hours (210 min)
  if (l_daily > 240) {
    l_daily = 210;
  }

  return { l_daily, mode };
}

// ---------------------------------------------------------------------------
// STAGE 6: Multi-Goal Arbitration
// ---------------------------------------------------------------------------

/**
 * Allocate the daily time budget across multiple active goals.
 *
 * PRD Section 14.5 + Section 15, Stage 6:
 *
 * Only runs if 2+ active goals.
 *
 * Default weights by priority rank:
 *   Rank 1 = 0.55, Rank 2 = 0.30, Rank 3 = 0.15
 *   Rank 4+ = Rank 3's weight redistributed evenly among rank 3+
 *
 * Deadline urgency modifiers:
 *   ≤14 days  = 1.4 (crunch)
 *   15-30 days = 1.2 (elevated)
 *   31-90 days = 1.0 (standard)
 *   >90 days   = 0.85 (reduce)
 *
 * Process:
 *   1. Assign raw weight based on priority_rank
 *   2. Multiply by deadline urgency modifier
 *   3. Normalize so weights sum to 1.0
 *   4. Multiply each normalized weight by daily_budget_minutes
 */
export function allocateGoalBudgets(params: {
  goals: Array<{
    goal_id: string;
    title: string;
    priority_rank: number;
    deadline?: string;
  }>;
  daily_budget_minutes: number;
}): GoalBudget[] {
  const { goals, daily_budget_minutes } = params;

  if (goals.length === 0) return [];
  if (goals.length === 1) {
    const g = goals[0];
    return [
      {
        goal_id: g.goal_id,
        title: g.title,
        priority_rank: g.priority_rank,
        raw_weight: 1.0,
        deadline_modifier: 1.0,
        normalized_weight: 1.0,
        budget_minutes: daily_budget_minutes,
      },
    ];
  }

  // Sort by priority_rank ascending
  const sorted = [...goals].sort((a, b) => a.priority_rank - b.priority_rank);

  // Step 1: Assign raw weights based on priority rank
  const DEFAULT_WEIGHTS = [0.55, 0.30, 0.15];

  const rawWeights: number[] = sorted.map((_, i) => {
    if (i < 2) {
      // Ranks 1 and 2 get fixed weights
      return DEFAULT_WEIGHTS[i];
    }
    // Rank 3+ share the 0.15 weight evenly
    const rank3PlusCount = sorted.length - 2;
    return DEFAULT_WEIGHTS[2] / rank3PlusCount;
  });

  // Step 2: Calculate deadline urgency modifier for each goal
  const today = todayISO();
  const deadlineModifiers: number[] = sorted.map((g) => {
    if (!g.deadline) return 1.0;
    const daysRemaining = daysBetween(today, g.deadline);
    if (daysRemaining <= 14) return 1.4;
    if (daysRemaining <= 30) return 1.2;
    if (daysRemaining <= 90) return 1.0;
    return 0.85;
  });

  // Step 3: Multiply raw weight by deadline modifier, then normalize
  const adjustedWeights = rawWeights.map((w, i) => w * deadlineModifiers[i]);
  const totalAdjusted = adjustedWeights.reduce((sum, w) => sum + w, 0);
  const normalizedWeights = adjustedWeights.map((w) =>
    totalAdjusted > 0 ? w / totalAdjusted : 1 / sorted.length
  );

  // Step 4: Allocate budget minutes
  return sorted.map((g, i) => ({
    goal_id: g.goal_id,
    title: g.title,
    priority_rank: g.priority_rank,
    raw_weight: rawWeights[i],
    deadline_modifier: deadlineModifiers[i],
    normalized_weight: normalizedWeights[i],
    budget_minutes: Math.round(normalizedWeights[i] * daily_budget_minutes),
  }));
}

// ---------------------------------------------------------------------------
// STAGE 7: Daily Budget (minutes)
// ---------------------------------------------------------------------------

/**
 * Calculate the daily budget in minutes, rounded and clamped.
 *
 * PRD Section 15, Stage 7:
 *   daily_budget_minutes = round_to_nearest_5(L_daily)
 *   Clamp: min 5 (Hard Day Protocol floor), max 210 (3.5 hours ceiling)
 */
export function calculateDailyBudget(l_daily: number): number {
  let budget = roundToNearest5(l_daily);
  budget = clamp(budget, 5, 210);
  return budget;
}

// ---------------------------------------------------------------------------
// STAGE 8: Task Count
// ---------------------------------------------------------------------------

/**
 * Calculate the number of tasks and per-task duration.
 *
 * PRD Section 15, Stage 8:
 *   task_count = ceil(daily_budget_minutes / 20)
 *   Clamp: min 1, max 11
 *   minutes_per_task = floor(daily_budget_minutes / task_count)
 *   remainder = daily_budget_minutes - (minutes_per_task × task_count)
 *   First {remainder} tasks get +1 minute each
 */
export function calculateTaskCount(dailyBudgetMinutes: number): {
  task_count: number;
  minutes_per_task: number;
  remainder: number;
} {
  let taskCount = Math.ceil(dailyBudgetMinutes / 20);
  taskCount = clamp(taskCount, 1, 11);

  const minutesPerTask = Math.floor(dailyBudgetMinutes / taskCount);
  const remainder = dailyBudgetMinutes - minutesPerTask * taskCount;

  return {
    task_count: taskCount,
    minutes_per_task: minutesPerTask,
    remainder,
  };
}

// ---------------------------------------------------------------------------
// STAGE 12: Task Completion Processing
// ---------------------------------------------------------------------------

/**
 * Process a single task completion event.
 *
 * PRD Section 15, Stage 12:
 *
 * 1. Calculate hours_deducted:
 *    - COMPLETED: full duration
 *    - ATTEMPTED: 50% of duration (effort matters)
 *    - SKIPPED: 0
 *
 * 2. Update demonstrated_capacity (14-day rolling median)
 *
 * 3. Update stretch_factor based on consecutive day performance:
 *    - >80% of target for 7 consecutive days → +0.02 (max 1.25)
 *    - <50% of target for 3 consecutive days → -0.05 (min 1.0)
 *    Pull-back is faster than push-forward to prevent burnout spirals.
 *
 * @returns Updated metrics after processing
 */
export function processTaskCompletion(params: {
  task_duration_minutes: number;
  task_status: 'COMPLETED' | 'ATTEMPTED' | 'SKIPPED';
  current_hours_completed: number;
  daily_minutes_log: number[];
  current_stretch_factor: number;
  consecutive_days_above_80: number;
  consecutive_days_below_50: number;
}): {
  hours_deducted: number;
  new_hours_completed: number;
  new_demonstrated_capacity: number;
  new_stretch_factor: number;
  actual_minutes_credit: number;
} {
  const {
    task_duration_minutes,
    task_status,
    current_hours_completed,
    daily_minutes_log,
    current_stretch_factor,
    consecutive_days_above_80,
    consecutive_days_below_50,
  } = params;

  // 1. Calculate credit based on task status
  let actual_minutes_credit: number;
  switch (task_status) {
    case 'COMPLETED':
      actual_minutes_credit = task_duration_minutes;
      break;
    case 'ATTEMPTED':
      actual_minutes_credit = task_duration_minutes * 0.5;
      break;
    case 'SKIPPED':
      actual_minutes_credit = 0;
      break;
  }

  // Hours deducted from H_remaining (COMPLETED gets full credit, ATTEMPTED 50%, SKIPPED 0)
  const hours_deducted = actual_minutes_credit / 60;
  const new_hours_completed = current_hours_completed + hours_deducted;

  // 2. Update demonstrated_capacity (14-day rolling median)
  // The caller is responsible for accumulating today's total minutes into daily_minutes_log
  // at end of day. Here we compute the new median from whatever log is provided.
  const last14 = daily_minutes_log.slice(-14);
  const new_demonstrated_capacity = last14.length > 0 ? calculateMedian(last14) : 0;

  // 3. Update stretch_factor
  let new_stretch_factor = current_stretch_factor;

  // >80% of target for 7 consecutive days → stretch_factor += 0.02
  if (consecutive_days_above_80 >= 7) {
    new_stretch_factor = Math.min(new_stretch_factor + 0.02, 1.25);
  }

  // <50% of target for 3 consecutive days → stretch_factor -= 0.05
  // Pull-back is faster than push-forward (0.05 vs 0.02) — prevents burnout spirals
  if (consecutive_days_below_50 >= 3) {
    new_stretch_factor = Math.max(new_stretch_factor - 0.05, 1.0);
  }

  return {
    hours_deducted,
    new_hours_completed,
    new_demonstrated_capacity,
    new_stretch_factor,
    actual_minutes_credit,
  };
}

// ---------------------------------------------------------------------------
// FULL PIPELINE — Single Goal
// ---------------------------------------------------------------------------

/**
 * Run stages 1-8 for a single goal.
 *
 * PRD Section 15 — complete single-goal pipeline:
 *   Stage 1: H_remaining estimation
 *   Stage 2: D_effective calculation
 *   Stage 3: Demonstrated capacity + today_modifier + stretch_factor
 *   Stage 4: L_daily + I_gap
 *   Stage 5: Safety valves
 *   Stage 7: Daily budget (minutes, rounded + clamped)
 *   Stage 8: Task count
 *
 * Stage 6 (multi-goal arbitration) is skipped for single-goal runs.
 * Stages 9-11 are handled by Morgan and calendar modules.
 */
export function runWorkloadPipeline(params: {
  goal: Goal;
  user: {
    daily_minutes_log: number[];
    daily_free_time_hours: number;
    today_free_time_hours: number;
    stretch_factor: number;
    completion_rate_history?: number;
  };
  referenceHours?: ReferenceHours | null;
}): WorkloadResult {
  const { goal, user, referenceHours } = params;

  // Stage 1: H_remaining
  const h_remaining_hours = estimateHRemaining({
    goal,
    referenceHours: referenceHours ?? null,
  });
  const estimation_method = goal.hours_override != null
    ? 'COUNSELOR_OVERRIDE'
    : referenceHours
      ? 'REFERENCE_DB'
      : goal.estimation_method ?? 'UNKNOWN';

  // Stage 2: D_effective
  const d_effective = goal.deadline
    ? calculateDEffective(goal.deadline)
    : 30; // Fallback: assume 30 days if no deadline set

  // Stage 3: Demonstrated Capacity
  const capacityResult = calculateCapacity({
    daily_minutes_log: user.daily_minutes_log,
    daily_free_time_hours: user.daily_free_time_hours,
    today_free_time_hours: user.today_free_time_hours,
    stretch_factor: user.stretch_factor,
    completion_rate_history: user.completion_rate_history,
  });

  // Stage 4: L_daily + I_gap
  const lDailyResult = calculateLDaily({
    h_remaining_hours,
    d_effective,
    l_capacity: capacityResult.l_capacity,
  });

  // Stage 5: Safety Valves
  const safetyResult = applySafetyValves({
    l_daily: lDailyResult.l_daily,
    d_effective,
  });

  // Stage 7: Daily Budget
  const daily_budget_minutes = calculateDailyBudget(safetyResult.l_daily);

  // Stage 8: Task Count
  const taskResult = calculateTaskCount(daily_budget_minutes);

  return {
    h_remaining_hours,
    estimation_method,
    d_effective,
    demonstrated_capacity: capacityResult.demonstrated_capacity,
    today_modifier: capacityResult.today_modifier,
    l_capacity: capacityResult.l_capacity,
    l_required: lDailyResult.l_required,
    l_daily: safetyResult.l_daily,
    i_gap: lDailyResult.i_gap,
    mode: safetyResult.mode,
    daily_budget_minutes,
    task_count: taskResult.task_count,
    minutes_per_task: taskResult.minutes_per_task,
    remainder: taskResult.remainder,
  };
}

// ---------------------------------------------------------------------------
// MULTI-GOAL FULL PIPELINE
// ---------------------------------------------------------------------------

/**
 * Run the full workload pipeline across multiple active goals.
 *
 * PRD Section 14 + Section 15:
 *
 * 1. Calculate total capacity (Stages 1-5 on the highest-priority goal to get
 *    the user's overall L_daily and mode).
 * 2. If 2+ goals: run Stage 6 (multi-goal arbitration) to split the budget.
 * 3. Apply Stage 7 + 8 on the total budget.
 * 4. Return per-goal budgets alongside the global result.
 *
 * For single goals, delegates to runWorkloadPipeline.
 */
export function runFullWorkloadEngine(params: {
  goals: Goal[];
  user: {
    daily_minutes_log: number[];
    daily_free_time_hours: number;
    today_free_time_hours: number;
    stretch_factor: number;
    completion_rate_history?: number;
  };
  referenceHoursMap?: Map<string, ReferenceHours>;
}): WorkloadResult {
  const { goals, user, referenceHoursMap } = params;

  // Filter to active goals only
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');

  if (activeGoals.length === 0) {
    // No active goals — return zeroed-out result
    return {
      h_remaining_hours: 0,
      estimation_method: 'NONE',
      d_effective: 1,
      demonstrated_capacity: 0,
      today_modifier: 1,
      l_capacity: 0,
      l_required: 0,
      l_daily: 0,
      i_gap: 0,
      mode: 'NORMAL',
      daily_budget_minutes: 5,
      task_count: 1,
      minutes_per_task: 5,
      remainder: 0,
      goal_budgets: [],
    };
  }

  // Single goal: simple delegation
  if (activeGoals.length === 1) {
    const goal = activeGoals[0];
    const refHours = referenceHoursMap?.get(goal.id) ?? null;
    const result = runWorkloadPipeline({ goal, user, referenceHours: refHours });
    result.goal_budgets = [
      {
        goal_id: goal.id,
        title: goal.title,
        priority_rank: goal.priority_rank,
        raw_weight: 1.0,
        deadline_modifier: 1.0,
        normalized_weight: 1.0,
        budget_minutes: result.daily_budget_minutes,
      },
    ];
    return result;
  }

  // Multi-goal: compute overall capacity, then arbitrate

  // Stage 3: Capacity is user-level (same across all goals)
  const capacityResult = calculateCapacity({
    daily_minutes_log: user.daily_minutes_log,
    daily_free_time_hours: user.daily_free_time_hours,
    today_free_time_hours: user.today_free_time_hours,
    stretch_factor: user.stretch_factor,
    completion_rate_history: user.completion_rate_history,
  });

  // For multi-goal, sum up all L_required across goals, then compare to L_capacity
  let totalLRequired = 0;
  let minDEffective = Infinity;
  const perGoalData: Array<{
    goal: Goal;
    h_remaining_hours: number;
    estimation_method: string;
    d_effective: number;
    l_required: number;
  }> = [];

  for (const goal of activeGoals) {
    const refHours = referenceHoursMap?.get(goal.id) ?? null;

    const hRemaining = estimateHRemaining({ goal, referenceHours: refHours });
    const estimationMethod = goal.hours_override != null
      ? 'COUNSELOR_OVERRIDE'
      : refHours
        ? 'REFERENCE_DB'
        : goal.estimation_method ?? 'UNKNOWN';

    const dEffective = goal.deadline
      ? calculateDEffective(goal.deadline)
      : 30;

    const lRequired = (hRemaining * 60) / dEffective;
    totalLRequired += lRequired;

    if (dEffective < minDEffective) minDEffective = dEffective;

    perGoalData.push({
      goal,
      h_remaining_hours: hRemaining,
      estimation_method: estimationMethod,
      d_effective: dEffective,
      l_required: lRequired,
    });
  }

  // Stage 4: combined L_daily
  const l_daily = Math.min(totalLRequired, capacityResult.l_capacity);
  const i_gap =
    capacityResult.l_capacity > 0
      ? totalLRequired / capacityResult.l_capacity
      : Infinity;

  // Stage 5: Safety Valves (use the minimum D_effective across all goals)
  const safetyResult = applySafetyValves({
    l_daily,
    d_effective: minDEffective,
  });

  // Stage 7: Daily Budget
  const daily_budget_minutes = calculateDailyBudget(safetyResult.l_daily);

  // Stage 6: Multi-Goal Arbitration — split the total budget
  const goalBudgets = allocateGoalBudgets({
    goals: activeGoals.map((g) => ({
      goal_id: g.id,
      title: g.title,
      priority_rank: g.priority_rank,
      deadline: g.deadline,
    })),
    daily_budget_minutes,
  });

  // Stage 8: Task Count (on total budget)
  const taskResult = calculateTaskCount(daily_budget_minutes);

  // Use the primary (highest priority) goal's data for the top-level fields
  const primaryGoal = perGoalData.sort(
    (a, b) => a.goal.priority_rank - b.goal.priority_rank
  )[0];

  return {
    h_remaining_hours: primaryGoal.h_remaining_hours,
    estimation_method: primaryGoal.estimation_method,
    d_effective: minDEffective,
    demonstrated_capacity: capacityResult.demonstrated_capacity,
    today_modifier: capacityResult.today_modifier,
    l_capacity: capacityResult.l_capacity,
    l_required: totalLRequired,
    l_daily: safetyResult.l_daily,
    i_gap,
    mode: safetyResult.mode,
    daily_budget_minutes,
    task_count: taskResult.task_count,
    minutes_per_task: taskResult.minutes_per_task,
    remainder: taskResult.remainder,
    goal_budgets: goalBudgets,
  };
}

// ---------------------------------------------------------------------------
// ASYNC WRAPPER — reads all data from Supabase and runs the full pipeline
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper used by API routes.
 *
 * Reads the user's active goals, profile data, task history, and reference
 * hours from Supabase, then delegates to `runFullWorkloadEngine`.
 *
 * @param userId - The user's UUID
 * @param supabase - A server-side Supabase client (service-role)
 * @returns WorkloadResult with daily_budget_minutes, task_count, etc.
 */
export async function runWorkloadEngine(
  userId: string,
  supabase: any
): Promise<WorkloadResult> {
  // 1. Fetch active goals
  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('priority_rank');

  if (goalsError) throw new Error(`Failed to fetch goals: ${goalsError.message}`);

  const activeGoals: Goal[] = goals || [];

  // 2. Fetch user profile for capacity parameters
  const { data: profile } = await supabase
    .from('profiles')
    .select('daily_free_time_hours, today_free_time_hours, stretch_factor, completion_rate_history')
    .eq('id', userId)
    .single();

  const daily_free_time_hours = profile?.daily_free_time_hours ?? 3;
  const today_free_time_hours = profile?.today_free_time_hours ?? daily_free_time_hours;
  const stretch_factor = profile?.stretch_factor ?? 1.1;
  const completion_rate_history = profile?.completion_rate_history ?? 0.6;

  // 3. Fetch last 14 days of task completion data for demonstrated capacity
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoISO = fourteenDaysAgo.toISOString().split('T')[0];

  const { data: recentTasks } = await supabase
    .from('tasks')
    .select('scheduled_for, duration_minutes, status')
    .eq('user_id', userId)
    .in('status', ['COMPLETED', 'ATTEMPTED'])
    .gte('scheduled_for', fourteenDaysAgoISO);

  // Aggregate minutes per day
  const dailyMap: Record<string, number> = {};
  for (const t of recentTasks || []) {
    const day = t.scheduled_for;
    const credit = t.status === 'COMPLETED' ? t.duration_minutes : t.duration_minutes * 0.5;
    dailyMap[day] = (dailyMap[day] || 0) + credit;
  }
  const daily_minutes_log = Object.values(dailyMap);

  // 4. Fetch reference hours for each goal (if available)
  const referenceHoursMap = new Map<string, ReferenceHours>();
  for (const goal of activeGoals) {
    if (goal.goal_category) {
      const query = supabase
        .from('reference_hours')
        .select('*')
        .eq('goal_category', goal.goal_category);

      if (goal.subcategory) {
        query.eq('subcategory', goal.subcategory);
      }

      const { data: refRows } = await query.limit(1).single();
      if (refRows) {
        referenceHoursMap.set(goal.id, refRows);
      }
    }
  }

  // 5. Run the full pipeline
  return runFullWorkloadEngine({
    goals: activeGoals,
    user: {
      daily_minutes_log,
      daily_free_time_hours,
      today_free_time_hours,
      stretch_factor,
      completion_rate_history,
    },
    referenceHoursMap,
  });
}
