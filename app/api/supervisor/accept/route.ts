import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const { data: tokenRow, error: tokenErr } = await supabase
      .from('supervisor_invite_tokens')
      .select('student_id, supervisor_role, expires_at, used_at')
      .eq('token', token)
      .single()

    if (tokenErr || !tokenRow) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    if (tokenRow.used_at) {
      return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 })
    }

    if (new Date(tokenRow.expires_at) <= new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 })
    }

    const { data: supervisor, error: supErr } = await supabase
      .from('users')
      .select('id, role, name')
      .eq('id', authUser.id)
      .single()

    if (supErr || !supervisor) {
      return NextResponse.json({ error: 'Supervisor profile not found' }, { status: 404 })
    }

    if (!['PARENT', 'COUNSELOR'].includes(supervisor.role)) {
      return NextResponse.json({ error: 'Your account must have a PARENT or COUNSELOR role to accept invites' }, { status: 403 })
    }

    if (supervisor.role !== tokenRow.supervisor_role) {
      return NextResponse.json({
        error: `This invite is for a ${tokenRow.supervisor_role}, but your account role is ${supervisor.role}`,
      }, { status: 403 })
    }

    const { data: existing } = await supabase
      .from('supervisor_links')
      .select('id')
      .eq('student_id', tokenRow.student_id)
      .eq('supervisor_id', authUser.id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'You are already connected to this student' }, { status: 409 })
    }

    const { data: link, error: linkErr } = await supabase
      .from('supervisor_links')
      .insert({
        student_id: tokenRow.student_id,
        supervisor_id: authUser.id,
        supervisor_role: tokenRow.supervisor_role,
        consent_level: 'METRICS_ONLY',
      })
      .select()
      .single()

    if (linkErr || !link) {
      console.error('Failed to create supervisor link:', linkErr?.message)
      return NextResponse.json({ error: 'Failed to create supervisor link' }, { status: 500 })
    }

    const { error: markErr } = await supabase
      .from('supervisor_invite_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)

    if (markErr) {
      console.error('Failed to mark token as used:', markErr.message)
    }

    const { data: student } = await supabase
      .from('users')
      .select('name')
      .eq('id', tokenRow.student_id)
      .single()

    return NextResponse.json({
      success: true,
      studentName: student?.name || null,
      linkId: link.id,
    })
  } catch (error) {
    console.error('Supervisor accept POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
