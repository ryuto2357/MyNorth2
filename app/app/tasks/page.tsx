'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, isToday, isTomorrow, parseISO, addDays } from 'date-fns'

function getStatusStyle(status: string) {
  if (status === 'COMPLETED') return 'opacity-60'
  if (status === 'SKIPPED') return 'opacity-40'
  return ''
}

function TaskCard({
  task,
  onUpdate,
}: {
  task: any
  onUpdate: (id: string, status: string) => void
}) {
  return (
    <div
      className={`card flex items-start gap-4 transition-all ${getStatusStyle(task.status)}`}
    >
      {/* Complete toggle */}
      <button
        onClick={() =>
          onUpdate(task.id, task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED')
        }
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
          task.status === 'COMPLETED'
            ? 'bg-green-500 border-green-500'
            : 'border-gray-300 hover:border-celestial-500'
        }`}
      >
        {task.status === 'COMPLETED' && (
          <span className="text-white text-xs font-bold">✓</span>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`font-medium text-sm ${
            task.status === 'COMPLETED'
              ? 'line-through text-gray-400'
              : task.status === 'SKIPPED'
                ? 'line-through text-gray-400'
                : 'text-obsidian'
          }`}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{task.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
            {task.duration_minutes} min
          </span>
          {task.scheduled_time && (
            <span className="text-xs text-gray-400">{task.scheduled_time}</span>
          )}
        </div>
      </div>

      {task.status === 'PENDING' && (
        <button
          onClick={() => onUpdate(task.id, 'SKIPPED')}
          className="text-xs text-gray-300 hover:text-gray-500 flex-shrink-0 transition-colors"
        >
          Skip
        </button>
      )}
    </div>
  )
}

function dateLabel(dateStr: string) {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEEE, MMM d')
}

function groupByDate(tasks: any[]) {
  const groups: Record<string, any[]> = {}
  for (const task of tasks) {
    if (!groups[task.scheduled_for]) groups[task.scheduled_for] = []
    groups[task.scheduled_for].push(task)
  }
  return groups
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [goal, setGoal] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const uid = session.user.id
    setUserId(uid)

    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'ACTIVE')
      .limit(1)

    if (goals && goals.length > 0) {
      setGoal(goals[0])
    }

    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', uid)
      .gte('scheduled_for', format(new Date(), 'yyyy-MM-dd'))
      .lte('scheduled_for', format(addDays(new Date(), 6), 'yyyy-MM-dd'))
      .order('scheduled_for')
      .order('scheduled_time')

    setTasks(tasksData || [])
    setLoading(false)
  }

  async function generateTasks() {
    if (!goal || !userId) return
    setGenerating(true)
    setError('')

    const res = await fetch('/api/tasks/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId: goal.id, userId }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Task generation failed')
    } else {
      await loadData()
    }
    setGenerating(false)
  }

  async function updateTask(id: string, status: string) {
    // Optimistic update
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status } : t)))

    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-celestial-600 animate-pulse">Loading tasks...</div>
      </div>
    )
  }

  const grouped = groupByDate(tasks)
  const sortedDates = Object.keys(grouped).sort()
  const todayTasks = tasks.filter(t => isToday(parseISO(t.scheduled_for)))
  const completedToday = todayTasks.filter(t => t.status === 'COMPLETED').length

  return (
    <div className="p-8 md:pb-20 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-obsidian">Tasks</h1>
          {todayTasks.length > 0 && (
            <p className="text-gray-500 text-sm mt-1">
              {completedToday}/{todayTasks.length} completed today
            </p>
          )}
        </div>
        {goal && (
          <button
            onClick={generateTasks}
            disabled={generating}
            className="btn-primary text-sm"
          >
            {generating ? (
              <span className="flex items-center gap-1">
                <span className="animate-spin inline-block">✦</span> Generating...
              </span>
            ) : tasks.length > 0 ? (
              '+ More Tasks'
            ) : (
              '✨ Generate Tasks'
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded text-sm mb-4">{error}</div>
      )}

      {tasks.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-obsidian mb-2">No tasks yet</h2>
          <p className="text-gray-600 mb-6 max-w-sm mx-auto">
            Generate your first week of tasks. Morgan will break your goal into concrete 15-30
            minute actions.
          </p>
          {!goal ? (
            <p className="text-sm text-gray-400">Complete onboarding first to get started.</p>
          ) : generating ? (
            <div className="text-celestial-600 animate-pulse">
              Morgan is planning your week...
            </div>
          ) : (
            <button onClick={generateTasks} className="btn-primary">
              Generate My Tasks
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDates.map(date => (
            <div key={date}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                {dateLabel(date)}
              </h2>
              <div className="space-y-2">
                {grouped[date].map(task => (
                  <TaskCard key={task.id} task={task} onUpdate={updateTask} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
