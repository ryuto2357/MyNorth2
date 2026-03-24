import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chat } from '@/lib/gemini'
import { addDays, format } from 'date-fns'

export async function POST(req: NextRequest) {
  const { goalId, userId } = await req.json()

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

  // ============================================
  // STEP 1: Get nodes (constellation topics)
  // ============================================
  let nodes = (
    await supabase
      .from('nodes')
      .select('*')
      .eq('goal_id', goalId)
      .in('seniority_level', [1, 2])
      .order('seniority_level')
  ).data

  // Auto-generate constellation if needed
  if (!nodes || nodes.length === 0) {
    const constellationPrompt = `Break down this student's goal into a knowledge constellation.

Goal: "${goal.title}"
Why they want it: "${goal.why || 'Not specified'}"
Deadline: ${goal.deadline || 'Not set'}
Current familiarity (0-10): ${goal.familiarity_baseline || 0}

Create a constellation with:
- 1 ROOT node (the goal itself, seniority_level: 0)
- 3-5 ACHIEVEMENT nodes (major milestones to reach the goal, seniority_level: 1)
- 2-3 SKILL nodes per achievement (specific skills/topics to learn, seniority_level: 2)

Return ONLY valid JSON like this:
{
  "nodes": [
    {
      "label": "Short node title (max 35 chars)",
      "description": "What this covers in 1-2 sentences",
      "seniority_level": 0,
      "cluster_id": "root",
      "familiarity_score": ${goal.familiarity_baseline || 3}
    }
  ],
  "links": [
    { "source_label": "Parent label", "target_label": "Child label", "relation_type": "PARENT_OF" }
  ]
}

Make everything specific and concrete to the goal. No generic placeholders.`

    let raw: string
    try {
      raw = await chat(
        [{ role: 'user', content: constellationPrompt }],
        'You output only valid JSON. No markdown, no explanation, just the JSON object.'
      )
    } catch (err: any) {
      return NextResponse.json(
        { error: `Could not generate constellation: ${err.message}` },
        { status: 500 }
      )
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse constellation response' }, { status: 500 })
    }

    let parsed: any
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Invalid constellation JSON from AI' }, { status: 500 })
    }

    const { nodes: nodeData, links: linkData } = parsed

    const nodeInserts = nodeData.map((n: any) => ({
      user_id: userId,
      goal_id: goalId,
      label: String(n.label).substring(0, 499),
      description: n.description || '',
      seniority_level: n.seniority_level,
      cluster_id: n.cluster_id || 'default',
      familiarity_score: n.familiarity_score || 0,
      status: 'ACTIVE',
    }))

    const { data: insertedNodes, error: nodeError } = await supabase
      .from('nodes')
      .insert(nodeInserts)
      .select()

    if (nodeError || !insertedNodes) {
      return NextResponse.json({ error: nodeError?.message || 'Failed to create nodes' }, { status: 500 })
    }

    const labelMap: Record<string, string> = {}
    for (const node of insertedNodes) {
      labelMap[node.label] = node.id
    }

    const linkInserts = (linkData || [])
      .filter((l: any) => labelMap[l.source_label] && labelMap[l.target_label])
      .map((l: any) => ({
        source_id: labelMap[l.source_label],
        target_id: labelMap[l.target_label],
        relation_type: l.relation_type || 'PARENT_OF',
        strength: 1.0,
      }))

    if (linkInserts.length > 0) {
      await supabase.from('links').insert(linkInserts)
    }

    nodes = insertedNodes
  }

  // ============================================
  // STEP 2: Call workload engine to get constraints
  // ============================================
  let workloadData: any
  try {
    const workloadRes = await fetch(new URL('/api/workload/calculate', process.env.VERCEL_URL || 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId, userId }),
    })

    if (!workloadRes.ok) {
      console.error('Workload calculation failed:', await workloadRes.text())
      return NextResponse.json({ error: 'Failed to calculate workload' }, { status: 500 })
    }

    workloadData = await workloadRes.json()
  } catch (err: any) {
    console.error('Workload fetch error:', err)
    return NextResponse.json({ error: `Workload engine error: ${err.message}` }, { status: 500 })
  }

  let daily_budget_minutes = workloadData.daily_budget_minutes
  let task_count = workloadData.task_count
  let minutes_per_task = workloadData.minutes_per_task
  const in_crunch_mode = workloadData.in_crunch_mode
  let multi_goal_context = ''

  // ============================================
  // STEP 2.5: Check for multi-goal conflicts (arbitration)
  // ============================================
  const { data: activeGoals } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')

  if (activeGoals && activeGoals.length > 1) {
    try {
      const arbitrationRes = await fetch(
        new URL('/api/goals/arbitrate', process.env.VERCEL_URL || 'http://localhost:3000'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        }
      )

      if (arbitrationRes.ok) {
        const arbitrationData = await arbitrationRes.json()

        if (arbitrationData.hasConflict) {
          // Find THIS goal's allocation
          const thisGoalAllocation = arbitrationData.allocations.find(
            (a: any) => a.goalId === goalId
          )

          if (thisGoalAllocation) {
            // Use allocated budget instead of raw workload budget
            daily_budget_minutes = thisGoalAllocation.allocated_daily_budget_min
            task_count = Math.max(1, Math.ceil(daily_budget_minutes / 20))
            task_count = Math.min(11, task_count)
            minutes_per_task = Math.floor(daily_budget_minutes / task_count)

            multi_goal_context = `

**⚠️ MULTI-GOAL MODE**: You have ${activeGoals.length} active goals.
Your time for "${goal.title}" has been allocated to: ${daily_budget_minutes} min/day
This is ${Math.round((daily_budget_minutes / workloadData.daily_budget_minutes) * 100)}% of your original request.
Focus on highest-impact items.`
          }
        } else {
          multi_goal_context = `

✓ Multi-goal check: All goals fit within your schedule (${activeGoals.length} goals total).`
        }
      }
    } catch (arbError) {
      console.error('Arbitration check failed:', arbError)
      // Continue with raw workload budget if arbitration fails
    }
  }

  // ============================================
  // STEP 3: Generate tasks using workload constraints
  // ============================================
  const nodeList = nodes
    .map((n: any) => `- [node_id: "${n.id}"] "${n.label}" (level ${n.seniority_level})`)
    .join('\n')

  const prompt = `Generate exactly ${task_count} tasks for TODAY.

Goal: "${goal.title}"
Why: "${goal.why || ''}"
Deadline: ${goal.deadline || 'Not set'}
Time budget: ${daily_budget_minutes} minutes total (must fit this budget)

Topics available:
${nodeList}

Create exactly ${task_count} tasks that sum to approximately ${daily_budget_minutes} minutes.
${
  in_crunch_mode
    ? `
