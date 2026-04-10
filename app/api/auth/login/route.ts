import { NextResponse } from 'next/server'

const COOKIE   = 'kmb-session'
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'KMB3000'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password !== PASSWORD) {
    return NextResponse.json({ error: 'Forkert adgangskode' }, { status: 401 })
  }

  const token = await sha256(PASSWORD)
  const res   = NextResponse.json({ ok: true })

  res.cookies.set(COOKIE, token, {
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
