import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'
import { chat } from '@/lib/gemini'
import { buildUserCorpus } from '@/lib/user-corpus'
import { computeFrontier } from '@/lib/game-plan'
import { format } from 'date-fns'
import { GamePlanNode, GamePlanLink } from '@/types'

/**
 * Brace-balancing JSON extractor.
 */
function extractJSON(text: string) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { goalId } = await req.json()
    if (!goalId) return NextResponse.json({ error: 'goalId is required' }, { status: 400 })

    const userId = authUser.id
    const supabase = createServerClient()

    // 1. Fetch goal and verify ownership
    const { data: goal } = await supabase
      .from('goals')
      .select('id, title, why')
      .eq('id', goalId)
      .eq('user_id', userId)
      .single()

    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })

    // 2. Compute Frontier — fetch nodes first, then links by node IDs
    const nodesRes = await supabase
      .from('game_plan_nodes')
      .select('*')
      .eq('goal_id', goalId)
      .eq('user_id', userId)

    const nodeIds = (nodesRes.data || []).map(n => n.id)
    const linksRes = nodeIds.length > 0
      ? await supabase.from('game_plan_links').select('*').in('source_id', nodeIds)
      : { data: [] }

    const allNodes = (nodesRes.data || []) as GamePlanNode[]
    const allLinks = (linksRes.data || []) as GamePlanLink[]

    const { frontier } = computeFrontier(allNodes, allLinks)

    if (frontier.length === 0) {
      return NextResponse.json({ error: 'No unlocked nodes in the Game Plan. All prerequisites are locked.' }, { status: 400 })
    }

    // 3. Load user corpus for context
    const corpus = await buildUserCorpus(userId)

    // 4. Construct Morgan Prompt
    const frontierList = frontier.map(n => 
      `- [node_id: "${n.id}"] "${n.title}" (${n.gate_type}): ${n.completion_definition}`
    ).join('\n')

    const prompt = `As Morgan, generate today's actionable tasks for this student's goal.

STUDENT CONTEXT:
Name: ${corpus.identity.name}
Goal: "${goal.title}"
Why: "${goal.why || 'Not specified'}"

ACTIVE FRONTIER (Unlocked nodes you can work on today):
${frontierList}

RULES:
1. Generate 2-4 atomic TASK-level steps derived from the frontier nodes above.
2. Each task MUST have a clear "completion_definition" (what success looks like).
3. Outcomes only. NO time limits, NO "study for X minutes".
4. Tasks must be immediately actionable with zero ambiguity.
5. Every task MUST reference exactly one "node_id" from the frontier list above.
6. The student decides how long to spend on each task.

Return ONLY valid JSON:
{
  "tasks": [
    {
      "node_id": "exact-uuid-from-list",
      "title": "Short actionable task title",
      "completion_definition": "Concrete outcome to verify task is done",
      "scheduled_time": "09:00" | "14:00" | "19:00"
    }
  ]
}`

    let raw = await chat(
      [{ role: 'user', content: prompt }],
      "You output ONLY valid JSON. Outcomes only, no time metrics."
    )

    let jsonStr = extractJSON(raw)
    let parsed: { tasks?: any[] } | null = null
    
    if (jsonStr) {
      try {
        parsed = JSON.parse(jsonStr)
      } catch (e) {
        console.error('[TaskGen] Initial JSON parse failed:', e)
      }
    }

    // Retry once if parsing fails
    if (!parsed || !parsed.tasks || !Array.isArray(parsed.tasks)) {
      raw = await chat(
        [{ role: 'user', content: prompt }, { role: 'model', content: raw }, { role: 'user', content: "Invalid JSON. Return only a valid JSON object with a 'tasks' array." }],
        "You output ONLY valid JSON."
      )
      jsonStr = extractJSON(raw)
      if (jsonStr) {
        try {
          parsed = JSON.parse(jsonStr)
        } catch (e) {
          console.error('[TaskGen] Retry JSON parse failed:', e)
        }
      }
    }

    if (!parsed || !parsed.tasks || !Array.isArray(parsed.tasks)) {
      return NextResponse.json({ error: 'AI failed to generate valid task structure' }, { status: 500 })
    }

    // 5. Insert Tasks
    const today = format(new Date(), 'yyyy-MM-dd')
    const frontierIds = new Set(frontier.map(n => n.id))

    const taskInserts = parsed.tasks
      .filter(t => frontierIds.has(t.node_id))
      .map(t => ({
        user_id: userId,
        goal_id: goalId,
        game_plan_node_id: t.node_id,
        title: t.title.substring(0, 499),
        completion_definition: t.completion_definition,
        scheduled_for: today,
        scheduled_time: t.scheduled_time || '09:00',
        status: 'PENDING'
      }))

    if (taskInserts.length === 0) {
      return NextResponse.json({ error: 'AI returned no tasks linked to valid frontier nodes' }, { status: 500 })
    }

    const { data: insertedTasks, error: insertErr } = await supabase
      .from('tasks')
      .insert(taskInserts)
      .select()

    if (insertErr || !insertedTasks) {
      console.error('[TaskGen] Insert failed:', insertErr)
      return NextResponse.json({ error: 'Failed to save tasks to database' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      taskCount: insertedTasks.length,
      frontierCount: frontier.length
    })

  } catch (error) {
    console.error('[TaskGen] Internal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
