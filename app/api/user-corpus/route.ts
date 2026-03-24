import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserCorpus, buildUserCorpus } from '@/lib/user-corpus'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const forceRebuild = searchParams.get('forceRebuild') === 'true'

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const corpus = await getUserCorpus(supabase, userId, forceRebuild)

    if (!corpus) {
      return NextResponse.json({ error: 'Failed to build corpus' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      corpus,
      age_minutes: corpus.metadata.last_updated
        ? Math.round((new Date().getTime() - new Date(corpus.metadata.last_updated).getTime()) / (1000 * 60))
        : 0,
    })
  } catch (error: any) {
    console.error('Corpus fetch error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch corpus' }, { status: 500 })
  }
}

/**
 * POST: Build fresh corpus and cache it
 * Useful after onboarding, significant changes, or manual refresh
 */
export async function POST(req: NextRequest) {
  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const corpus = await buildUserCorpus(supabase, userId)

    if (!corpus) {
      return NextResponse.json({ error: 'Failed to build corpus' }, { status: 500 })
    }

    // Cache it
    await supabase
      .from('users')
      .update({
        user_corpus: corpus,
        user_corpus_updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    return NextResponse.json({
      success: true,
      corpus,
      message: 'Corpus built and cached',
    })
  } catch (error: any) {
    console.error('Corpus build error:', error)
    return NextResponse.json({ error: error.message || 'Failed to build corpus' }, { status: 500 })
  }
}
