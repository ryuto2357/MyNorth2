import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chat } from '@/lib/gemini'
import { addDays, format } from 'date-fns'

/**
 * Hard Day Protocol: Generate minimal tasks when student is struggling
 * Override the normal workload calculation with just 15 minutes
 * Focus on emotional support + single achievable task
 */
export async function POST(req: NextRequest) {
  const { goalId, userId, tone = 'supportive' } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: goal } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single()

  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
  }

  // Get nodes
  let nodes = (
    await supabase
      .from('nodes')
      .select('*')
      .eq('goal_id', goalId)
      .in('seniority_level', [1, 2])
      .order('seniority_level')
  ).data

  if (!nodes || nodes.length === 0) {
    return NextResponse.json({ error: 'No constellation nodes found. Generate constellation first.' }, { status: 400 })
  }

  const nodeList = nodes
    .map((n: any) => `- [node_id: "${n.id}"] "${n.label}" (level ${n.seniority_level})`)
    .join('\n')

  // ============================================
  // Hard Day Protocol: Generate 1 tiny task (15 min)
  // ============================================
  const hardDayPrompt = `HARD DAY MODE - Student is struggling and needs compassion + tiny achievable win.

Goal: "${goal.title}"
Deadline: ${goal.deadline || 'Not set'}

Topics available:
${nodeList}

**GENERATE ONLY 1 TASK** - Make it:
✓ TINY (exactly 10-15 minutes)
✓ DOABLE (not overwhelming - something they CAN complete today)
✓ ENCOURAGING (first step, not intimidating)
✓ SPECIFIC (clear what to do)

Think: "What's the smallest win they can get today?"

Example good tasks:
- "Watch the 8-minute intro video (don't take notes yet)"
- "Read the first page and write 1 sentence about what you learned"
- "Do just the first 5 practice problems (not all 20)"

Return ONLY valid JSON:
{
  "tasks": [
    {
      "title": "One tiny, doable task",
      "description": "Exactly what to do in one sentence",
      "duration_minutes": 12,
      "day_offset": 0,
      "node_id": "exact-uuid-from-list",
      "scheduled_time": "14:00"
    }
  ]
}

Include a motivational emoji. This student is struggling - be kind.`

  let raw: string
  try {
    raw = await chat(
      [{ role: 'user', content: hardDayPrompt }],
      'You output only valid JSON. No markdown, no explanation, just the JSON object.'
    )
  } catch (err: any) {
    return NextResponse.json({ error: `Generation failed: ${err.message}` }, { status: 500 })
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Invalid JSON from AI' }, { status: 500 })
  }

  const nodeIdSet = new Set(nodes.map((n: any) => n.id))
  const today = new Date()

  const taskInserts = (parsed.tasks || [])
    .filter((t: any) => nodeIdSet.has(t.node_id))
    .map((t: any) => ({
      user_id: userId,
      goal_id: goalId,
      node_id: t.node_id,
      title: String(t.title).substring(0, 499),
      description: t.description || '',
      duration_minutes: Math.min(Math.max(t.duration_minutes || 15, 10), 20), // Clamp to 10-20min
      scheduled_for: format(addDays(today, t.day_offset || 0), 'yyyy-MM-dd'),
      scheduled_time: t.scheduled_time || '14:00',
      status: 'PENDING',
    }))

  if (taskInserts.length === 0) {
    return NextResponse.json({ error: 'Could not generate hard day task' }, { status: 500 })
  }

  const { data: insertedTasks, error: taskError } = await supabase
    .from('tasks')
    .insert(taskInserts)
    .select()

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: "You've got this. Just 10-15 minutes. That's all.",
    taskCount: insertedTasks.length,
    dailyBudget: 15,
    tasks: insertedTasks,
    motivation: "Small wins compound. Do this, and celebrate. You're stronger than today feels.",
  })
}
