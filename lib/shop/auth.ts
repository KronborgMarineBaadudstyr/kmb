import { hashToken, newToken } from '@/lib/tokens'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

// Kundelogin via magic link. Kun SHA-256 af tokens gemmes i databasen.

export const SESSION_COOKIE    = 'ls_session'
const SESSION_DAYS             = 90
export const LOGIN_TOKEN_MINUTES = 30

export type ShopUser = {
  id: string; email: string | null; phone: string | null; name: string | null
  marketing_opt_in: boolean
}

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string }

// "12 34 56 78", "+45 12345678", "0045…" → { phone, "+4512345678" }
export function parseIdentifier(input: string): Identifier | null {
  const raw = input.trim()
  if (raw.includes('@')) {
    const email = raw.toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? { kind: 'email', value: email } : null
  }
  let digits = raw.replace(/[\s\-().]/g, '')
  if (digits.startsWith('00')) digits = '+' + digits.slice(2)
  if (/^\d{8}$/.test(digits)) digits = '+45' + digits
  if (/^45\d{8}$/.test(digits)) digits = '+' + digits
  return /^\+\d{8,15}$/.test(digits) ? { kind: 'phone', value: digits } : null
}


export async function getShopUser(): Promise<ShopUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const { data } = await createServiceClient()
    .from('shop_sessions')
    .select('expires_at, shop_users ( id, email, phone, name, marketing_opt_in )')
    .eq('token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return (data?.shop_users as unknown as ShopUser) ?? null
}

// Må kun kaldes fra Route Handlers / Server Actions (sætter cookie)
export async function startSession(shopUserId: string) {
  const token   = newToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000)
  await createServiceClient().from('shop_sessions').insert({
    shop_user_id: shopUserId, token_hash: hashToken(token), expires_at: expires.toISOString(),
  })
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', expires,
  })
}

export async function endSession() {
  const jar   = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await createServiceClient().from('shop_sessions').delete().eq('token_hash', hashToken(token))
  jar.delete(SESSION_COOKIE)
}
