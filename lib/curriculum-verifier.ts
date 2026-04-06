import { chat } from './gemini'

/**
 * Verifies whether a standard curriculum exists for a given learning goal.
 * Returns a formatted context string for injection into the planning prompt,
 * or '' if verification fails or no curriculum is found.
 *
 * This is a one-shot Gemini call — not a web search. Morgan uses her training
 * knowledge of standard educational curricula (IB, A-Level, AP, university syllabi).
 */
export async function verifyCurriculum(goalTitle: string, goalWhy?: string): Promise<string> {
  try {
    const prompt = `You are a curriculum verification system. Given a student's learning goal, identify if there is a well-established, authoritative curriculum or learning sequence for it.

Goal: "${goalTitle}"
${goalWhy ? `Why they want to learn it: "${goalWhy}"` : ''}

Respond with ONLY a JSON object in this exact format:
{
  "verified": true | false,
  "curriculum_name": "e.g. IB Chemistry SL, AP Calculus AB, MIT OpenCourseWare 6.001",
  "authoritative_sequence": ["Topic 1", "Topic 2", "Topic 3", ...],
  "warning": null | "string if no standard curriculum exists or goal is too vague"
}

Rules:
- verified = true only if you are confident a recognized standard exists (IB, A-Level, AP, university course, professional certification, etc.)
- authoritative_sequence: list the top 5-8 key topics/units in the order they are standardly taught
- If the goal is too vague or no standard curriculum exists, set verified = false and explain in warning
- Never invent curricula. If uncertain, set verified = false.`

    const raw = await chat(
      [{ role: 'user', content: prompt }],
      'You are a curriculum verification system. Output only valid JSON.'
    )

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return ''

    const result = JSON.parse(jsonMatch[0])

    if (!result.verified) {
      return result.warning
        ? `CURRICULUM NOTE: No verified standard curriculum found for "${goalTitle}". ${result.warning} Generate tasks based on foundational principles rather than a fixed syllabus.`
        : ''
    }

    const sequence = ((result.authoritative_sequence ?? []) as string[]).slice(0, 8).join(' → ')
    return `VERIFIED CURRICULUM (${result.curriculum_name}):
Standard learning sequence: ${sequence}
Follow this sequence when generating tasks. Do not skip foundational topics to reach advanced ones prematurely.`
  } catch {
    return ''
  }
}