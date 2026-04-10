import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE = 'kmb-session'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Login-side og auth API er altid åbne
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
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
