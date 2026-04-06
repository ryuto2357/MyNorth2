import { GamePlanNode, GamePlanLink } from '../types/index'

export interface FrontierResult {
  frontier: GamePlanNode[]
  next_up: GamePlanNode[]
  locked_count: number
}

/**
 * Computes the currently workable nodes (frontier) and the next set of nodes (next up).
 * Pure function: No DB calls. Computes everything in memory.
 */
export function computeFrontier(
  allNodes: GamePlanNode[],
  allLinks: GamePlanLink[]
): FrontierResult {
  // 1. Identify completed node IDs
  const completedIds = new Set(
    allNodes.filter(n => n.status === 'COMPLETED').map(n => n.id)
  )

  // 2. Build a map of node ID -> prerequisites
  // A node's prerequisites are nodes that it REQUIRES or BUILDS_ON
  const prereqMap: Record<string, string[]> = {}
  allLinks.forEach(link => {
    if (link.relation_type === 'REQUIRES' || link.relation_type === 'BUILDS_ON') {
      if (!prereqMap[link.target_id]) {
        prereqMap[link.target_id] = []
      }
      prereqMap[link.target_id].push(link.source_id)
    }
  })

  // 3. For each non-completed node, check if prerequisites are met
  const workableNodes: GamePlanNode[] = []
  const potentialNextUp: GamePlanNode[] = []
  let lockedCount = 0

  const activeNodes = allNodes.filter(n => n.status !== 'COMPLETED')

  activeNodes.forEach(node => {
    const prereqs = prereqMap[node.id] || []
    const allPrereqsMet = prereqs.every(id => completedIds.has(id))

    if (allPrereqsMet) {
      // All prerequisites are already completed
      workableNodes.push(node)
    } else {
      // Some prerequisites are still outstanding
      // Check if all outstanding prerequisites are in the frontier (meaning they'll be met soon)
      // This is a simplified "next_up" logic: nodes that would be unlocked if the current frontier was completed
      const prereqsInFrontier = prereqs.every(id => 
        completedIds.has(id) || activeNodes.find(n => n.id === id && prereqMap[n.id]?.every(pid => completedIds.has(pid)))
      )
      
      if (prereqsInFrontier) {
        potentialNextUp.push(node)
      } else {
        lockedCount++
      }
    }
  })

  // The frontier consists of workable nodes that aren't already completed
  // Next up consists of nodes that are one step away from the frontier
  return {
    frontier: workableNodes,
    next_up: potentialNextUp,
    locked_count: lockedCount
  }
}