IMPORTANT: This is CRUNCH MODE. The student is in the final push before deadline.
- Make tasks VERY actionable and hyper-specific
- Each task MUST be completable in ${minutes_per_task} min or less
- Focus on highest-impact items only
- Assume student will be tired but motivated
- Celebrate small wins
`
    : ''
}${multi_goal_context}

Each task must:
- Take EXACTLY ${minutes_per_task} minutes (not more, this is fixed)
- Be specific and actionable (e.g. "Watch intro video on X", "Do 5 practice problems for Y")
- Use one of the node_ids above (copy the exact UUID)
- Have a time: one at 09:00 (morning), one at 14:00 (afternoon), and one at 19:00 (evening)
- Rotate times across tasks

Return ONLY valid JSON:
{
  "tasks": [
    {
      "title": "Specific actionable task",
      "description": "Exactly what to do in one sentence",
      "duration_minutes": ${minutes_per_task},
      "day_offset": 0,
      "node_id": "exact-uuid-from-list",
      "scheduled_time": "09:00"
    }
  ]
}

ALL tasks must be ${minutes_per_task} minutes exactly.`

  let raw: string
  try {
    raw = await chat(
      [{ role: 'user', content: prompt }],
      'You output only valid JSON. No markdown, no explanation, just the JSON object.'
    )
  } catch (err: any) {
    return NextResponse.json({ error: `Gemini error: ${err.message}` }, { status: 500 })
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
      duration_minutes: t.duration_minutes || minutes_per_task,
      scheduled_for: format(addDays(today, t.day_offset || 0), 'yyyy-MM-dd'),
      scheduled_time: t.scheduled_time || '09:00',
      status: 'PENDING',
    }))

  if (taskInserts.length === 0) {
    return NextResponse.json({ error: 'AI did not return valid tasks' }, { status: 500 })
  }

  const { data: insertedTasks, error: taskError } = await supabase
    .from('tasks')
    .insert(taskInserts)
    .select()

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 })
  }

  // ============================================
  // STEP 4: Update goal with workload calculations
  // ============================================
  await supabase
    .from('goals')
    .update({
      inefficiency_last_calculated: new Date().toISOString(),
    })
    .eq('id', goalId)

  return NextResponse.json({
    success: true,
    taskCount: insertedTasks.length,
    dailyBudget: daily_budget_minutes,
    minutesPerTask: minutes_per_task,
    inCrunchMode: in_crunch_mode,
    workloadData: workloadData,
  })
}

