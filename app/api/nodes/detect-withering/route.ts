import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { subDays } from 'date-fns'

/**
 * Detect nodes that should be marked as WITHERING
 * WITHERING = Not accessed in 60+ days
 * This endpoint can be called:
 * - Daily as a cron job
 * - On-demand to check without changing status
 */
export async function POST(req: NextRequest) {
  const { userId, checkOnly = false } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const sixtyDaysAgo = subDays(new Date(), 60)

    // Find nodes that haven't been accessed in 60+ days
    const { data: witherNodes, error: checkError } = await supabase
      .from('nodes')
      .select('id, label, goal_id, goal:goals(title), last_accessed_at')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .lt('last_accessed_at', sixtyDaysAgo.toISOString())

    if (checkError) {
      return NextResponse.json({ error: checkError.message }, { status: 500 })
    }

    // If check-only mode, just return the list
    if (checkOnly || !witherNodes || witherNodes.length === 0) {
      return NextResponse.json({
        success: true,
        witherCandidates: witherNodes || [],
        message: `Found ${witherNodes?.length || 0} nodes inactive 60+ days`,
      })
    }

    // Mark them as WITHERING
    const witherNodeIds = witherNodes.map((n: any) => n.id)

    const { error: updateError } = await supabase
      .from('nodes')
      .update({
        status: 'WITHERING',
        updated_at: new Date().toISOString(),
      })
      .in('id', witherNodeIds)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      witherCount: witherNodeIds.length,
      witherNodes: witherNodes,
      message: `Marked ${witherNodeIds.length} nodes as WITHERING. Student should archive or revive them.`,
    })
  } catch (err: any) {
    console.error('WITHERING detection error:', err)
    return NextResponse.json({ error: err.message || 'Detection failed' }, { status: 500 })
  }
}
