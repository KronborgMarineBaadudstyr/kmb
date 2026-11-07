'use server'

import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { startAdminSession } from '@/lib/admin-auth'
import { hashToken, safeNext } from '@/lib/tokens'

// Kaldes fra knappen på /login/bekraeft, så mail-scannere ikke bruger engangstokenet op.
export async function verifyAdminLogin(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!token) redirect('/login?login=ugyldig')

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('admin_login_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('admin_user_id, admin_users ( disabled_at )')
    .maybeSingle()
  const disabled = (row?.admin_users as unknown as { disabled_at: string | null } | null)?.disabled_at
  if (!row || disabled) redirect('/login?login=udloebet')

  await startAdminSession(row.admin_user_id)
  await supabase.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', row.admin_user_id)
  redirect(safeNext(formData.get('next')) ?? '/admin')
}
