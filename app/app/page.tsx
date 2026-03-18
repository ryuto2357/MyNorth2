'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { User, Goal } from '@/types'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)

  useEffect(() => {
    const loadUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (userData) setUser(userData)

      const { data: goalsData } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'ACTIVE')
        .order('priority_rank', { ascending: true })

      if (goalsData && goalsData.length > 0) {
        setGoals(goalsData)
        // Set the first goal as selected by default
        setSelectedGoalId(goalsData[0].id)
      }

      setLoading(false)
    }

    loadUserData()
  }, [])

  const selectedGoal = goals.find(g => g.id === selectedGoalId) || goals[0]

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
        <h1 className="text-3xl font-bold text-obsidian mb-2">
          Welcome back, <span className="text-celestial-600">{user?.name || 'Friend'}</span>!
        </h1>
        <p className="text-gray-600 mb-8">Let's make progress on your goals today</p>

        {goals.length > 0 && (
          <>
            {/* Goals Navigation with Add Button */}
            <div className="mb-8 flex flex-wrap gap-2 items-center">
              {goals.map((goal, idx) => (
                <button
                  key={goal.id}
                  onClick={() => setSelectedGoalId(goal.id)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    selectedGoalId === goal.id
                      ? 'bg-celestial-600 text-white shadow-lg'
                      : 'bg-white text-celestial-600 border-2 border-celestial-200 hover:bg-celestial-50'
                  }`}
                >
                  Goal {idx + 1}: {goal.title.substring(0, 30)}
                  {goal.title.length > 30 ? '...' : ''}
                </button>
              ))}

              {/* Add Goal Button */}
              <Link
                href="/app/add-goal"
                className="px-4 py-2 rounded-lg font-medium bg-white border-2 border-dashed border-celestial-300 text-celestial-600 hover:bg-celestial-50 transition-all"
              >
                + Add Goal
              </Link>
            </div>

            {/* Selected Goal Card */}
            {selectedGoal && (
              <div className="card mb-8 bg-gradient-to-br from-celestial-50 to-white">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-celestial-600 bg-celestial-100 px-3 py-1 rounded-full">
                        Priority {selectedGoal.priority_rank || 1}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold text-obsidian">{selectedGoal.title}</h2>
                    <p className="text-gray-600 text-sm mt-1">{selectedGoal.why}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="bg-white/50 rounded p-4">
                    <p className="text-gray-600 text-sm">Days Remaining</p>
                    <p className="text-2xl font-bold text-celestial-600">
                      {selectedGoal.days_effective || '--'}
                    </p>
                  </div>
                  <div className="bg-white/50 rounded p-4">
                    <p className="text-gray-600 text-sm">Current Familiarity</p>
                    <p className="text-2xl font-bold text-celestial-600">
                      {selectedGoal.familiarity_baseline}/10
                    </p>
                  </div>
                  <div className="bg-white/50 rounded p-4">
                    <p className="text-gray-600 text-sm">Status</p>
                    <p className="text-2xl font-bold text-success">Active</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/app/chat" className="card hover:shadow-md transition-all cursor-pointer group">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold text-obsidian mb-2 group-hover:text-celestial-600">Talk to Morgan</h3>
            <p className="text-gray-600 text-sm">Get personalized advice and task suggestions</p>
          </Link>

          <Link href="/app/constellation" className="card hover:shadow-md transition-all cursor-pointer group">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-lg font-semibold text-obsidian mb-2 group-hover:text-celestial-600">View Constellation</h3>
            <p className="text-gray-600 text-sm">Visualize your goals and progress</p>
          </Link>

          <Link href="/app/tasks" className="card hover:shadow-md transition-all cursor-pointer group">
            <div className="text-4xl mb-4">✓</div>
            <h3 className="text-lg font-semibold text-obsidian mb-2 group-hover:text-celestial-600">Today's Tasks</h3>
            <p className="text-gray-600 text-sm">See your daily actionable items</p>
          </Link>
        </div>

        <div className="card bg-gradient-to-r from-celestial-600 to-celestial-700 text-white mt-8">
          <p className="text-lg font-semibold mb-2">💡 Morgan's Tip</p>
          <p>
            "15 minutes compounds. The minimum viable daily action isn't about perfection—it's about momentum.
            Do something today, no matter how small. You've got this."
          </p>
        </div>
      </div>
    </div>
  )
}
