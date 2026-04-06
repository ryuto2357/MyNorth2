import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'

const VALID_LEVELS = ['METRICS_ONLY', 'GOALS_VISIBLE', 'FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'] as const

// PATCH: Update consent level
export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()
    const { linkId, consentLevel } = await request.json()
    const studentId = authUser.id

    if (!linkId || !consentLevel) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!VALID_LEVELS.includes(consentLevel)) {
      return NextResponse.json({ error: 'Invalid consent level' }, { status: 400 })
    }

    // Verify the requesting user is the student on this link
    const { data: link } = await supabase
      .from('supervisor_links')
      .select('student_id, supervisor_role')
      .eq('id', linkId)
      .single()

    if (!link || link.student_id !== studentId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // BEHAVIORAL_PATTERNS is counselor-only
    if (consentLevel === 'BEHAVIORAL_PATTERNS' && link.supervisor_role !== 'COUNSELOR') {
      return NextResponse.json({ error: 'BEHAVIORAL_PATTERNS is only available for counselors' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('supervisor_links')
      .update({ consent_level: consentLevel, updated_at: new Date().toISOString() })
      .eq('id', linkId)
      .select()
      .single()

    if (error) {
      console.error('Consent update failed:', error.message)
      return NextResponse.json({ error: 'Failed to update consent' }, { status: 500 })
    }

    return NextResponse.json({ link: data })
  } catch (error) {
    console.error('Consent PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove a supervisor link
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()
    const { linkId } = await request.json()
    const studentId = authUser.id

    if (!linkId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: link } = await supabase
      .from('supervisor_links')
      .select('student_id')
      .eq('id', linkId)
      .single()

    if (!link || link.student_id !== studentId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabase
      .from('supervisor_links')
      .delete()
      .eq('id', linkId)

    if (error) {
      console.error('Supervisor link deletion failed:', error.message)
      return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Supervisor link DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
