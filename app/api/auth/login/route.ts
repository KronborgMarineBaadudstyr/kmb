import { NextResponse } from 'next/server'

const COOKIE   = 'kmb-session'
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'KMB3000'

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password !== PASSWORD) {
    return NextResponse.json({ error: 'Forkert adgangskode' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, PASSWORD, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30, // 30 dage
    path:     '/',
  })

  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE)
  return res
}
