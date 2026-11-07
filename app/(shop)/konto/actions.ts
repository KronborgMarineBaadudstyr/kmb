'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getShopUser, startSession, endSession } from '@/lib/shop/auth'
import { hashToken, safeNext } from '@/lib/tokens'

// Linket i mailen åbner en side med en knap, der kalder denne. Så kan mail-scannere,
// der "klikker" på links for at tjekke dem, ikke bruge engangs-tokenet op.
export async function verifyLogin(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!token) redirect('/konto?login=ugyldig')

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('shop_login_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('shop_user_id, channel')
    .maybeSingle()
  if (!row) redirect('/konto?login=udloebet')

  await startSession(row.shop_user_id)
  await Promise.all([
    supabase.rpc('link_orders_to_shop_user', { p_user: row.shop_user_id, p_channel: row.channel }),
    supabase.from('shop_users').update({ last_login_at: new Date().toISOString() }).eq('id', row.shop_user_id),
  ])
  redirect(safeNext(formData.get('next')) ?? '/konto')
}

export async function logout() {
  await endSession()
  redirect('/konto')
}

export async function setMarketing(formData: FormData) {
  const user = await getShopUser()
  if (!user) redirect('/konto')
  const on = formData.get('on') === '1'
  await createServiceClient().from('shop_users')
    .update({ marketing_opt_in: on, marketing_opt_in_at: on ? new Date().toISOString() : null })
    .eq('id', user.id)
  revalidatePath('/konto')
}

export async function unsubscribe(formData: FormData) {
  const token = String(formData.get('t') ?? '')
  if (token) {
    await createServiceClient().from('shop_users')
      .update({ marketing_opt_in: false, marketing_opt_in_at: null })
      .eq('unsubscribe_token', token)
  }
  redirect('/afmeld?done=1')
}
