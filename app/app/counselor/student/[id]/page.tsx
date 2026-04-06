'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function StudentDetailPage() {
  const params = useParams()
  const studentId = params.id as string
  const [supervisorId, setSupervisorId] = useState<string | null>(null)
  const [link, setLink] = useState<any>(null)
  const [student, setStudent] = useState<any>(null)
  const [goals, setGoals] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [relayMessage, setRelayMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setSupervisorId(session.user.id)

      // Get supervisor link + consent level
      const { data: linkData } = await supabase
        .from('supervisor_links')
        .select('*')
        .eq('supervisor_id', session.user.id)
        .eq('student_id', studentId)
        .single()

      if (!linkData) { setLoading(false); return }
      setLink(linkData)

      // Fetch student profile
      const { data: studentData } = await supabase.from('users').select('name, email, gate_pace, pace_gap, stretch_factor, patterns, updated_at').eq('id', studentId).single()
      setStudent(studentData)

      // Fetch goals if consent allows
      if (['GOALS_VISIBLE', 'FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'].includes(linkData.consent_level)) {
        const { data: goalsData } = await supabase.from('goals').select('*').eq('user_id', studentId).eq('status', 'ACTIVE').order('priority_rank')
        
        // Enrich goals with gate counts if full access
        if (goalsData && ['FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'].includes(linkData.consent_level)) {
          const enriched = await Promise.all(goalsData.map(async (g) => {
            const { data: nodes } = await supabase.from('game_plan_nodes').select('status').eq('goal_id', g.id)
            const total = nodes?.length || 0
            const cleared = nodes?.filter(n => n.status === 'COMPLETED').length || 0
            return { ...g, totalGates: total, clearedGates: cleared }
          }))
          setGoals(enriched)
        } else {
          setGoals(goalsData || [])
        }
      }

      // Fetch tasks if full plan access
      if (['FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'].includes(linkData.consent_level)) {
        const { data: tasksData } = await supabase.from('tasks').select('*').eq('user_id', studentId).order('scheduled_for', { ascending: false }).limit(50)
        setTasks(tasksData || [])
      }

      setLoading(false)
    }
    load()
  }, [studentId])

  async function sendRelay() {
    if (!relayMessage.trim() || !supervisorId) return
    setSending(true)
    await fetch('/api/relay/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId: supervisorId, toUserId: studentId, content: relayMessage }),
    })
    setRelayMessage('')
    setSending(false)
  }

  if (loading) return <div className="p-8 animate-pulse">Loading student data...</div>
  if (!link) return <div className="p-8"><p className="text-red-600">No link to this student found.</p></div>

  const consent = link.consent_level

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/app/counselor" className="text-gray-700 hover:text-gray-800 text-sm mb-6 inline-block">← Back to Dashboard</Link>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">{student?.name || 'Student'}</h1>
      <p className="text-sm text-gray-500 mb-8">Consent: {consent.replace(/_/g, ' ')} · Last active: {student?.updated_at ? new Date(student.updated_at).toLocaleDateString() : 'Unknown'}</p>

      {/* Metrics — always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{(student?.gate_pace || 0).toFixed(2)}</p>
          <p className="text-xs text-gray-500">Pace (gates/day)</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-700">{(student?.stretch_factor || 1.1).toFixed(2)}</p>
          <p className="text-xs text-gray-500">Stretch Factor</p>
        </div>
        {consent === 'BEHAVIORAL_PATTERNS' && (
          <>
            <div className="card text-center">
              <p className="text-2xl font-bold text-amber-600">{(student?.pace_gap || 1.0).toFixed(2)}</p>
              <p className="text-xs text-gray-500">Pace Gap</p>
            </div>
            <div className="card text-center overflow-hidden">
              <p className="text-xs text-gray-600 truncate px-2">{student?.patterns?.avoidance_patterns || 'No patterns yet'}</p>
              <p className="text-xs text-gray-500">Avoidance</p>
            </div>
          </>
        )}
      </div>

      {/* Goals */}
      {['GOALS_VISIBLE', 'FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'].includes(consent) && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Goals</h2>
          <div className="space-y-3">
            {goals.map(g => (
              <div key={g.id} className="card">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-gray-900">{g.title}</h3>
                  <span className="text-xs text-gray-500">Deadline: {g.deadline || 'None'}</span>
                </div>
                {g.totalGates > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(g.clearedGates / g.totalGates) * 100}%` }} />
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {g.clearedGates !== undefined ? `${g.clearedGates} / ${g.totalGates} gates cleared` : 'Plan not yet generated'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {['FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'].includes(consent) && tasks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Recent Tasks</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tasks.slice(0, 20).map(t => (
              <div key={t.id} className={`card py-2 px-4 flex justify-between items-center ${t.status === 'COMPLETED' ? 'opacity-60' : ''}`}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.title}</p>
                  <p className="text-xs text-gray-400 italic mt-0.5">&ldquo;{t.completion_definition || 'No definition'}&rdquo;</p>
                  <p className="text-[10px] text-gray-400 mt-1">{t.scheduled_for}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                  t.status === 'ATTEMPTED' ? 'bg-amber-100 text-amber-700' :
                  t.status === 'SKIPPED' ? 'bg-gray-100 text-gray-500' :
                  'bg-blue-100 text-blue-700'
                }`}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relay Message */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Send Message via Morgan</h2>
        <p className="text-sm text-gray-500 mb-3">Morgan will translate your message into the student&apos;s language register.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={relayMessage}
            onChange={(e) => setRelayMessage(e.target.value)}
            placeholder="Type your message..."
            className="input-base flex-1"
          />
          <button onClick={sendRelay} disabled={sending || !relayMessage.trim()} className="btn-primary">
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
