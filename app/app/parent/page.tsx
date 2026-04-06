'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

function EngagementPulse({ rate }: { rate: number }) {
  const color = rate > 70 ? 'bg-green-500' : rate > 40 ? 'bg-amber-500' : 'bg-red-500'
  const label = rate > 70 ? 'Active' : rate > 40 ? 'Moderate' : 'Low'
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-sm font-medium">{label} ({rate}%)</span>
    </div>
  )
}

export default function ParentDashboard() {
  const [user, setUser] = useState<any>(null)
  const [child, setChild] = useState<any>(null)
  const [link, setLink] = useState<any>(null)
  const [goals, setGoals] = useState<any[]>([])
  const [completionRate, setCompletionRate] = useState(0)
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single()
      setUser(profile)

      // Get linked child
      const { data: links } = await supabase
        .from('supervisor_links')
        .select('*, users!supervisor_links_student_id_fkey(id, name, gate_pace, updated_at)')
        .eq('supervisor_id', session.user.id)
        .limit(1)

      if (!links || links.length === 0) { setLoading(false); return }

      const linkData = links[0]
      setLink(linkData)
      setChild(linkData.users)

      const childId = linkData.users?.id
      if (!childId) { setLoading(false); return }

      // Get task stats
      const { data: tasks } = await supabase
        .from('tasks')
        .select('status, scheduled_for')
        .eq('user_id', childId)
        .gte('scheduled_for', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))

      const completed = (tasks || []).filter(t => t.status === 'COMPLETED').length
      const total = (tasks || []).length
      setCompletionRate(total > 0 ? Math.round((completed / total) * 100) : 0)

      // Streak
      const completedDates = new Set((tasks || []).filter(t => t.status === 'COMPLETED').map(t => t.scheduled_for))
      let s = 0
      const today = new Date()
      for (let i = 0; i < 30; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        if (completedDates.has(d.toISOString().slice(0, 10))) s++
        else if (i > 0) break
      }
      setStreak(s)

      // Goals if consent allows
      if (['GOALS_VISIBLE', 'FULL_PLAN_ACCESS'].includes(linkData.consent_level)) {
        const { data: goalsData } = await supabase.from('goals').select('*').eq('user_id', childId).eq('status', 'ACTIVE')
        setGoals(goalsData || [])
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-8 animate-pulse text-gray-600">Loading...</div>

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Parent Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user?.name || 'Parent'}</p>
        </div>
        <Link href="/app/chat" className="btn-secondary text-sm">Ask Morgan</Link>
      </div>

      {!child ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No child linked yet.</p>
          <Link href="/app/onboarding" className="btn-primary">Link Your Child</Link>
        </div>
      ) : (
        <>
          {/* Child summary */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">{child.name}</h2>
              <EngagementPulse rate={completionRate} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-700">{completionRate}%</p>
                <p className="text-xs text-gray-500">Completion Rate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-700">{streak}</p>
                <p className="text-xs text-gray-500">Day Streak</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">{(child.gate_pace || 0).toFixed(2)}</p>
                <p className="text-xs text-gray-500">Pace (gates/day)</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">Based on activity trends over the past 30 days. Last active: {child.updated_at ? new Date(child.updated_at).toLocaleDateString() : 'Unknown'}</p>
          </div>

          {/* Goals */}
          {goals.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Active Goals</h2>
              <div className="space-y-3">
                {goals.map(g => (
                  <div key={g.id} className="card">
                    <h3 className="font-semibold text-gray-900">{g.title}</h3>
                    <p className="text-xs text-gray-500">Deadline: {g.deadline || 'Not set'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly Brief placeholder */}
          <div className="card bg-amber-50 border-amber-200">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Weekly Counselor Brief</h2>
            <p className="text-sm text-gray-600 italic">No brief this week. Your child's counselor can write a weekly summary here.</p>
          </div>
        </>
      )}
    </div>
  )
}
