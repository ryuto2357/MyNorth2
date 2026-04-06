'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { format, subDays, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { User, Goal, Task } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(name?: string): string {
  const hour = new Date().getHours()
  const displayName = name || 'Friend'
  if (hour < 12) return `Good morning, ${displayName}!`
  if (hour < 18) return `Good afternoon, ${displayName}!`
  return `Good evening, ${displayName}!`
}

function computeStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0

  const uniqueSorted = Array.from(new Set(completedDates)).sort().reverse()
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  // Streak must start from today or yesterday
  if (uniqueSorted[0] !== today && uniqueSorted[0] !== yesterday) return 0

  let streak = 0
  let checkDate = uniqueSorted[0] === today ? new Date() : subDays(new Date(), 1)

  for (let i = 0; i < 365; i++) {
    const dateStr = format(checkDate, 'yyyy-MM-dd')
    if (uniqueSorted.includes(dateStr)) {
      streak++
      checkDate = subDays(checkDate, 1)
    } else {
      break
    }
  }

  return streak
}

function gateProgress(clearedGates: number, totalGates: number): number | null {
  if (totalGates === 0) return null
  return Math.min(100, Math.round((clearedGates / totalGates) * 100))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [goals, setGoals] = useState<(Goal & { clearedGates: number; totalGates: number })[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const uid = session.user.id
      const today = format(new Date(), 'yyyy-MM-dd')

      // Fetch user, goals, today's tasks, and streak data in parallel
      const [userRes, goalsRes, tasksRes, streakRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', uid).single(),
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', uid)
          .eq('status', 'ACTIVE')
          .order('priority_rank', { ascending: true }),
        supabase
          .from('tasks')
          .select('*')
          .eq('user_id', uid)
          .eq('scheduled_for', today)
          .order('scheduled_time', { ascending: true }),
        supabase
          .from('tasks')
          .select('scheduled_for')
          .eq('user_id', uid)
          .in('status', ['COMPLETED', 'ATTEMPTED']),
      ])

      if (userRes.data) setUser(userRes.data)

      if (goalsRes.data && goalsRes.data.length > 0) {
        // Enrich goals with gate counts from game_plan_nodes
        const enriched = await Promise.all(goalsRes.data.map(async (g) => {
          const { data: nodes } = await supabase
            .from('game_plan_nodes')
            .select('status')
            .eq('goal_id', g.id)
          const total = nodes?.length || 0
          const cleared = nodes?.filter(n => n.status === 'COMPLETED').length || 0
          return { ...g, clearedGates: cleared, totalGates: total }
        }))
        setGoals(enriched)
        setSelectedGoalId(goalsRes.data[0].id)
      }

      if (tasksRes.data) setTasks(tasksRes.data)

      if (streakRes.data) {
        const dates = streakRes.data.map((r: { scheduled_for: string }) => r.scheduled_for)
        setStreak(computeStreak(dates))
      }

      setLoading(false)
    }

    load()
  }, [])

  // -----------------------------------------------------------------------
  // Task status actions (optimistic)
  // -----------------------------------------------------------------------

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: Task['status']) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      )

      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })

        if (!res.ok) {
          // Revert on failure
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status: 'PENDING' } : t)),
          )
        }
      } catch {
        // Revert on network error
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'PENDING' } : t)),
        )
      }
    },
    [],
  )

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const todayTaskCount = tasks.length
  const selectedGoal = goals.find((g) => g.id === selectedGoalId) || goals[0]

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse text-gray-600">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="p-8 md:pb-20">
      <div className="max-w-6xl">
        {/* ── Greeting & Stats Row ────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {getGreeting(user?.name)}
            </h1>
            <p className="text-gray-600 mt-1">
              Let&apos;s make progress on your goals today.
            </p>
          </div>

          <div className="flex gap-6">
            {/* Streak */}
            <div className="card flex items-center gap-3 py-3 px-5">
              <span className="text-2xl">&#x1F525;</span>
              <div>
                <p className="text-2xl font-bold text-gray-700">{streak}</p>
                <p className="text-xs text-gray-500">day streak</p>
              </div>
            </div>

            {/* Today's task count */}
            <div className="card flex items-center gap-3 py-3 px-5">
              <span className="text-2xl">&#x2705;</span>
              <div>
                <p className="text-2xl font-bold text-gray-700">{todayTaskCount}</p>
                <p className="text-xs text-gray-500">
                  task{todayTaskCount !== 1 ? 's' : ''} today
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Goal Selector Tabs ─────────────────────────────────── */}
        {goals.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2 items-center">
            {goals.map((goal, idx) => (
              <button
                key={goal.id}
                onClick={() => setSelectedGoalId(goal.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedGoalId === goal.id
                    ? 'bg-gray-700 text-white shadow-lg'
                    : 'bg-white text-gray-700 border-2 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Goal {idx + 1}: {goal.title.substring(0, 30)}
                {goal.title.length > 30 ? '...' : ''}
              </button>
            ))}
            <Link
              href="/app/add-goal"
              className="px-4 py-2 rounded-lg font-medium bg-white border-2 border-dashed border-gray-300 text-gray-700 hover:bg-gray-50 transition-all"
            >
              + Add Goal
            </Link>
          </div>
        )}

        {/* ── Active Goals with Progress Bars ────────────────────── */}
        {goals.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {goals.map((goal) => {
              const pct = gateProgress(goal.clearedGates, goal.totalGates)
              return (
                <button
                  key={goal.id}
                  onClick={() => setSelectedGoalId(goal.id)}
                  className={`card text-left transition-all ${
                    selectedGoalId === goal.id
                      ? 'ring-2 ring-gray-500 bg-gray-50'
                      : 'hover:shadow-md'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900 mb-1 truncate">
                    {goal.title}
                  </h3>
                  {pct !== null ? (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{goal.clearedGates} / {goal.totalGates} gates</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-gray-700 h-2.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 mt-2 italic">Plan not yet generated</p>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Selected Goal Detail ───────────────────────────────── */}
        {selectedGoal && (
          <div className="card mb-8 bg-gradient-to-br from-gray-50 to-white">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                    Priority {selectedGoal.priority_rank || 1}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedGoal.title}
                </h2>
                {selectedGoal.why && (
                  <p className="text-gray-600 text-sm mt-1">{selectedGoal.why}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-white/50 rounded p-4">
                <p className="text-gray-600 text-sm">Gates Cleared</p>
                <p className="text-2xl font-bold text-gray-700">
                  {selectedGoal.clearedGates}
                  <span className="text-base font-normal text-gray-400"> / {selectedGoal.totalGates}</span>
                </p>
              </div>
              <div className="bg-white/50 rounded p-4">
                <p className="text-gray-600 text-sm">Deadline</p>
                <p className="text-2xl font-bold text-gray-700">
                  {selectedGoal.deadline ?? '--'}
                </p>
              </div>
              <div className="bg-white/50 rounded p-4">
                <p className="text-gray-600 text-sm">Familiarity</p>
                <p className="text-2xl font-bold text-gray-700">
                  {selectedGoal.familiarity_baseline ?? '--'}/10
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Today's Tasks ──────────────────────────────────────── */}
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Today&apos;s Tasks</h2>

          {tasks.length === 0 ? (
            <p className="text-gray-500">
              No tasks scheduled for today. Chat with Morgan to generate some!
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tasks.map((task) => {
                const isDone = task.status === 'COMPLETED'
                const isAttempted = task.status === 'ATTEMPTED'
                const isSkipped = task.status === 'SKIPPED'
                const isResolved = isDone || isAttempted || isSkipped

                return (
                  <li
                    key={task.id}
                    className={`flex items-center justify-between py-4 gap-4 ${
                      isResolved ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium truncate ${
                          isDone
                            ? 'line-through text-gray-400'
                            : 'text-gray-900'
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.completion_definition && (
                        <p className="text-xs text-gray-400 italic truncate mt-0.5">
                          Done when: {task.completion_definition}
                        </p>
                      )}
                      {task.scheduled_time && (
                        <p className="text-xs text-gray-400">{task.scheduled_time}</p>
                      )}
                    </div>

                    {isResolved ? (
                      <span
                        className={`text-xs font-semibold px-3 py-1 rounded-full ${
                          isDone
                            ? 'bg-green-100 text-green-700'
                            : isAttempted
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {isDone ? 'Completed' : isAttempted ? 'Tried' : 'Skipped'}
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
                          className="text-sm px-3 py-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── Quick Links ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link
            href="/app/chat"
            className="card hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="text-4xl mb-4">&#x1F916;</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
              Chat with Morgan
            </h3>
            <p className="text-gray-600 text-sm">
              Get personalized advice and generate tasks
            </p>
          </Link>

          <Link
            href="/app/constellation"
            className="card hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="text-4xl mb-4">&#x2728;</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
              Constellation
            </h3>
            <p className="text-gray-600 text-sm">
              Visualize your knowledge graph and progress
            </p>
          </Link>

          <Link
            href="/app/tasks"
            className="card hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="text-4xl mb-4">&#x2705;</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
              All Tasks
            </h3>
            <p className="text-gray-600 text-sm">
              View and manage your full task list
            </p>
          </Link>
        </div>

        {/* ── Morgan Tip ─────────────────────────────────────────── */}
        <div className="card bg-gradient-to-r from-gray-700 to-gray-800 text-white">
          <p className="text-lg font-semibold mb-2">Morgan&apos;s Tip</p>
          <p>
            &ldquo;15 minutes compounds. The minimum viable daily action isn&apos;t
            about perfection &mdash; it&apos;s about momentum. Do something today, no
            matter how small. You&apos;ve got this.&rdquo;
          </p>
        </div>
      </div>
    </div>
  )
}
