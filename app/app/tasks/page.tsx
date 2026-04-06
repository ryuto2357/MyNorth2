'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FrontierNode {
  id: string
  title: string
  completion_definition: string
  gate_type: 'ACHIEVEMENT' | 'MILESTONE' | 'SKILL' | 'TASK'
  status: string
  goal_title: string
  unlocks: string[]
}

interface FrontierResponse {
  frontier: FrontierNode[]
  next_up: FrontierNode[]
  locked_count: number
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function FrontierTaskCard({
  node,
  onVerify,
}: {
  node: FrontierNode
  onVerify: (id: string, method: 'SELF_REPORT' | 'QUIZ' | 'DEMONSTRATION') => void
}) {
  const [isVerifying, setIsVerifying] = useState(false)

  const handleVerify = async (method: 'SELF_REPORT' | 'QUIZ' | 'DEMONSTRATION') => {
    setIsVerifying(true)
    await onVerify(node.id, method)
    setIsVerifying(false)
  }

  return (
    <div className="card border-l-4 border-l-blue-500 flex flex-col gap-4 p-5 transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
             <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
              {node.gate_type}
            </span>
            <span className="text-[10px] font-medium text-gray-400">
              {node.goal_title}
            </span>
          </div>
          <h3 className="font-bold text-gray-900 text-lg leading-tight">
            {node.title}
          </h3>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed italic">
            &ldquo;{node.completion_definition}&rdquo;
          </p>
        </div>
      </div>

      {node.unlocks.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="font-semibold text-gray-500 uppercase tracking-tighter">Unlocks:</span>
          <span>{node.unlocks.join(', ')}</span>
        </div>
      )}

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => handleVerify('SELF_REPORT')}
          disabled={isVerifying}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50"
        >
          {isVerifying ? 'Verifying...' : 'Complete'}
        </button>
        <button
          onClick={() => handleVerify('SELF_REPORT')} // Simplified for MVP
          disabled={isVerifying}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-4 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          I Tried
        </button>
      </div>
    </div>
  )
}

function NextUpItem({ node }: { node: FrontierNode }) {
  return (
    <div className="flex items-start gap-3 opacity-60">
      <div className="mt-1 w-2 h-2 rounded-full border-2 border-gray-400" />
      <div>
        <p className="text-sm font-medium text-gray-700">{node.title}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-widest">{node.gate_type}</p>
      </div>
    </div>
  )
}

function HonestyBanner() {
  return (
    <div className="card bg-amber-50 border-amber-200 p-4 mb-8 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-amber-900">You&apos;re a bit behind pace.</p>
        <p className="text-xs text-amber-700">Want to talk to Morgan about adjusting the plan?</p>
      </div>
      <button className="text-xs font-bold text-amber-900 underline">Chat with Morgan</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FrontierPage() {
  const [data, setData] = useState<FrontierResponse | null>(null)
  const [paceGap, setPaceGap] = useState<number>(1.0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{ cleared: boolean; text: string } | null>(null)

  const loadFrontier = useCallback(async () => {
    try {
      const [frontierRes, userRes] = await Promise.all([
        fetch('/api/game-plan/frontier'),
        supabase.from('users').select('pace_gap').single()
      ])

      if (!frontierRes.ok) throw new Error('Failed to load frontier')
      
      const frontierData = await frontierRes.json()
      setData(frontierData)
      setPaceGap(userRes.data?.pace_gap || 1.0)
    } catch (err) {
      setError('Could not load your daily tasks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFrontier()
  }, [loadFrontier])

  const handleVerify = async (id: string, method: string) => {
    setFeedback(null)
    try {
      const res = await fetch(`/api/game-plan/nodes/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_response: 'completed', verification_method: method })
      })

      const result = await res.json()
      if (result.cleared) {
        setFeedback({ cleared: true, text: result.feedback })
        // Reload frontier to show newly unlocked nodes
        await loadFrontier()
      } else {
        setFeedback({ cleared: false, text: result.feedback })
      }
    } catch (err) {
      setError('Verification failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex flex-col gap-4 animate-pulse max-w-2xl mx-auto">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-40 bg-gray-200 rounded" />
        <div className="h-40 bg-gray-200 rounded" />
      </div>
    )
  }

  const isEmpty = !data || (data.frontier.length === 0 && data.next_up.length === 0)

  return (
    <div className="p-8 pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Today</h1>
        <p className="text-gray-500 font-medium">Clear the frontier to move forward.</p>
      </div>

      {/* Honesty Engine Banner */}
      {paceGap > 1.5 && <HonestyBanner />}

      {/* Feedback Banner */}
      {feedback && (
        <div className={`card mb-8 p-5 ${feedback.cleared ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`text-sm font-bold ${feedback.cleared ? 'text-green-900' : 'text-amber-900'}`}>
            {feedback.cleared ? 'Gate Cleared!' : 'Not quite yet.'}
          </p>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">{feedback.text}</p>
        </div>
      )}

      {/* Frontier (Active Tasks) */}
      <section className="mb-12">
        <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-5">You Are Here</h2>
        
        {isEmpty ? (
          <div className="card text-center py-12">
            <p className="text-4xl mb-4">✨</p>
            <h3 className="text-lg font-bold text-gray-900">All caught up!</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
              Generate a Game Plan for a new goal to see more tasks.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {data?.frontier.map(node => (
              <FrontierTaskCard 
                key={node.id} 
                node={node} 
                onVerify={handleVerify}
              />
            ))}
          </div>
        )}
      </section>

      {/* Next Up (Locked) */}
      {data && data.next_up.length > 0 && (
        <section>
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-5">Next Up</h2>
          <div className="flex flex-col gap-4">
            {data.next_up.map(node => (
              <NextUpItem key={node.id} node={node} />
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl">
          {error}
        </div>
      )}
    </div>
  )
}
