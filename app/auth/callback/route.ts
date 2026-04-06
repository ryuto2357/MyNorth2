import { NextResponse } from 'next/server'
import { createServerClient, createServerClientSide } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app'

  if (code) {
    const supabase = createServerClientSide()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const adminClient = createServerClient()
      const { data: profile } = await adminClient
        .from('users')
        .select('role, onboarding_complete')
        .eq('id', data.user.id)
        .single()

      if (!profile || !profile.role) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      if (profile.onboarding_complete === false) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate user`)
}
