'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const TIERS = [
  {
    id: 'TIER_1', name: 'Free', price: 'SGD 0', features: [
      'Basic Morgan chat (5/day)',
      '1 active goal',
      'Constellation view',
      'Basic task generation',
    ],
  },
  {
    id: 'TIER_2', name: 'Pro', price: 'SGD 39.90/mo', features: [
      'Morgan PRO (25/day)',
      'Up to 3 active goals',
      'Monthly counselor access',
      'Pattern insights',
      'Up to 3 supervised accounts',
    ],
  },
  {
    id: 'TIER_3', name: 'Ultimate', price: 'SGD 89.90/mo', features: [
      'Unlimited Morgan PRO',
      'Unlimited goals',
      'Weekly counselor access',
      'Full behavioral insights',
      'Unlimited supervised accounts',
      'Priority support',
    ],
  },
]

export default function SubscriptionPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [currentTier, setCurrentTier] = useState('TIER_1')
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)
      const { data } = await supabase.from('users').select('tier').eq('id', session.user.id).single()
      setCurrentTier(data?.tier || 'TIER_1')
      setLoading(false)
    }
    load()
  }, [])

  async function handleUpgrade(tier: string) {
    if (!userId) return
    setUpgrading(tier)
    const res = await fetch('/api/payments/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tier }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else setUpgrading(null)
  }

  if (loading) return <div className="p-8 animate-pulse">Loading...</div>

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/app" className="text-gray-700 hover:text-gray-800 text-sm mb-6 inline-block">← Back</Link>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Subscription</h1>
      <p className="text-gray-600 mb-8">Current plan: <span className="font-bold text-gray-700">{TIERS.find(t => t.id === currentTier)?.name}</span></p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIERS.map((tier) => (
          <div key={tier.id} className={`card ${currentTier === tier.id ? 'ring-2 ring-gray-500' : ''}`}>
            <h3 className="text-xl font-bold text-gray-900 mb-1">{tier.name}</h3>
            <p className="text-2xl font-bold text-gray-700 mb-4">{tier.price}</p>
            <ul className="space-y-2 mb-6">
              {tier.features.map((f, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span> {f}
                </li>
              ))}
            </ul>
            {currentTier === tier.id ? (
              <p className="text-center text-sm font-medium text-gray-700">Current Plan</p>
            ) : tier.id === 'TIER_1' ? null : (
              <button
                onClick={() => handleUpgrade(tier.id)}
                disabled={upgrading === tier.id}
                className="btn-primary w-full"
              >
                {upgrading === tier.id ? 'Redirecting...' : `Upgrade to ${tier.name}`}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
