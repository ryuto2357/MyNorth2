const TIER_LIMITS: Record<string, { max_goals: number; morgan_pro_daily: number; counselor_access: boolean; supervised_accounts: number }> = {
  TIER_1: { max_goals: 1, morgan_pro_daily: 5, counselor_access: false, supervised_accounts: 0 },
  TIER_2: { max_goals: 3, morgan_pro_daily: 25, counselor_access: true, supervised_accounts: 3 },
  TIER_3: { max_goals: -1, morgan_pro_daily: -1, counselor_access: true, supervised_accounts: -1 },
}

export function getTierLimits(tier: string) {
  return TIER_LIMITS[tier] || TIER_LIMITS.TIER_1
}

export function canAccess(feature: string, tier: string): boolean {
  const limits = getTierLimits(tier)

  switch (feature) {
    case 'morgan_pro':
      return limits.morgan_pro_daily !== 0
    case 'counselor_access':
      return limits.counselor_access
    case 'multiple_goals':
      return limits.max_goals !== 1
    case 'supervised_accounts':
      return limits.supervised_accounts !== 0
    default:
      return true
  }
}

export function checkGoalLimit(tier: string, currentGoalCount: number): { allowed: boolean; limit: number } {
  const limits = getTierLimits(tier)
  if (limits.max_goals === -1) return { allowed: true, limit: -1 }
  return { allowed: currentGoalCount < limits.max_goals, limit: limits.max_goals }
}
