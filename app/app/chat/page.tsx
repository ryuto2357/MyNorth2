'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import MorganChat from '@/components/MorganChat'

export default function ChatPage() {
  const [userId, setUserId] = useState('')
  const [goalId, setGoalId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      setUserId(session.user.id)

      // Get first active goal
      const { data: goalData } = await supabase
        .from('goals')
        .select('id, title, status')
        .eq('user_id', session.user.id)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .single() as { data: { id: string; title: string; status: string } | null; error: any }

      if (goalData) {
        setGoalId(goalData.id)
      }

      setLoading(false)
    }

    loadUserData()
  }, [])

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-pulse text-gray-600">Loading conversation...</div>
      </div>
    )
  }

  if (!userId || !goalId) {
    return (
      <div className="p-8">
        <div className="card">
          <p className="text-gray-600">No active goal found. Please complete onboarding first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 md:pb-20">
      <h1 className="text-3xl font-bold text-obsidian mb-6">Chat with Morgan</h1>
      <div className="h-96">
        <MorganChat userId={userId} goalId={goalId} />
      </div>
    </div>
  )
}
