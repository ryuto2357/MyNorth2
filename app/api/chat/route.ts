import { NextRequest, NextResponse } from 'next/server'
import { chat } from '@/lib/gemini'
import { buildMorganSystemPrompt, buildMorganPlanningPrompt, buildMorganFastPrompt } from '@/lib/morgan'
import { buildUserCorpus } from '@/lib/user-corpus'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'
import { inferDISCUpdate } from '@/lib/disc'
import { extractPatterns } from '@/lib/pattern-extractor'
import { retrieveContext } from '@/lib/rag'
import { generateEmbedding } from '@/lib/embeddings'
import { verifyCurriculum } from '@/lib/curriculum-verifier'
import { searchWeb } from '@/lib/search'
import { canAccess } from '@/lib/feature-gate'

// ---------------------------------------------------------------------------
// Brace-balancing JSON extractor for LLM agentic actions.
// A regex like /ACTION:\s*({[\s\S]*?})/ stops at the FIRST closing brace,
// which breaks on any JSON with nested objects. This walks the string
// character by character to find the true matching close brace.
// ---------------------------------------------------------------------------

interface ExtractedAction {
  json: string      // the raw JSON string, ready for JSON.parse
  start: number     // index of 'A' in 'ACTION:' within the original string
  end: number       // index after the closing '}' — use to strip from response
}

