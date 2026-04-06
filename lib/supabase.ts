import { createBrowserClient } from '@supabase/ssr'

/**
 * Client-side Supabase instance using the anon (public) key.
 * Safe to use in browser / React components.
 * Uses @supabase/ssr to handle session cookies automatically.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
