import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthUser } from '@/lib/auth-api'

/** Return today's date as YYYY-MM-DD in local time. */
function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// PATCH /api/tasks/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { status } = await req.json()
    const { id } = params

    const allowed = ['PENDING', 'COMPLETED', 'ATTEMPTED', 'SKIPPED'] as const
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const supabase = createServerClient()
    const now = new Date().toISOString()

    // --------------------------------------------------
    // 1. Update the task — verify ownership
    // --------------------------------------------------
    const taskUpdate: Record<string, unknown> = { status, updated_at: now }
    if (['COMPLETED', 'ATTEMPTED', 'SKIPPED'].includes(status)) {
      taskUpdate.completed_at = now
    } else {
      taskUpdate.completed_at = null
    }

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .update(taskUpdate)
      .eq('id', id)
      .eq('user_id', authUser.id)
      .select()
      .single()

    if (taskError || !task) {
      if (taskError) console.error('Task update failed:', taskError.message)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Non-terminal status — nothing else to do
    if (status === 'PENDING') {
      return NextResponse.json({ task })
    }

    // --------------------------------------------------
    // 2. If task is linked to a game_plan_node, update gate_pace
    // --------------------------------------------------
    if (status === 'COMPLETED' && task.game_plan_node_id) {
      const { data: user } = await supabase
        .from('users')
        .select('gates_cleared_log')
        .eq('id', authUser.id)
        .single()

      if (user) {
        const log = Array.isArray(user.gates_cleared_log) ? user.gates_cleared_log : []
        const newLog = [...log, { date: todayDate(), node_id: task.game_plan_node_id }]

        const fourteenDaysAgo = new Date()
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
        const recentClears = newLog.filter(
          (e: { date: string }) => new Date(e.date) >= fourteenDaysAgo
        )
        const newGatePace = recentClears.length / 14

        await supabase
          .from('users')
          .update({
            gates_cleared_log: newLog,
            gate_pace: newGatePace,
            updated_at: now,
          })
          .eq('id', authUser.id)
      }
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error('Task PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
