'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Navigation from '@/components/Navigation'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isOnboarding, setIsOnboarding] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/auth/login')
        return
      }

      // Check onboarding status
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_complete')
        .eq('id', session.user.id)
        .single()

      setIsOnboarding(profile?.onboarding_complete === false)
      setLoading(false)
    }

    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/auth/login')
      }
    })

    return () => subscription?.unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center animate-pulse">
          <div className="text-gray-700 font-medium">Morgan is waking up...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {!isOnboarding && <Navigation />}
      <main className={`flex-1 ${isOnboarding ? 'w-full' : ''}`}>
        {children}
      </main>
    </div>
  )
}
