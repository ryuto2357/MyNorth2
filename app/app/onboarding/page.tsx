'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/onboarding')
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-50 flex items-center justify-center">
      <div className="text-center animate-pulse">
        <div className="text-gray-700 text-lg font-medium">Redirecting to onboarding...</div>
      </div>
    </div>
  )
}
