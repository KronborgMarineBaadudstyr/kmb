import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE, isAdminCookie } from './lib/admin-session'

// Alt under /api kræver admin-login, undtagen de offentlige ruter herunder.
// Nye API-ruter er dermed beskyttet som standard.
const PUBLIC_PREFIXES = [
  '/api/shop/',   // webshoppen (kurv, ordrer, kundelogin)
  '/api/cron/',   // Vercel Cron — egen Bearer CRON_SECRET i hver rute
]
const PUBLIC_EXACT = ['/api/auth/login', '/api/health']

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }
  // Shoppens kategoriside henter produktlisten fra serveren — uden cookies
  if (pathname === '/api/products' && req.method === 'GET' && searchParams.get('shop') === '1') {
    return NextResponse.next()
  }
  if (isAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.next()
  }
  return NextResponse.json({ error: 'Ikke logget ind' }, { status: 401 })
}

export const config = { matcher: '/api/:path*' }
