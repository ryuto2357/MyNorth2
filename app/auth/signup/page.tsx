'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Role = 'STUDENT' | 'COUNSELOR' | 'PARENT'

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'STUDENT', label: "I'm a Student", description: 'Get guidance on your college journey' },
  { value: 'COUNSELOR', label: "I'm a Counselor", description: 'Support and track your students' },
  { value: 'PARENT', label: "I'm a Parent", description: 'Stay involved in your child\'s progress' },
]

export default function SignUp() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isUnder18, setIsUnder18] = useState(false)
  const [consentAgreed, setConsentAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validation
    if (!selectedRole) {
      setError('Please select your role')
      setLoading(false)
      return
    }

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

    if (isUnder18 && !consentAgreed) {
      setError('You must agree to the consent terms to create an account')
      setLoading(false)
      return
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: selectedRole,
            is_under_18: isUnder18,
          },
        },
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

  const handleGoogleSignUp = async () => {
    setLoading(true)
    setError('')
    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (googleError) {
        setError(googleError.message)
        setLoading(false)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          <span className="text-gray-700">MyNorth</span>
        </h1>
        <p className="text-gray-600">Create your account to start your journey with Morgan</p>
      </div>

      <div className="space-y-4">
        <button
          onClick={handleGoogleSignUp}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-2 px-4 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.11 0 5.71-1.03 7.62-2.81l-3.57-2.77c-.98.66-2.23 1.06-3.75 1.06-2.88 0-5.32-1.94-6.19-4.55H2.54v2.91C4.46 20.61 8 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.81 13.93c-.22-.66-.35-1.36-.35-2.08s.13-1.42.35-2.08V6.86H2.54C1.61 8.61 1.08 10.61 1.08 12.75s.53 4.14 1.46 5.89l3.27-2.71z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.69 0 3.21.58 4.41 1.72l3.31-3.31C17.71 1.79 15.11.75 12 .75c-4 0-7.54 2.39-9.46 5.86l3.27 3.07c.87-2.61 3.31-4.55 12-4.55z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500 uppercase">or</span>
          </div>
        </div>

        <form onSubmit={handleSignUp} className="space-y-6">
        {/* Role Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-3">I am a...</label>
          <div className="grid grid-cols-1 gap-3">
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedRole(option.value)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedRole === option.value
                    ? 'border-gray-700 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className={`block font-semibold ${
                  selectedRole === option.value ? 'text-gray-700' : 'text-gray-900'
                }`}>
                  {option.label}
                </span>
                <span className="block text-sm text-gray-500 mt-0.5">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Email + Password Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Email</label>
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
          <label className="block text-sm font-medium text-gray-900 mb-1">Password</label>
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
          <label className="block text-sm font-medium text-gray-900 mb-1">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-base"
            placeholder="Confirm your password"
            required
          />
        </div>

        {/* Under-18 Checkbox */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isUnder18}
              onChange={(e) => {
                setIsUnder18(e.target.checked)
                if (!e.target.checked) setConsentAgreed(false)
              }}
              className="w-4 h-4 rounded border-gray-300 text-gray-700 focus:ring-gray-500"
            />
            <span className="text-sm text-gray-900">I am under 18 years old</span>
          </label>

          {/* Consent Agreement (shown only when under-18 is checked) */}
          {isUnder18 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 font-medium mb-2">
                Parental / Guardian Consent Required
              </p>
              <p className="text-sm text-amber-700 mb-3">
                Because you are under 18, a parent or legal guardian must consent to your
                use of MyNorth. By checking the box below, you confirm that your parent or
                guardian has reviewed and agrees to the{' '}
                <span className="font-medium">Terms of Service</span> and{' '}
                <span className="font-medium">Privacy Policy</span>, including the
                collection and use of your personal information to provide college
                counseling guidance. Your parent or guardian may revoke this consent at any
                time by contacting support.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAgreed}
                  onChange={(e) => setConsentAgreed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-gray-700 focus:ring-gray-500"
                />
                <span className="text-sm text-amber-800">
                  I confirm that my parent or guardian has reviewed and agrees to the above terms
                </span>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedRole || (isUnder18 && !consentAgreed)}
          className="w-full btn-primary disabled:opacity-50"
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-600 text-sm">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-gray-700 hover:underline font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  </div>
  )
}
