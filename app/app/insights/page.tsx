'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { format, subDays, parseISO } from 'date-fns'

export default function InsightsPage() {
  const [loading, setLoading] = useState(true)
  const [weeklyData, setWeeklyData] = useState<{ date: string; completed: number; total: number }[]>([])
  const [streak, setStreak] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [timeOfDay, setTimeOfDay] = useState<{ morning: number; afternoon: number; evening: number }>({ morning: 0, afternoon: 0, evening: 0 })
  const [nodeCount, setNodeCount] = useState(0)
  const [insight, setInsight] = useState('')
  const [patterns, setPatterns] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const uid = session.user.id

      // Fetch last 30 days of tasks
      const thirtyAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')
      const { data: tasks } = await supabase
        .from('tasks')
        .select('status, scheduled_for, scheduled_time, duration_minutes, completed_at')
        .eq('user_id', uid)
        .gte('scheduled_for', thirtyAgo)
        .order('scheduled_for')

      const allTasks = tasks || []

      // Weekly completion trend (last 7 days)
      const weekly = []
      for (let i = 6; i >= 0; i--) {
        const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
        const dayTasks = allTasks.filter(t => t.scheduled_for === d)
        weekly.push({
          date: d,
          completed: dayTasks.filter(t => t.status === 'COMPLETED').length,
          total: dayTasks.length,
        })
      }
      setWeeklyData(weekly)

      // Streak
      let currentStreak = 0
      let maxStreak = 0
      let tempStreak = 0
      const today = new Date()
      for (let i = 0; i < 30; i++) {
        const d = format(subDays(today, i), 'yyyy-MM-dd')
        const dayCompleted = allTasks.some(t => t.scheduled_for === d && t.status === 'COMPLETED')
        if (dayCompleted) {
          tempStreak++
          if (i === currentStreak) currentStreak++
        } else {
          maxStreak = Math.max(maxStreak, tempStreak)
          if (i > 0 && tempStreak === 0) break
          tempStreak = 0
        }
      }
      maxStreak = Math.max(maxStreak, tempStreak)
      setStreak(currentStreak)
      setLongestStreak(maxStreak)

      // Time of day productivity
      const completed = allTasks.filter(t => t.status === 'COMPLETED')
      const morning = completed.filter(t => t.scheduled_time && t.scheduled_time < '12:00').length
      const afternoon = completed.filter(t => t.scheduled_time && t.scheduled_time >= '12:00' && t.scheduled_time < '17:00').length
      const evening = completed.filter(t => t.scheduled_time && t.scheduled_time >= '17:00').length
      const totalCompleted = morning + afternoon + evening || 1
      setTimeOfDay({
        morning: Math.round((morning / totalCompleted) * 100),
        afternoon: Math.round((afternoon / totalCompleted) * 100),
        evening: Math.round((evening / totalCompleted) * 100),
      })

      // Node count
      const { count } = await supabase.from('nodes').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      setNodeCount(count || 0)

      // User patterns
      const { data: user } = await supabase.from('users').select('patterns').eq('id', uid).single()
      setPatterns(user?.patterns || {})

      // Generate insight
      const completionRate = allTasks.length > 0 ? Math.round((completed.length / allTasks.length) * 100) : 0
      const bestTime = morning >= afternoon && morning >= evening ? 'morning' : afternoon >= evening ? 'afternoon' : 'evening'
      setInsight(
        completionRate > 70
          ? `You're completing ${completionRate}% of your tasks — that's strong consistency. Your best time is ${bestTime}. Keep it up!`
          : completionRate > 40
            ? `You complete ${completionRate}% of tasks. You're most productive in the ${bestTime}. Want me to shift more tasks to that window?`
            : `Your completion rate is ${completionRate}%. Let's simplify — would shorter tasks or fewer per day help build momentum?`
      )

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-8 animate-pulse text-gray-600">Loading insights...</div>

  const maxTasks = Math.max(...weeklyData.map(d => d.total), 1)

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/app" className="text-gray-700 hover:text-gray-800 text-sm mb-6 inline-block">← Dashboard</Link>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Your Insights</h1>

      {/* Reflect & Improve */}
      <div className="card bg-gradient-to-r from-gray-700 to-gray-800 text-white mb-8">
        <h2 className="font-bold text-lg mb-2">Reflect & Improve</h2>
        <p>{insight}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Streaks */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-3">Streaks</h3>
          <div className="flex gap-8">
            <div>
              <p className="text-3xl font-bold text-gray-700">{streak}</p>
              <p className="text-xs text-gray-500">Current</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-400">{longestStreak}</p>
              <p className="text-xs text-gray-500">Longest</p>
            </div>
          </div>
        </div>

        {/* Constellation */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-3">Constellation</h3>
          <p className="text-3xl font-bold text-gray-700">{nodeCount}</p>
          <p className="text-xs text-gray-500">Total nodes in your constellation</p>
        </div>
      </div>

      {/* Weekly trend */}
      <div className="card mb-8">
        <h3 className="font-bold text-gray-900 mb-4">Last 7 Days</h3>
        <div className="flex items-end gap-2 h-32">
          {weeklyData.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center" style={{ height: '100px' }}>
                <div
                  className="w-full bg-gray-500 rounded-t"
                  style={{ height: `${d.total > 0 ? (d.completed / d.total) * 100 : 0}%`, minHeight: d.completed > 0 ? '4px' : 0 }}
                />
                <div
                  className="w-full bg-gray-200 rounded-b"
                  style={{ height: `${d.total > 0 ? ((d.total - d.completed) / d.total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{d.date.slice(-2)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-500 inline-block" /> Completed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-200 inline-block" /> Remaining</span>
        </div>
      </div>

      {/* Time of day */}
      <div className="card mb-8">
        <h3 className="font-bold text-gray-900 mb-4">Productivity by Time of Day</h3>
        <div className="space-y-3">
          {[
            { label: 'Morning', pct: timeOfDay.morning },
            { label: 'Afternoon', pct: timeOfDay.afternoon },
            { label: 'Evening', pct: timeOfDay.evening },
          ].map(t => (
            <div key={t.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{t.label}</span>
                <span className="font-medium text-gray-900">{t.pct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-gray-500 h-2 rounded-full" style={{ width: `${t.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Patterns */}
      {patterns && Object.values(patterns).some(Boolean) && (
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-3">Behavioral Patterns</h3>
          <div className="space-y-2 text-sm text-gray-600">
            {patterns.time_patterns && <p><strong>Timing:</strong> {patterns.time_patterns}</p>}
            {patterns.avoidance_patterns && <p><strong>Avoidance:</strong> {patterns.avoidance_patterns}</p>}
            {patterns.learning_style && <p><strong>Learning Style:</strong> {patterns.learning_style}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
