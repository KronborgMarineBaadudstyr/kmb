import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { hashToken, newToken } from '@/lib/tokens'
import { ADMIN_COOKIE, ADMIN_SESSION_DAYS, adminFromToken, type Admin } from './admin-session'

// Til sider og Server Actions. API-ruter beskyttes centralt i middleware.ts.

export async function getCurrentAdmin(): Promise<Admin | null> {
  return adminFromToken((await cookies()).get(ADMIN_COOKIE)?.value)
}

export async function isAdmin(): Promise<boolean> {
  return !!(await getCurrentAdmin())
}

// Må kun kaldes fra Route Handlers / Server Actions (sætter cookie)
export async function startAdminSession(adminId: string) {
  const token   = newToken()
  const expires = new Date(Date.now() + ADMIN_SESSION_DAYS * 86400_000)
  await createServiceClient().from('admin_sessions').insert({
    admin_user_id: adminId, token_hash: hashToken(token), expires_at: expires.toISOString(),
  })
  ;(await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires,
  })
}

export async function endAdminSession() {
  const jar   = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (token) await createServiceClient().from('admin_sessions').delete().eq('token_hash', hashToken(token))
  jar.delete(ADMIN_COOKIE)
}
