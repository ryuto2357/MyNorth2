'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SignUp() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validation
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      if (data.user) {
        // User created! The trigger handles profile creation automatically
        // Just redirect to onboarding
        router.push('/app/onboarding')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-obsidian mb-2">
          <span className="text-celestial-600">MyNorth</span>
        </h1>
        <p className="text-gray-600">Create your account to start your journey with Morgan</p>
      </div>

      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-obsidian mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-obsidian mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-base"
            placeholder="Min 6 characters"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-obsidian mb-1">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-base"
            placeholder="Confirm your password"
            required
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary disabled:opacity-50"
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-600 text-sm">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-celestial-600 hover:underline font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
