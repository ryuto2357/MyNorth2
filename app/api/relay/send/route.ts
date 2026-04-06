import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'
import { chat } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()
    const { toUserId, content } = await request.json()
    const fromUserId = authUser.id

    if (!toUserId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (content.length > 5000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // Verify sender is a supervisor linked to this student
    const { data: link } = await supabase
      .from('supervisor_links')
      .select('supervisor_role')
      .eq('supervisor_id', fromUserId)
      .eq('student_id', toUserId)
      .single()

    if (!link) {
      return NextResponse.json({ error: 'No supervisor link found' }, { status: 403 })
    }

    // Translate message via Gemini
    let translated = content
    try {
      translated = await chat(
        [{ role: 'user', content: `Translate this counselor message into friendly, encouraging language for a high school student. Keep the core meaning but make it warm and supportive. Original: "${content}"` }],
        'You are a message translator. Output only the translated message, nothing else.'
      )
    } catch {
      // Fall back to original if translation fails
    }

    const { data: message, error } = await supabase
      .from('relay_messages')
      .insert({
        from_user_id: fromUserId,
        to_user_id: toUserId,
        from_role: link.supervisor_role,
        original_content: content,
        translated_content: translated,
        status: 'PENDING',
      })
      .select()
      .single()

    if (error) {
      console.error('Relay send failed:', error.message)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Relay send error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
