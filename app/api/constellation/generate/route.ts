import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chat } from '@/lib/gemini'

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

  // Check if constellation already exists for this goal
  const { data: existingNodes } = await supabase
    .from('nodes')
    .select('*')
    .eq('goal_id', goalId)

  if (existingNodes && existingNodes.length > 0) {
    // Constellation already exists, just return it
    const { data: existingLinks } = await supabase.from('links').select('*')
    const nodeIds = new Set(existingNodes.map(n => n.id))
    const filteredLinks = (existingLinks || []).filter(
      (l: any) => nodeIds.has(l.source_id) && nodeIds.has(l.target_id)
    )
    return NextResponse.json({
      success: true,
      nodeCount: existingNodes.length,
      linkCount: filteredLinks.length,
      existing: true,
    })
  }

  const prompt = `Break down this student's goal into a knowledge constellation.

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

  if (nodeError) {
    return NextResponse.json({ error: nodeError.message }, { status: 500 })
  }

  // Build label -> id map
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

  return NextResponse.json({
    success: true,
    nodeCount: insertedNodes.length,
    linkCount: linkInserts.length,
  })
}
