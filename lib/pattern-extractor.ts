import type { PatternData } from '@/types'
import { chat } from '@/lib/gemini'

/**
 * Extract behavioral patterns from recent chat messages using Gemini.
 * Merges with existing patterns (appends, doesn't overwrite unless contradictory).
 * This is designed to run asynchronously — don't block the chat response.
 */
export async function extractPatterns(
  existingPatterns: PatternData,
  recentMessages: { role: string; content: string }[]
): Promise<PatternData> {
  if (recentMessages.length < 3) return existingPatterns

  const conversationText = recentMessages
    .slice(-20) // Last 20 messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n')

  const prompt = `Analyze this student-AI conversation and extract behavioral patterns. Return ONLY valid JSON matching this schema:

{
  "time_patterns": "when they seem most productive or engaged",
  "avoidance_patterns": "what topics or task types they tend to skip or postpone",
  "emotional_patterns": "stress signals, energy cycles, or mood indicators",
  "learning_style": "which task formats produce the best engagement",
  "communication_effectiveness": "which communication approaches get the student to act"
}

If you can't determine a pattern from the conversation, use null for that field.
Existing observations to consider (merge, don't overwrite unless contradictory):
${JSON.stringify(existingPatterns)}

Conversation:
${conversationText}`

  try {
    const raw = await chat(
      [{ role: 'user', content: prompt }],
      'You are a behavioral pattern analyzer. Output only valid JSON.'
    )

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return existingPatterns

    const newPatterns: PatternData = JSON.parse(jsonMatch[0])

    // Merge: prefer new non-null values, keep existing where new is null
    return {
      time_patterns: newPatterns.time_patterns || existingPatterns.time_patterns,
      avoidance_patterns: newPatterns.avoidance_patterns || existingPatterns.avoidance_patterns,
      emotional_patterns: newPatterns.emotional_patterns || existingPatterns.emotional_patterns,
      learning_style: newPatterns.learning_style || existingPatterns.learning_style,
      communication_effectiveness: newPatterns.communication_effectiveness || existingPatterns.communication_effectiveness,
    }
  } catch {
    return existingPatterns
  }
}
