import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE = 'kmb-session'

// Stier der aldrig kræver login
// (interne API-kald fra frontend sender cookie automatisk;
//  men externe kaldere som WooCommerce og andre services har ingen cookie)
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/webhooks',
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token    = request.cookies.get(COOKIE)?.value
  const expected = process.env.DASHBOARD_PASSWORD ?? 'KMB3000'

  if (token === expected) {
    return NextResponse.next()
  }

  const url = new URL('/login', request.url)
  url.searchParams.set('from', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
