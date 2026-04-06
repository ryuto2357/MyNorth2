'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function CounselorDashboard() {
  const [user, setUser] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single()
      setUser(profile)

      // Fetch linked students with their data
      const { data: links } = await supabase
        .from('supervisor_links')
        .select('*, users!supervisor_links_student_id_fkey(id, name, email, gate_pace, pace_gap, gates_cleared_log, updated_at)')
        .eq('supervisor_id', session.user.id)

      if (links) {
        // Enrich with task stats
        const enriched = await Promise.all(links.map(async (link: any) => {
          const student = link.users
          if (!student) return { ...link, stats: null }

          const { data: nodes } = await supabase
            .from('game_plan_nodes')
            .select('status, updated_at')
            .eq('user_id', student.id)
            .eq('status', 'COMPLETED')
            .gte('updated_at', new Date(Date.now() - 30 * 86400000).toISOString())

          const clearedIn30d = (nodes || []).length
          
          // Calculate streak from gates_cleared_log
          const clearedDates = new Set((student.gates_cleared_log || []).map((entry: any) => entry.date.slice(0, 10)))
          let streak = 0
          const today = new Date()
          for (let i = 0; i < 30; i++) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            if (clearedDates.has(d.toISOString().slice(0, 10))) streak++
            else if (i > 0) break
          }

          return { ...link, student, stats: { gatePace: student.gate_pace, streak, clearedIn30d } }
        }))

        setStudents(enriched)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-8 animate-pulse text-gray-600">Loading dashboard...</div>

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Counselor Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user?.name || 'Counselor'}</p>
        </div>
        <Link href="/app/chat" className="btn-secondary text-sm">Chat with Morgan (Analytical)</Link>
      </div>

      {students.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No students linked yet.</p>
          <p className="text-sm text-gray-400">Students can link to you from their Privacy & Consent settings.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => (
            <Link key={s.id} href={`/app/counselor/student/${s.student?.id || s.users?.id}`} className="card hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900">{s.student?.name || s.users?.name || 'Student'}</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  s.consent_level === 'BEHAVIORAL_PATTERNS' ? 'bg-purple-100 text-purple-700' :
                  s.consent_level === 'FULL_PLAN_ACCESS' ? 'bg-blue-100 text-blue-700' :
                  s.consent_level === 'GOALS_VISIBLE' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{s.consent_level.replace(/_/g, ' ')}</span>
              </div>
              {s.stats && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-green-600">{s.stats.gatePace?.toFixed(2) || 0}</p>
                    <p className="text-xs text-gray-500">Pace (g/d)</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-700">{s.stats.streak}</p>
                    <p className="text-xs text-gray-500">Streak</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-400">{s.stats.clearedIn30d}</p>
                    <p className="text-xs text-gray-500">Gates (30d)</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">Last active: {s.student?.updated_at ? new Date(s.student.updated_at).toLocaleDateString() : 'Unknown'}</p>
            </Link>
          ))}
        </div>
      )}

    </div>
  )
}
