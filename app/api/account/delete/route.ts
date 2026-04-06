import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // The authenticated user can only delete their own account
    const userId = authUser.id
    const supabase = createServerClient()

    // Cascade delete all user data in order
    const tables = [
      'chat_messages',
      'chat_sessions',
      'tasks',
      'links',
      'nodes',
      'goals',
      'vectors',
      'relay_messages',
      'supervisor_links',
      'subscriptions',
    ]

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId)
      if (error) {
        console.error(`Failed to delete from ${table}:`, error.message)
      }
    }

    // Also delete relay_messages where they're the recipient
    await supabase.from('relay_messages').delete().eq('to_user_id', userId)

    // Also delete supervisor links where they're the supervisor
    await supabase.from('supervisor_links').delete().eq('supervisor_id', userId)

    // Delete the user record
    const { error: userErr } = await supabase.from('users').delete().eq('id', userId)
    if (userErr) {
      console.error('Failed to delete user record:', userErr.message)
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
    }

    // Delete auth user
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId)
    if (authErr) {
      console.error('Failed to delete auth user:', authErr.message)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Account deletion error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
