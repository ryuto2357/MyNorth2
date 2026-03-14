'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function ConstellationPage() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  return (
    <div className="p-8 md:pb-20">
      <h1 className="text-3xl font-bold text-obsidian mb-6">Your Constellation</h1>

      <div className="card">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✨</div>
          <h2 className="text-2xl font-bold text-obsidian mb-2">Coming Soon</h2>
          <p className="text-gray-600">
            Your knowledge graph visualization is being built. Check back soon to see your goals, achievements, and atomic tasks visualized as an interactive constellation.
          </p>
        </div>
      </div>
    </div>
  )
}
