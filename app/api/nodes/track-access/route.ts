import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Track node access for WITHERING trigger
 * Called when:
 * - Node is clicked in constellation UI
 * - Node is used in task generation
 * - Node is mentioned in Morgan chat
 */
export async function POST(req: NextRequest) {
  const { nodeId, userId } = await req.json()

  if (!nodeId || !userId) {
    return NextResponse.json({ error: 'Missing nodeId or userId' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data, error } = await supabase
      .from('nodes')
      .update({
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', nodeId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      node: data,
    })
  } catch (err: any) {
    console.error('Node access tracking error:', err)
    return NextResponse.json({ error: err.message || 'Failed to track access' }, { status: 500 })
  }
}
