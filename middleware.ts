import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE = 'kmb-session'
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'KMB3000'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Åbn adgang til login-sider og auth API
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next()
  }

  const token    = request.cookies.get(COOKIE)?.value
  const expected = await sha256(PASSWORD)

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
