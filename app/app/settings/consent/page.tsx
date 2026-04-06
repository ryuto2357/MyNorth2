'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const CONSENT_OPTIONS = [
  { value: 'METRICS_ONLY', label: 'Metrics Only', desc: 'Completion rate, streak, last active' },
  { value: 'GOALS_VISIBLE', label: 'Goals Visible', desc: '+ Goal titles, milestones, deadlines' },
  { value: 'FULL_PLAN_ACCESS', label: 'Full Plan Access', desc: '+ Tasks, familiarity scores, constellation' },
  { value: 'BEHAVIORAL_PATTERNS', label: 'Behavioral Patterns', desc: '+ Avoidance signals, I_gap (Counselor only)' },
]

export default function ConsentSettings() {
  const [userId, setUserId] = useState<string | null>(null)
  const [links, setLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)

      const { data } = await supabase
        .from('supervisor_links')
        .select('*, users!supervisor_links_supervisor_id_fkey(name, email, role)')
        .eq('student_id', session.user.id)

      setLinks(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function updateConsent(linkId: string, consentLevel: string) {
    setUpdating(linkId)
    await fetch('/api/supervisor/consent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId, consentLevel, studentId: userId }),
    })
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, consent_level: consentLevel } : l))
    setUpdating(null)
  }

  async function removeLink(linkId: string) {
    if (!confirm('Remove this supervisor link?')) return
    await fetch('/api/supervisor/consent', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId, studentId: userId }),
    })
    setLinks(prev => prev.filter(l => l.id !== linkId))
  }

  if (loading) return <div className="p-8 animate-pulse">Loading...</div>

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/app" className="text-gray-700 hover:text-gray-800 text-sm mb-6 inline-block">← Back to Dashboard</Link>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy & Consent</h1>
      <p className="text-gray-600 mb-8">Control what your counselors and parents can see about your progress.</p>

      {links.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No supervisors linked to your account.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {links.map((link) => {
            const supervisor = link.users
            const isCounselor = link.supervisor_role === 'COUNSELOR'
            const options = isCounselor ? CONSENT_OPTIONS : CONSENT_OPTIONS.filter(o => o.value !== 'BEHAVIORAL_PATTERNS')

            return (
              <div key={link.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{supervisor?.name || 'Unknown'}</h3>
                    <p className="text-sm text-gray-500">{link.supervisor_role} · {supervisor?.email}</p>
                  </div>
                  <button onClick={() => removeLink(link.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Remove</button>
                </div>
                <div className="space-y-2">
                  {options.map((opt) => (
                    <label key={opt.value} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                      link.consent_level === opt.value ? 'border-gray-500 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name={`consent-${link.id}`}
                        checked={link.consent_level === opt.value}
                        onChange={() => updateConsent(link.id, opt.value)}
                        disabled={updating === link.id}
                        className="mr-3"
                      />
                      <div>
                        <p className="font-medium text-sm text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