function extractActionJSON(text: string, markerIndex: number): ExtractedAction | null {
  const afterMarker = text.slice(markerIndex + 7) // skip 'ACTION:'
  const braceStart = afterMarker.indexOf('{')
  if (braceStart === -1) return null

  let depth = 0
  for (let i = braceStart; i < afterMarker.length; i++) {
    if (afterMarker[i] === '{') depth++
    else if (afterMarker[i] === '}') {
      depth--
      if (depth === 0) {
        return {
          json: afterMarker.slice(braceStart, i + 1),
          start: markerIndex,
          end: markerIndex + 7 + i + 1,
        }
      }
    }
  }
  return null // unclosed brace — malformed action
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, sessionId, goalId } = await request.json()
    const userId = authUser.id

    if (!message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (message.length > 5000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // Build full user corpus and system prompt (handles STUDENT / COUNSELOR / PARENT automatically)
    const corpus = await buildUserCorpus(userId)

    // Create supabase client early for workload engine and chat history
    const supabase = createServerClient()

    // 3-path routing classifier
    const PLANNING_KEYWORDS = ['plan', 'task', 'tasks', 'schedule', 'roadmap', 'what should i', 'what do i do', 'how do i learn', 'how to become', 'help me study', "today's tasks", 'give me tasks', 'make a plan', 'study plan']
    const messageLower = message.toLowerCase()
    const wordCount = message.trim().split(/\s+/).length
    const hasPlanningKeyword = PLANNING_KEYWORDS.some(kw => messageLower.includes(kw))

    type RoutePath = 'FAST' | 'PLANNING' | 'DEEP'
    const path: RoutePath = (() => {
      if (corpus.identity.role !== 'STUDENT') return 'DEEP'
      if (hasPlanningKeyword) return 'PLANNING'
      if (wordCount <= 50) return 'FAST'
      return 'DEEP'
    })()

    // Tier check — DEEP path (Morgan PRO) requires TIER_2+
    // FAST and PLANNING are available on all tiers
    if (path === 'DEEP' && !canAccess('morgan_pro', corpus.identity.tier)) {
      return NextResponse.json(
        { error: 'Deep analysis requires a paid plan. Upgrade to unlock Morgan PRO.', upgrade_required: true },
        { status: 403 }
      )
    }

    // Step 1 — Research Trigger Detection
    const RESEARCH_SIGNALS = ['how', 'what is', 'explain', 'why does', 'who is', 'when did', 'how do i learn', 'what should i know about', 'is it true', 'tell me about']
    const isResearchTriggered = (
      path === 'DEEP' &&
      corpus.identity.role === 'STUDENT' &&
      RESEARCH_SIGNALS.some(signal => messageLower.includes(signal)) &&
      corpus.goals.length > 0
    )

    // Step 2 — Parallel research fetch
    let ragContext = ''
    let webContext = ''

    if (isResearchTriggered) {
      const researchQuery = `${message} ${corpus.goals[0]?.title || ''}`.trim()
      const [rag, web] = await Promise.all([
        retrieveContext(researchQuery, userId, supabase),
        searchWeb(researchQuery),
      ])
      ragContext = rag
      webContext = web
    } else {
      // RAG: skip for FAST path — no embedding call for quick answers
      ragContext = (path !== 'FAST' && corpus.identity.role === 'STUDENT')
        ? await retrieveContext(message, userId, supabase)
        : ''
    }

    let systemPrompt: string
    if (path === 'FAST') {
      systemPrompt = buildMorganFastPrompt(corpus)
    } else if (path === 'PLANNING') {
      const curriculumContext = corpus.goals.length > 0
        ? await verifyCurriculum(corpus.goals[0].title, corpus.goals[0].why).catch(() => '')
        : ''
      systemPrompt = buildMorganPlanningPrompt(corpus, ragContext, curriculumContext)
    } else {
      // Pass webContext to buildMorganSystemPrompt (which passes it to buildStudentPrompt)
      systemPrompt = buildMorganSystemPrompt(corpus, ragContext, webContext)
    }

    // Get or create chat session
    let chatSessionId = sessionId
    let messages: Array<{ role: 'user' | 'model'; content: string }> = []

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
    messages.push({ role: 'user', content: message })

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
    let response = await chat(messages, systemPrompt)

    // --- AGENTIC ACTION PARSER ---
    // Use a brace-balancing extractor instead of regex — LLM JSON is often multi-line
    // and a non-greedy regex will stop at the first `}` instead of the matching close.
    let actionResult = null
    const ALLOWED_ACTIONS = new Set(['TASK_UPDATE', 'GOAL_UPDATE', 'NODE_CREATE', 'NODE_UPDATE', 'NODE_ARCHIVE', 'CRISIS_ALERT'])
    const actionMarker = response.indexOf('ACTION:')
    const actionMatch = actionMarker !== -1 ? extractActionJSON(response, actionMarker) : null

    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch.json)
        const { type, payload } = action

        if (!ALLOWED_ACTIONS.has(type)) {
          console.warn(`[Morgan Action] Blocked unknown action type: ${type}`)
        } else {
          console.info(`[Morgan Action] Detected: ${type}`, payload)

          if (type === 'TASK_UPDATE') {
            const { id, status } = payload
            const { data: task } = await supabase
              .from('tasks')
              .select('game_plan_node_id')
              .eq('id', id)
              .eq('user_id', userId)
              .single()

            if (task) {
              const { error: taskErr } = await supabase.from('tasks').update({
                status,
                completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
              }).eq('id', id)

              if (taskErr) {
                console.error('[Morgan Action] Task update failed:', taskErr)
              } else if (status === 'COMPLETED' && task.game_plan_node_id) {
                // Update gate_pace when a game-plan-linked task is completed
                const { data: user } = await supabase
                  .from('users')
                  .select('gates_cleared_log')
                  .eq('id', userId)
                  .single()
                if (user) {
                  const log = Array.isArray(user.gates_cleared_log) ? user.gates_cleared_log : []
                  const today = new Date().toISOString().split('T')[0]
                  const newLog = [...log, { date: today, node_id: task.game_plan_node_id }]
                  const cutoff = new Date()
                  cutoff.setDate(cutoff.getDate() - 14)
                  const recentClears = newLog.filter((e: { date: string }) => new Date(e.date) >= cutoff)
                  await supabase.from('users').update({
                    gates_cleared_log: newLog,
                    gate_pace: recentClears.length / 14,
                  }).eq('id', userId)
                }
              }
            }
          } else if (type === 'GOAL_UPDATE') {
            const { id } = payload
            // Whitelist allowed fields — never pass raw payload to DB
            const goalUpdate: Record<string, unknown> = {}
            if (payload.deadline !== undefined) goalUpdate.deadline = payload.deadline
            if (payload.priority_rank !== undefined) goalUpdate.priority_rank = payload.priority_rank
            if (payload.current_achievement !== undefined) goalUpdate.current_achievement = payload.current_achievement
            if (Object.keys(goalUpdate).length === 0) {
              console.warn('[Morgan Action] GOAL_UPDATE skipped — no valid fields in payload:', payload)
            } else {
              await supabase.from('goals').update(goalUpdate).eq('id', id).eq('user_id', userId)
            }
          } else if (type === 'NODE_CREATE') {
            const { label, parent_id, cluster_id, markdown, goal_id, seniority_level, description, familiarity_score } = payload
            await supabase.from('nodes').insert([{
              user_id: userId,
              label,
              parent_id: parent_id ?? null,
              cluster_id: cluster_id ?? null,
              goal_id: goal_id ?? null,
              seniority_level: seniority_level ?? 0,
              description: description ?? null,
              familiarity_score: familiarity_score ?? 0,
              metadata: { markdown },
            }])
            // Embed node content so it's semantically searchable via RAG
            const nodeText = [label, description, markdown].filter(Boolean).join('\n')
            try {
              const embedding = await generateEmbedding(nodeText)
              await supabase.from('vectors').insert([{
                user_id: userId,
                content: nodeText,
                embedding,
                metadata: { source_type: 'NODE', label, goal_id: goal_id ?? null },
              }])
            } catch (e) {
              console.error('[Morgan Action] NODE_CREATE embedding failed (non-fatal):', e)
            }
          } else if (type === 'NODE_UPDATE') {
            const { id, ...updates } = payload
            // Verify user owns this node before any mutation
            const { data: node } = await supabase
              .from('nodes')
              .select('id')
              .eq('id', id)
              .eq('user_id', userId)
              .single()

            if (!node) {
              console.warn('[Morgan Action] NODE_UPDATE ownership check failed — node not found or not owned:', id)
            } else {
              // Build update object dynamically — only include present fields
              const updateObj: Record<string, unknown> = {}
              if (updates.label !== undefined) updateObj.label = updates.label
              if (updates.description !== undefined) updateObj.description = updates.description
              if (updates.familiarity_score !== undefined) {
                updateObj.familiarity_score = Math.min(1.0, Math.max(0.0, updates.familiarity_score))
              }
              if (updates.cluster_id !== undefined) updateObj.cluster_id = updates.cluster_id

              if (Object.keys(updateObj).length === 0) {
                console.warn('[Morgan Action] NODE_UPDATE skipped — no valid fields in payload:', payload)
              } else {
                const { error } = await supabase.from('nodes').update(updateObj).eq('id', id)
                if (error) {
                  console.error('[Morgan Action] NODE_UPDATE failed:', error)
                } else {
                  console.info('[Morgan Action] NODE_UPDATE success:', id)
                  actionResult = { type, success: true }
                }
              }
            }
          } else if (type === 'NODE_ARCHIVE') {
            const { id } = payload
            // Verify user owns this node before any mutation
            const { data: node } = await supabase
              .from('nodes')
              .select('id')
              .eq('id', id)
              .eq('user_id', userId)
              .single()

            if (!node) {
              console.warn('[Morgan Action] NODE_ARCHIVE ownership check failed — node not found or not owned:', id)
            } else {
              const { error } = await supabase.from('nodes').update({ status: 'ARCHIVED' }).eq('id', id)
              if (error) {
                console.error('[Morgan Action] NODE_ARCHIVE failed:', error)
              } else {
                  console.info('[Morgan Action] NODE_ARCHIVE success:', id)
                actionResult = { type, success: true }
              }
            }
          } else if (type === 'CRISIS_ALERT') {
            // Find the first linked counselor for this student
            const { data: link } = await supabase
              .from('supervisor_links')
              .select('supervisor_id')
              .eq('student_id', userId)
              .eq('status', 'ACTIVE')
              .eq('supervisor_role', 'COUNSELOR')
              .limit(1)
              .single()

            const { error } = await supabase.from('crisis_alerts').insert([{
              student_id: userId,
              counselor_id: link?.supervisor_id ?? null,
              session_id: chatSessionId ?? null,
            }])

            if (error) {
              console.error('[Morgan Action] CRISIS_ALERT insert failed:', error)
            } else {
              console.info('[Morgan Action] CRISIS_ALERT created for student:', userId)
              actionResult = { type, success: true }
            }
          }

          if (actionResult === null && !['NODE_UPDATE', 'NODE_ARCHIVE'].includes(type)) {
            actionResult = { type, success: true }
          }
        }

        // Strip the ACTION block from the final response text
        response = (response.slice(0, actionMatch.start) + response.slice(actionMatch.end)).trim()
      } catch (e) {
        console.error('[Morgan Action] Parse/Execute failed:', e)
      }
    }
    // --- END AGENTIC ACTION PARSER ---

    // Log node interactions — scan Morgan's response for node labels (UUIDs won't appear in natural language)
    const responseLower = response.toLowerCase()
    const mentionedNodes = corpus.constellation.nodes.filter(n =>
      responseLower.includes(n.label.toLowerCase())
    )
    if (mentionedNodes.length > 0) {
      await supabase.from('node_interactions').insert(
        mentionedNodes.map(n => ({
          user_id: userId,
          node_id: n.id,
          session_id: chatSessionId,
          interaction_type: 'DISCUSSED',
        }))
      )
    }

    // Save assistant message and capture ID for client
    const { data: savedAssistantMsg } = await supabase.from('chat_messages').insert([
      {
        session_id: chatSessionId,
        user_id: userId,
        role: 'assistant',
        content: response,
      },
    ]).select('id').single()

    // Fire-and-forget: update DISC profile + extract patterns (don't block response)
    const allMessages = [...messages, { role: 'assistant', content: response }]
    Promise.resolve().then(async () => {
      try {
        // DISC update (fast — keyword-based, no Gemini call)
        const updatedDisc = inferDISCUpdate(corpus.disc_profile, allMessages)
        await supabase.from('users').update({ disc_profile: updatedDisc }).eq('id', userId)

        // Pattern extraction (slower — uses Gemini, runs async)
        if (allMessages.length >= 6) {
          const updatedPatterns = await extractPatterns(corpus.patterns || {}, allMessages)
          await supabase.from('users').update({ patterns: updatedPatterns }).eq('id', userId)
        }

        // Save research findings to constellation (Step 4)
        if (webContext && corpus.goals.length > 0) {
          const goalId = corpus.goals[0].goal_id
          await supabase.from('nodes').insert([{
            user_id: userId,
            goal_id: goalId,
            label: `Research: ${message.substring(0, 60)}`,
            description: webContext.substring(0, 500),
            seniority_level: 2,
            cluster_id: 'research',
            familiarity_score: 0,
            status: 'ACTIVE',
            metadata: { source_type: 'WEB_RESEARCH', query: message },
          }])
        }
      } catch (e) {
        console.error('Background DISC/pattern/research update failed:', e)
      }
    })

    return NextResponse.json({
      sessionId: chatSessionId,
      response,
      role: 'assistant',
      action: actionResult,
      messageId: savedAssistantMsg?.id,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
