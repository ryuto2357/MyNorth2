'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AddGoalPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [formData, setFormData] = useState({
    title: '',
    why: '',
    deadline: '',
    familiarity: 5,
  })

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/auth/login')
      } else {
        setUserId(session.user.id)
      }
    }

    checkUser()
  }, [router])

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      // Validation
      if (!formData.title.trim()) {
        setError('Please enter a goal title')
        setLoading(false)
        return
      }

      if (!formData.why.trim()) {
        setError('Please explain why this goal matters to you')
        setLoading(false)
        return
      }

      if (!formData.deadline) {
        setError('Please select a deadline')
        setLoading(false)
        return
      }

      if (!userId) {
        setError('User not found. Please log in again.')
        setLoading(false)
        return
      }

      // Get the highest priority rank
      const { data: existingGoals, error: fetchError } = await supabase
        .from('goals')
        .select('priority_rank')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .order('priority_rank', { ascending: false })
        .limit(1)

      if (fetchError && fetchError.code !== 'PGRST116') {
        setError('Failed to fetch existing goals')
        setLoading(false)
        return
      }

      const highestPriority = existingGoals && existingGoals.length > 0
        ? existingGoals[0].priority_rank
        : 0

      const newPriority = highestPriority + 1

      // Create new goal
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .insert([
          {
            user_id: userId,
            title: formData.title,
            why: formData.why,
            north_star: formData.title,
            deadline: formData.deadline,
            familiarity_baseline: formData.familiarity,
            completion_rate_history: 0.6,
            status: 'ACTIVE',
            priority_rank: newPriority,
          },
        ])
        .select()

      if (goalError) {
        setError(goalError.message)
        setLoading(false)
        return
      }

      const newGoalId = goalData[0].id

      // Create root node for goal in Constellation
      const { error: nodeError } = await supabase
        .from('nodes')
        .insert([
          {
            user_id: userId,
            goal_id: newGoalId,
            label: formData.title,
            seniority_level: 0,
            cluster_id: `cluster-${newPriority}`,
            status: 'ACTIVE',
            familiarity_score: formData.familiarity,
            description: formData.why,
          },
        ])

      if (nodeError) {
        console.error('Node creation error:', nodeError)
      }

      // Success state
      setSuccessMessage(`✨ Goal "${formData.title}" created successfully!`)
      setFormData({ title: '', why: '', deadline: '', familiarity: 5 })

      // Redirect after success
      setTimeout(() => {
        router.push('/app')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-celestial-50 to-alabaster flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-pulse text-celestial-600 text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-celestial-50 to-alabaster py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/app" className="inline-flex items-center text-celestial-600 hover:text-celestial-700 mb-8">
          ← Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-obsidian mb-2">
            Add a New Goal
          </h1>
          <p className="text-gray-600">
            Expand your horizon. What's the next big thing you want to achieve?
          </p>
        </div>

        <div className="card max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Goal Title */}
            <div>
              <label className="block text-sm font-semibold text-obsidian mb-2">
                What's your goal?
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="input-base"
                placeholder="e.g., Learn Web Development, Get Fit, Master Python"
                disabled={loading}
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Be specific and ambitious</p>
            </div>

            {/* Why it matters */}
            <div>
              <label className="block text-sm font-semibold text-obsidian mb-2">
                Why does this goal matter to you?
              </label>
              <textarea
                value={formData.why}
                onChange={(e) => handleInputChange('why', e.target.value)}
                className="input-base min-h-32 resize-none"
                placeholder="Not the obvious answer — the real one. What will reaching this goal change in your life?"
                disabled={loading}
              />
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-sm font-semibold text-obsidian mb-2">
                When do you want to achieve this?
              </label>
              <input
                type="date"
                value={formData.deadline}
                onChange={(e) => handleInputChange('deadline', e.target.value)}
                className="input-base"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">Give yourself a realistic but challenging deadline</p>
            </div>

            {/* Familiarity */}
            <div>
              <label className="block text-sm font-semibold text-obsidian mb-2">
                How familiar are you with this already?
              </label>
              <div className="space-y-3">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={formData.familiarity}
                  onChange={(e) => handleInputChange('familiarity', parseInt(e.target.value))}
                  className="w-full"
                  disabled={loading}
                />
                <div className="flex justify-between text-sm text-gray-600">
                  <span>0 (Beginner)</span>
                  <span className="font-bold text-celestial-600">{formData.familiarity}/10</span>
                  <span>10 (Expert)</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {successMessage}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Link href="/app" className="btn-secondary flex-1 text-center">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {loading ? 'Creating Goal...' : 'Create Goal'}
              </button>
            </div>
          </form>
        </div>

        {/* Tips Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-obsidian mb-2">💡 Make it SMART</h3>
            <p className="text-sm text-gray-600">Specific, Measurable, Achievable, Relevant, Time-bound. Clear goals are easier to break down into daily actions.</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-obsidian mb-2">📍 Focus Over Quantity</h3>
            <p className="text-sm text-gray-600">Quality over quantity. It's better to have 3 meaningful goals you're committed to than 10 you abandon.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
