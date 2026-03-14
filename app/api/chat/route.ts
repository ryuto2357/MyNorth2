import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import { buildMorganSystemPrompt } from '@/lib/morgan'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  // Initialize inside handler to avoid build-time env var issues
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { userId, goalId, message, sessionId } = await request.json()

    if (!userId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user data for context
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    // Get goal data for context
    const { data: goalData } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single()

    if (!userData || !goalData) {
      return NextResponse.json({ error: 'User or goal not found' }, { status: 404 })
    }

    // Build Morgan's system prompt
    const systemPrompt = buildMorganSystemPrompt({
      userName: userData.name || 'Friend',
      goal: goalData.title,
      why: goalData.why || '',
      familiarity: goalData.familiarity_baseline || 5,
      freeTimeHours: userData.schedule?.daily_free_time_hours || 2,
      tone: 'friendly', // Default tone for demo
    })

    // Get chat history
    let chatSessionId = sessionId
    let messages: any[] = []

    if (!chatSessionId) {
      const { data: newSession } = await supabase
        .from('chat_sessions')
        .insert([{ user_id: userId, goal_id: goalId }])
        .select()
        .single()

      chatSessionId = newSession?.id
    } else {
      const { data: history } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', chatSessionId)
        .order('created_at', { ascending: true })

      messages = (history || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message,
    })

    // Save user message
    await supabase.from('chat_messages').insert([
      {
        session_id: chatSessionId,
        user_id: userId,
        role: 'user',
        content: message,
      },
    ])

    // Get response from Gemini
    const response = await chat(messages, systemPrompt)

    // Save assistant message
    await supabase.from('chat_messages').insert([
      {
        session_id: chatSessionId,
        user_id: userId,
        role: 'assistant',
        content: response,
      },
    ])

    return NextResponse.json({
      sessionId: chatSessionId,
      response,
      role: 'assistant',
    })
  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
