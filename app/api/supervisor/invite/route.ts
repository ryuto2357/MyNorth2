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

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (!profile || profile.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Only students can generate invite tokens' }, { status: 403 })
    }

    const body = await request.json()
    const { supervisorRole } = body

    if (!supervisorRole || !['PARENT', 'COUNSELOR'].includes(supervisorRole)) {
      return NextResponse.json({ error: 'Invalid supervisor role. Must be PARENT or COUNSELOR' }, { status: 400 })
    }

    const { data: tokenRow, error: insertErr } = await supabase
      .from('supervisor_invite_tokens')
      .insert({
        student_id: authUser.id,
        supervisor_role: supervisorRole,
      })
      .select()
      .single()

    if (insertErr || !tokenRow) {
      console.error('Failed to create invite token:', insertErr?.message)
      return NextResponse.json({ error: 'Failed to create invite token' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${baseUrl}/join?token=${tokenRow.token}`

    return NextResponse.json({
      token: tokenRow.token,
      expiresAt: tokenRow.expires_at,
      inviteUrl,
    })
  } catch (error) {
    console.error('Supervisor invite POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: tokenRow, error: tokenErr } = await supabase
      .from('supervisor_invite_tokens')
      .select('student_id, supervisor_role, expires_at, used_at')
      .eq('token', token)
      .single()

    if (tokenErr || !tokenRow) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    const isValid = !tokenRow.used_at && new Date(tokenRow.expires_at) > new Date()

    const { data: student } = await supabase
      .from('users')
      .select('name')
      .eq('id', tokenRow.student_id)
      .single()

    return NextResponse.json({
      studentName: student?.name || null,
      supervisorRole: tokenRow.supervisor_role,
      expiresAt: tokenRow.expires_at,
      isValid,
    })
  } catch (error) {
    console.error('Supervisor invite GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
