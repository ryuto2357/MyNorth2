import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Next.js middleware using @supabase/ssr for automatic session refreshing.
 * 
 * Logic:
 *  1. Refresh the session on every request if needed.
 *  2. Check if the user is authenticated for protected routes.
 *  3. Handle role-based redirects and onboarding checks.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // --- 1. Refresh session ---
  const { data: { user }, error } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // --- 2. Public routes: skip auth checks ---
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/'
  ) {
    return response
  }

  // --- 3. Protected /app/* routes ---
  if (pathname.startsWith('/app')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // --- 4. Role-based and Onboarding Check ---
    // Skip if already on onboarding
    if (!pathname.startsWith('/app/onboarding')) {
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_complete, role')
        .eq('id', user.id)
        .single()

      if (profile && profile.onboarding_complete === false) {
        const onboardingUrl = request.nextUrl.clone()
        onboardingUrl.pathname = '/app/onboarding'
        return NextResponse.redirect(onboardingUrl)
      }

      // --- Role-based routing: redirect /app to correct dashboard ---
      if (pathname === '/app') {
        if (profile?.role === 'COUNSELOR') {
          const url = request.nextUrl.clone()
          url.pathname = '/app/counselor'
          return NextResponse.redirect(url)
        }
        if (profile?.role === 'PARENT') {
          const url = request.nextUrl.clone()
          url.pathname = '/app/parent'
          return NextResponse.redirect(url)
        }
        // STUDENT or default
      }
    }

    return response
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
