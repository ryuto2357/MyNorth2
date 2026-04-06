import { createServerClient as createSSRServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client using the anon key.
 * Cookie-aware: works in Server Components, Server Actions, and Route Handlers
 * where you need to read/write the user's session.
 * Uses @supabase/ssr for automatic session refresh.
 */
export function createServerClientSide() {
  const cookieStore = cookies()

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Called from a Server Component — safe to ignore if middleware
            // handles session refresh.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Called from a Server Component — safe to ignore.
          }
        },
      },
    }
  )
}

/**
 * Admin client using the service role key.
 * Bypasses RLS — use ONLY in trusted server-side contexts (API routes, cron jobs).
 * NEVER expose this to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Backwards-compatible alias — all API routes import this name
export const createServerClient = createAdminClient
