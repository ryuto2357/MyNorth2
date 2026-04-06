'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type InviteInfo = {
  studentName: string | null
  supervisorRole: string
  expiresAt: string
  isValid: boolean
}

function JoinPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    async function load() {
      if (!token) {
        setError('No invite token provided.')
        setLoading(false)
        return
      }

      const res = await fetch(`/api/supervisor/invite?token=${encodeURIComponent(token)}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load invite.')
        setLoading(false)
        return
      }

      setInvite(data)

      if (!data.isValid) {
        setError('This invite link has expired or has already been used.')
        setLoading(false)
        return
      }

      const { data: session } = await supabase.auth.getSession()
      setLoggedIn(!!session.session)
      setLoading(false)
    }

    load()
  }, [token])

  async function handleAccept() {
    if (!token) return

    const { data: session } = await supabase.auth.getSession()
    if (!session.session) {
      const redirect = encodeURIComponent(`/join?token=${token}`)
      router.push(`/auth/login?redirect=${redirect}`)
      return
    }

    setAccepting(true)
    setError(null)

    const res = await fetch('/api/supervisor/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to accept invite.')
      setAccepting(false)
      return
    }

    const redirectPath = invite?.supervisorRole === 'COUNSELOR' ? '/app/counselor' : '/app/parent'
    sessionStorage.setItem('joinToast', `You're now connected to ${data.studentName || 'the student'}`)
    router.push(redirectPath)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading invite...</div>
      </div>
    )
  }

  if (error && !invite?.isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invite Link Invalid</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link href="/auth/login" className="text-blue-600 hover:underline">
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  const roleLabel = invite?.supervisorRole === 'COUNSELOR' ? 'Counselor' : 'Parent'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">You've Been Invited</h1>
        <p className="text-lg text-gray-600 mb-6">
          {invite?.studentName || 'A student'} has invited you to support them as their{' '}
          <span className="font-semibold text-gray-900">{roleLabel.toLowerCase()}</span>.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {!loggedIn ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              You'll need to sign in or create an account to accept this invite.
            </p>
            <button
              onClick={handleAccept}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Sign In to Accept
            </button>
          </div>
        ) : (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {accepting ? 'Accepting...' : 'Accept & Continue'}
          </button>
        )}

        <p className="mt-6 text-xs text-gray-400">
          Link expires {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'soon'}
        </p>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <JoinPageContent />
    </Suspense>
  )
}
