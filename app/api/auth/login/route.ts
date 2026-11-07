import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, adminPassword } from '@/lib/admin-session'

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password !== adminPassword()) {
    return NextResponse.json({ error: 'Forkert adgangskode' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, adminPassword(), {
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
  res.cookies.delete(ADMIN_COOKIE)
  return res
}
