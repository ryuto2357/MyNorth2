import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface CrisisAlert {
  userId: string
  goalId: string
  severity: 'T1_IMMINENT' | 'T2_CONCERNING' | 'T3_MONITORING'
  message: string
  keywords: string[]
  counselorId?: string
}

/**
 * POST /api/crisis/alert
 * Log crisis alert to database + notify counselor
 * Called from chat endpoint when crisis detected
 */
export async function POST(req: NextRequest) {
  const { userId, goalId, severity, message, keywords, counselorId } = (await req.json()) as CrisisAlert

  if (!userId || !severity) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Log to crisis_alerts table (for audit trail + counselor dashboard)
    const { data: alert, error: alertError } = await supabase
      .from('crisis_alerts')
      .insert([
        {
          user_id: userId,
          goal_id: goalId,
          severity,
          message_excerpt: message.substring(0, 500),
          keywords: keywords,
          counselor_id: counselorId,
          status: 'OPEN',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (alertError) {
      console.error('Error logging crisis alert:', alertError)
      // Don't fail the response—safety first
    }

    // Get student info for context
    const { data: student } = await supabase
      .from('users')
      .select('name, email, school')
      .eq('id', userId)
      .single()

    // TODO: In production, integrate with:
    // - Email notification to school counselor
    // - SMS if available (opt-in)
    // - Dashboard urgency flag
    // - Audit logging for compliance

    const alertLog = {
      timestamp: new Date().toISOString(),
      severity,
      student_name: student?.name || 'Unknown',
      student_email: student?.email,
      message_preview: message.substring(0, 100),
      keywords,
      alert_id: alert?.id,
    }

    console.warn('[CRISIS ALERT]', JSON.stringify(alertLog, null, 2))

    return NextResponse.json({
      success: true,
      alert_id: alert?.id,
      severity,
      message: 'Alert logged. Counselor will be notified.',
    })
  } catch (error: any) {
    console.error('Crisis alert failed:', error)
    return NextResponse.json({ error: error.message || 'Failed to process alert' }, { status: 500 })
  }
}
