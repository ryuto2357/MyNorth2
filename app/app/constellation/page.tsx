'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'

const ConstellationGraph = dynamic(() => import('@/components/ConstellationGraph'), { ssr: false })

function getNodeColor(node: any) {
  if (node.status === 'ARCHIVED') return '#9ca3af'
  if (node.status === 'WITHERING') return '#ef4444'
  if (node.familiarity_score >= 8) return '#22c55e'
  if (node.familiarity_score >= 5) return '#f97316'
  return '#3b82f6'
}

export default function ConstellationPage() {
  const [nodes, setNodes] = useState<any[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [goal, setGoal] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const fetchGraph = useCallback(async (goalId: string) => {
    const { data: nodesData } = await supabase
      .from('nodes')
      .select('*')
      .eq('goal_id', goalId)
      .order('seniority_level')

    const { data: allLinks } = await supabase.from('links').select('*')

    const nodeIds = new Set((nodesData || []).map((n: any) => n.id))
    const filteredLinks = (allLinks || []).filter(
      (l: any) => nodeIds.has(l.source_id) && nodeIds.has(l.target_id)
    )

    setNodes(nodesData || [])
    setLinks(filteredLinks)
  }, [])

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const uid = session.user.id
      setUserId(uid)

      const { data: goals } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', uid)
        .eq('status', 'ACTIVE')
        .limit(1)

      if (!goals || goals.length === 0) {
        setLoading(false)
        return
      }

      setGoal(goals[0])
      await fetchGraph(goals[0].id)
      setLoading(false)
    }

    loadData()
  }, [fetchGraph])

  async function generateConstellation() {
    if (!goal || !userId) return
    setGenerating(true)
    setError('')

    const res = await fetch('/api/constellation/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId: goal.id, userId }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Generation failed')
    } else {
      await fetchGraph(goal.id)
    }
    setGenerating(false)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-celestial-600 animate-pulse text-lg">
          Loading your constellation...
        </div>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-obsidian mb-6">Your Constellation</h1>
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">🎯</div>
          <h2 className="text-xl font-bold text-obsidian mb-2">No active goal found</h2>
          <p className="text-gray-600">Complete onboarding to set up your first goal.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col p-6 md:pb-20 gap-4" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-obsidian">Your Constellation</h1>
          <p className="text-gray-500 text-sm mt-0.5">{goal.title}</p>
        </div>
        <div className="flex items-center gap-4">
          {nodes.length > 0 && (
            <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                Beginner
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                Intermediate
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                Advanced
              </span>
            </div>
          )}
          {nodes.length === 0 && (
            <button onClick={generateConstellation} disabled={generating} className="btn-primary">
              {generating ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin inline-block">✦</span> Generating...
                </span>
              ) : (
                '✨ Generate Constellation'
              )}
            </button>
          )}
          {selectedNode && (
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {/* Main content */}
      {nodes.length === 0 ? (
        <div className="card flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-7xl mb-4">✨</div>
            <h2 className="text-2xl font-bold text-obsidian mb-2">Your constellation awaits</h2>
            <p className="text-gray-600 mb-6 max-w-md">
              Morgan will map your goal into a constellation — achievements, skills, and the path
              to mastery.
            </p>
            {generating ? (
              <div className="text-celestial-600 animate-pulse">
                Morgan is mapping your constellation...
              </div>
            ) : (
              <button onClick={generateConstellation} className="btn-primary">
                Generate My Constellation
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Graph */}
          <div className="flex-1 rounded-xl overflow-hidden bg-[#0f0f1a] min-h-[400px]">
            <ConstellationGraph nodes={nodes} links={links} onNodeClick={setSelectedNode} />
          </div>

          {/* Node detail panel */}
          {selectedNode && (
            <div className="w-64 flex-shrink-0 card flex flex-col gap-4 overflow-y-auto">
              <div className="flex items-start gap-2">
                <div
                  className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                  style={{ backgroundColor: getNodeColor(selectedNode) }}
                />
                <div>
                  <h3 className="font-bold text-obsidian text-sm leading-snug">
                    {selectedNode.label}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {selectedNode.seniority_level === 0
                      ? 'North Star'
                      : selectedNode.seniority_level === 1
                        ? 'Achievement'
                        : 'Skill'}
                  </span>
                </div>
              </div>

              {selectedNode.description && (
                <p className="text-xs text-gray-600 leading-relaxed">{selectedNode.description}</p>
              )}

              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Familiarity</span>
                  <span className="font-semibold">{selectedNode.familiarity_score}/10</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: `${(selectedNode.familiarity_score / 10) * 100}%`,
                      backgroundColor: getNodeColor(selectedNode),
                    }}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-auto">
                Click another node to explore
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      {nodes.length > 0 && (
        <div className="flex gap-6 text-xs text-gray-400 flex-shrink-0">
          <span>{nodes.filter(n => n.seniority_level === 0).length} North Star</span>
          <span>{nodes.filter(n => n.seniority_level === 1).length} Achievements</span>
          <span>{nodes.filter(n => n.seniority_level === 2).length} Skills</span>
          <span>{links.length} Connections</span>
        </div>
      )}
    </div>
  )
}
