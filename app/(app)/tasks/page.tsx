'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function TasksPage() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  return (
    <div className="p-8 md:pb-20">
      <h1 className="text-3xl font-bold text-obsidian mb-6">Today's Tasks</h1>

      <div className="card">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-obsidian mb-2">No tasks yet</h2>
          <p className="text-gray-600">
            Talk to Morgan to generate your first set of daily tasks. She'll help break down your goals into actionable 15-30 minute tasks you can complete today.
          </p>
        </div>
      </div>
    </div>
  )
}
