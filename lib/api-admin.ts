import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/admin-auth'

// Forsvar i dybden for admin-API'et: middleware.ts afviser allerede alt under /api uden admin-session,
// men hver rute tjekker også selv (Next.js har haft flere middleware-bypass-sårbarheder).
// Brug øverst i handleren:  const denied = await requireAdmin(); if (denied) return denied
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await getCurrentAdmin()) return null
  return NextResponse.json({ error: 'Ikke logget ind' }, { status: 401 })
}
