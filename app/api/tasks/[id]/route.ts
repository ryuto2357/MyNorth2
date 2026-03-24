import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { updateGoalCompletionRate } from '@/lib/completion-rate'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { status } = await req.json()
  const { id } = params

  const allowed = ['PENDING', 'COMPLETED', 'SKIPPED']
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch the current task to check previous state
  const { data: currentTask, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !currentTask) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // Build update object
  const updateObj: any = {
    status,
    updated_at: new Date().toISOString(),
  }

  // If marking complete, set completed_at timestamp (only if not already set)
  if (status === 'COMPLETED' && !currentTask.completed_at) {
    updateObj.completed_at = new Date().toISOString()
  }

  // If un-completing, clear completed_at
  if (status !== 'COMPLETED' && currentTask.completed_at) {
    updateObj.completed_at = null
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updateObj)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Recalculate completion rate for the goal
  if (currentTask.goal_id && currentTask.user_id) {
    try {
      await updateGoalCompletionRate(supabase, currentTask.goal_id, currentTask.user_id)
    } catch (rateError) {
      console.error('Error updating completion rate:', rateError)
      // Don't fail the request if completion rate update fails
    }
  }

  return NextResponse.json({ task: data })
}
