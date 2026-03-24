import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/crisis/dashboard?counselorId=X
 * Returns all crisis alerts assigned to this counselor
 * Sorted by severity (T1 first) and recency
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const counselorId = searchParams.get('counselorId')
  const status = searchParams.get('status') || 'OPEN' // Default to open alerts

  if (!counselorId) {
    return NextResponse.json({ error: 'Missing counselorId' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    let query = supabase
      .from('crisis_alerts')
      .select(
        `
        id,
        user_id,
        goal_id,
        severity,
        message_excerpt,
        keywords,
        status,
        created_at,
        acknowledged_at,
        resolved_at,
        user:users(id, name, email, school, grade),
        goal:goals(id, title)
      `
      )
      .eq('counselor_id', counselorId)

    if (status !== 'ALL') {
      query = query.eq('status', status)
    }

    const { data: alerts, error } = await query
      .order('severity', { ascending: true }) // T1 first
      .order('created_at', { ascending: false }) // Most recent first

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate summary stats
    const t1Count = (alerts || []).filter((a) => a.severity === 'T1_IMMINENT').length
    const t2Count = (alerts || []).filter((a) => a.severity === 'T2_CONCERNING').length
    const t3Count = (alerts || []).filter((a) => a.severity === 'T3_MONITORING').length

    return NextResponse.json({
      success: true,
      alerts,
      summary: {
        total: alerts?.length || 0,
        T1_IMMINENT: t1Count,
        T2_CONCERNING: t2Count,
        T3_MONITORING: t3Count,
      },
    })
  } catch (error: any) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch alerts' }, { status: 500 })
  }
}

/**
 * PATCH /api/crisis/dashboard
 * Acknowledge or resolve a crisis alert
 */
export async function PATCH(req: NextRequest) {
  const { alertId, status, notes } = await req.json()

  if (!alertId || !status) {
    return NextResponse.json({ error: 'Missing alertId or status' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const updateObj: any = { status }

    if (status === 'ACKNOWLEDGED') {
      updateObj.acknowledged_at = new Date().toISOString()
    }

    if (status === 'RESOLVED') {
      updateObj.resolved_at = new Date().toISOString()
    }

    if (notes) {
      updateObj.notes = notes
    }

    const { data, error } = await supabase
      .from('crisis_alerts')
      .update(updateObj)
      .eq('id', alertId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      alert: data,
    })
  } catch (error: any) {
    console.error('Update error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update alert' }, { status: 500 })
  }
}
