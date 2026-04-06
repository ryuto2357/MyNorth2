import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'
import { computeInsights } from '@/lib/insights'

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const periodParam = (url.searchParams.get('period') || 'WEEKLY').toUpperCase()

    if (periodParam !== 'WEEKLY' && periodParam !== 'MONTHLY') {
      return NextResponse.json({ error: 'Invalid period. Use WEEKLY or MONTHLY.' }, { status: 400 })
    }

    const periodType = periodParam as 'WEEKLY' | 'MONTHLY'
    const supabase = createServerClient()
    const userId = authUser.id

    const now = new Date()
    const periodEnd = now.toISOString().slice(0, 10)
    let periodStart: string

    if (periodType === 'WEEKLY') {
      const start = new Date(now)
      start.setUTCDate(start.getUTCDate() - 7)
      periodStart = start.toISOString().slice(0, 10)
    } else {
      const start = new Date(now)
      start.setUTCMonth(start.getUTCMonth() - 1)
      periodStart = start.toISOString().slice(0, 10)
    }

    // Return cached insight if one already exists for this period
    const { data: existing } = await supabase
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .eq('period_type', periodType)
      .eq('period_start', periodStart)
      .single()

    if (existing) {
      return NextResponse.json(existing)
    }

    // Compute and store new insight
    const insight = await computeInsights(supabase, userId, periodType, periodStart, periodEnd)

    const { data: saved, error } = await supabase
      .from('insights')
      .insert([{
        user_id: insight.user_id,
        period_type: insight.period_type,
        period_start: insight.period_start,
        period_end: insight.period_end,
        data: insight.data,
        narrative: insight.narrative,
      }])
      .select()
      .single()

    if (error) {
      console.error('[insights] Failed to save insight:', error.message)
      return NextResponse.json({ error: 'Failed to save insight' }, { status: 500 })
    }

    return NextResponse.json(saved)
  } catch (error) {
    console.error('[insights] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
