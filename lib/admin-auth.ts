import { cookies } from 'next/headers'
import { ADMIN_COOKIE, isAdminCookie } from './admin-session'

// Til Server Actions. API-ruter beskyttes centralt i middleware.ts.
export async function isAdmin(): Promise<boolean> {
  return isAdminCookie((await cookies()).get(ADMIN_COOKIE)?.value)
}
