/**
 * Web search via Exa.ai.
 * Returns formatted excerpts for injection into Morgan's research prompt.
 * Returns '' (silent no-op) if EXA_API_KEY is not set or on any error.
 * Activate by adding EXA_API_KEY to .env.local — no other code changes needed.
 */
export async function searchWeb(query: string): Promise<string> {
  if (!process.env.EXA_API_KEY) return ''

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.EXA_API_KEY,
      },
      body: JSON.stringify({
        query,
        numResults: 5,
        type: 'auto',
        contents: { text: { maxCharacters: 800 } },
      }),
    })

    if (!response.ok) {
      console.error('[Search] Exa API error:', response.status, await response.text())
      return ''
    }

    const data = await response.json() as {
      results: { url: string; title?: string; text?: string }[]
    }

    if (!data.results || data.results.length === 0) return ''

    const excerpts = data.results
      .filter(r => r.text)
      .map((r, i) => `[${i + 1}] (source: ${r.url})\n${r.text}`)
      .join('\n\n')

    return `WEB RESEARCH (Exa.ai):\n${excerpts}`
  } catch (e) {
    console.error('[Search] searchWeb failed:', e)
    return ''
  }
}
