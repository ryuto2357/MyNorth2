import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'
import { chat } from '@/lib/gemini'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { goalId } = await req.json()
    const userId = authUser.id
    const supabase = createServerClient()

    // Verify user owns this goal
    const { data: goal } = await supabase
      .from('goals')
      .select('id, title, why, deadline, familiarity_baseline')
      .eq('id', goalId)
      .eq('user_id', userId)
      .single()

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    // Check if constellation already exists for this goal
    const { data: existingNodes } = await supabase
      .from('nodes')
      .select('id')
      .eq('goal_id', goalId)
      .eq('user_id', userId)

    if (existingNodes && existingNodes.length > 0) {
      // Constellation already exists — fetch links scoped to these nodes only
      const nodeIds = existingNodes.map(n => n.id)
      const { data: existingLinks } = await supabase
        .from('links')
        .select('id')
        .in('source_id', nodeIds)

      return NextResponse.json({
        success: true,
        nodeCount: existingNodes.length,
        linkCount: existingLinks?.length ?? 0,
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
    } catch (error) {
      console.error('Constellation generation failed:', error)
      return NextResponse.json({ error: 'Failed to generate constellation' }, { status: 500 })
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
    }

    let parsed: { nodes?: unknown[]; links?: unknown[] }
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Invalid JSON from AI' }, { status: 500 })
    }

    const { nodes: nodeData, links: linkData } = parsed

    if (!Array.isArray(nodeData) || nodeData.length === 0) {
      return NextResponse.json({ error: 'AI returned no nodes' }, { status: 500 })
    }

    const nodeInserts = nodeData.map((n: Record<string, unknown>) => ({
      user_id: userId,
      goal_id: goalId,
      label: String(n.label ?? '').substring(0, 499),
      description: String(n.description ?? ''),
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
      console.error('Node insert failed:', nodeError?.message)
      return NextResponse.json({ error: 'Failed to create constellation' }, { status: 500 })
    }

    // Build label -> id map
    const labelMap: Record<string, string> = {}
    for (const node of insertedNodes) {
      labelMap[node.label] = node.id
    }

    const linkInserts = (Array.isArray(linkData) ? linkData : [])
      .filter((l: Record<string, unknown>) => labelMap[l.source_label as string] && labelMap[l.target_label as string])
      .map((l: Record<string, unknown>) => ({
        source_id: labelMap[l.source_label as string],
        target_id: labelMap[l.target_label as string],
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
  } catch (error) {
    console.error('Constellation generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
