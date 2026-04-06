'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Goal, Task } from '@/types'

function statusBadgeClass(status: Task['status']) {
  if (status === 'COMPLETED') return 'bg-green-100 text-green-700'
  if (status === 'ATTEMPTED') return 'bg-yellow-100 text-yellow-700'
  if (status === 'SKIPPED') return 'bg-gray-200 text-gray-600'
  return 'bg-blue-100 text-blue-700'
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTasks = useCallback(async () => {
    setError('')
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setTasks([])
        return
      }

      const userId = session.user.id
      const [tasksRes, goalsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .eq('user_id', userId)
          .order('scheduled_for', { ascending: false })
          .order('scheduled_time', { ascending: true }),
        supabase.from('goals').select('id, title').eq('user_id', userId),
      ])

      if (tasksRes.error) throw tasksRes.error
      if (goalsRes.error) throw goalsRes.error

      setTasks(tasksRes.data || [])
      setGoals(
        Object.fromEntries((goalsRes.data || []).map((g: Pick<Goal, 'id' | 'title'>) => [g.id, g.title])),
      )
    } catch {
      setError('Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const updateTaskStatus = useCallback(
    async (taskId: string, nextStatus: Task['status']) => {
      setError('')
      const prev = tasks
      setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)))

      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        })
        if (!res.ok) throw new Error('Failed')
      } catch {
        setTasks(prev)
        setError('Task update failed. Please try again.')
      }
    },
    [tasks],
  )

  const grouped = useMemo(() => {
    const byDay: Record<string, Task[]> = {}
    for (const task of tasks) {
      const day = task.scheduled_for || 'Unscheduled'
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(task)
    }
    return byDay
  }, [tasks])

  if (loading) {
    return (
      <div className="p-8 flex flex-col gap-4 animate-pulse max-w-4xl mx-auto">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-24 bg-gray-200 rounded" />
        <div className="h-24 bg-gray-200 rounded" />
      </div>
    )
  }

  return (
    <div className="p-8 pb-24 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">All Tasks</h1>
        <p className="text-gray-500 font-medium">View and manage your full task list.</p>
      </div>

      {tasks.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-lg font-bold text-gray-900">No tasks yet</h2>
          <p className="text-sm text-gray-500 mt-2">Generate tasks from your goals to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {Object.entries(grouped).map(([day, dayTasks]) => (
            <section key={day}>
              <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{day}</h2>
              <div className="card p-0 overflow-hidden">
                <ul className="divide-y divide-gray-100">
                  {dayTasks.map((task) => {
                    const isResolved = task.status !== 'PENDING'
                    return (
                      <li key={task.id} className={`p-4 flex items-start justify-between gap-4 ${isResolved ? 'opacity-75' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold truncate ${task.status === 'COMPLETED' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                            {task.title}
                          </p>
                          {task.completion_definition && (
                            <p className="text-xs text-gray-500 italic mt-1 truncate">
                              Done when: {task.completion_definition}
                            </p>
                          )}
                          <div className="mt-1 text-xs text-gray-400 flex items-center gap-2">
                            {task.scheduled_time && <span>{task.scheduled_time}</span>}
                            {task.goal_id && goals[task.goal_id] && <span>• {goals[task.goal_id]}</span>}
                          </div>
                        </div>

                        {isResolved ? (
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadgeClass(task.status)}`}>
                            {task.status}
                          </span>
                        ) : (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => updateTaskStatus(task.id, 'COMPLETED')}
                              className="btn-primary text-sm px-3 py-1"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => updateTaskStatus(task.id, 'ATTEMPTED')}
                              className="btn-secondary text-sm px-3 py-1"
                            >
                              I Tried
                            </button>
                            <button
                              onClick={() => updateTaskStatus(task.id, 'SKIPPED')}
                              className="text-sm px-3 py-1 text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}

      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl">
          {error}
        </div>
      )}
    </div>
  )
}
