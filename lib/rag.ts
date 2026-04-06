import { generateEmbedding } from './embeddings'
import type { createServerClient } from './supabase-server'

interface VectorMatch {
  id: string
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

/**
 * Retrieves semantically relevant chunks from the knowledge vault for a given query.
 * Returns a formatted string ready to inject into a Morgan prompt.
 * Returns empty string if no relevant context found or on any error.
 */
export async function retrieveContext(
  query: string,
  userId: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<string> {
  try {
    const embedding = await generateEmbedding(query)

    const { data, error } = await supabase.rpc('match_vectors', {
      query_embedding: embedding,
      match_user_id: userId,
      match_threshold: 0.7,
      match_count: 5,
    })

    if (error) {
      console.error('[RAG] match_vectors RPC failed:', error.message)
      return ''
    }

    const matches = (data ?? []) as VectorMatch[]
    if (matches.length === 0) return ''

    const chunks = matches.map((m, i) => {
      const source = (m.metadata?.filename as string) ?? 'authority file'
      return `[${i + 1}] (source: ${source}, relevance: ${(m.similarity * 100).toFixed(0)}%)\n${m.content}`
    })

    return `AUTHORITY KNOWLEDGE VAULT (retrieved for this query):\n${chunks.join('\n\n')}`
  } catch (e) {
    console.error('[RAG] retrieveContext failed:', e)
    return ''
  }
}