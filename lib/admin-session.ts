import { createServiceClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/tokens'

// Fælles for middleware.ts (læser cookien fra requesten) og lib/admin-auth.ts (next/headers).

export const ADMIN_COOKIE        = 'kmb_admin'
export const ADMIN_SESSION_DAYS  = 14
export const ADMIN_TOKEN_MINUTES = 30

export type Admin = { id: string; email: string; name: string | null; role: 'owner' | 'admin' }

export async function adminFromToken(token: string | undefined): Promise<Admin | null> {
  if (!token) return null
  const { data } = await createServiceClient()
    .from('admin_sessions')
    .select('admin_users ( id, email, name, role, disabled_at )')
    .eq('token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  const a = data?.admin_users as unknown as (Admin & { disabled_at: string | null }) | null
  if (!a || a.disabled_at) return null
  return { id: a.id, email: a.email, name: a.name, role: a.role }
}
