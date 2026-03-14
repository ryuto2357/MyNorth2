'use client'

import { useRef, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface Node {
  id: string
  label: string
  description: string
  seniority_level: number
  familiarity_score: number
  status: string
}

interface Link {
  id: string
  source_id: string
  target_id: string
}

interface Props {
  nodes: Node[]
  links: Link[]
  onNodeClick?: (node: Node) => void
}

function getNodeColor(node: any) {
  if (node.status === 'ARCHIVED') return '#9ca3af'
  if (node.status === 'WITHERING') return '#ef4444'
  if (node.familiarity_score >= 8) return '#22c55e'
  if (node.familiarity_score >= 5) return '#f97316'
  return '#3b82f6'
}

function getNodeSize(node: any) {
  if (node.seniority_level === 0) return 10
  if (node.seniority_level === 1) return 6
  return 3
}

export default function ConstellationGraph({ nodes, links, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  useEffect(() => {
    function update() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const graphData = {
    nodes: nodes.map(n => ({ ...n })),
    links: links.map(l => ({ source: l.source_id, target: l.target_id })),
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#0f0f1a"
        nodeLabel={(node: any) => `${node.label} — Familiarity: ${node.familiarity_score}/10`}
        nodeColor={getNodeColor}
        nodeVal={getNodeSize}
        linkColor={() => '#ffffff20'}
        linkWidth={1.5}
        onNodeClick={(node: any) => onNodeClick?.(node)}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const size = getNodeSize(node)
          const color = getNodeColor(node)

          // Glow
          ctx.shadowBlur = 20
          ctx.shadowColor = color

          // Circle
          ctx.beginPath()
          ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()

          ctx.shadowBlur = 0

          // Label
          const showLabel = globalScale >= 1.2 || node.seniority_level <= 1
          if (showLabel) {
            const fontSize = Math.max(3, 5 / globalScale)
            ctx.font = `${node.seniority_level === 0 ? 'bold ' : ''}${fontSize}px Sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = '#e2e8f0'
            const maxLen = 24
            const label =
              node.label.length > maxLen ? node.label.substring(0, maxLen) + '…' : node.label
            ctx.fillText(label, node.x, node.y + size + 2)
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.25}
      />
    </div>
  )
}
