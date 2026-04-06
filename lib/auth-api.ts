import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

/**
 * Extract and verify the authenticated user from an API request.
 *
 * Uses createServerClient from @supabase/ssr to validate the session
 * and return the verified user identity.
 *
 * Use this in ALL API routes that act on behalf of a logged-in user.
 * Do NOT use for webhook routes (Stripe) or cron routes (CRON_SECRET).
 *
 * Returns null if the user is not authenticated.
 */
export async function getAuthUser(
  request: NextRequest
): Promise<{ id: string; email?: string } | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Note: Middleware or the callback route handles setting cookies
          // during sign-in/refresh. getAuthUser is for read-only validation.
        },
        remove(name: string, options: CookieOptions) {
          // Note: Middleware or the callback route handles removing cookies.
        },
      },
    }
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  return { id: user.id, email: user.email }
}
