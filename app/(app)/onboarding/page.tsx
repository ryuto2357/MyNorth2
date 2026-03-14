'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OnboardingForm from '@/components/OnboardingForm'

export default function OnboardingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/auth/login')
      } else {
        setUser(session.user)
        setLoading(false)
      }
    }

    checkUser()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-celestial-50 to-alabaster flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-celestial-600 text-lg">Loading Morgan...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-celestial-50 to-alabaster py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-obsidian mb-2">
            Welcome to <span className="text-celestial-600">MyNorth</span>
          </h1>
          <p className="text-gray-600">
            Morgan is excited to meet you! Let's understand your goals and how she can support you.
          </p>
        </div>

        <OnboardingForm userId={user?.id} />
      </div>
    </div>
  )
}
