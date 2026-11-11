import { createServiceClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/shop/email'
import { resolveSwedbankConfig, createPaymentOrder, getPaymentOrder, capturePayment, cancelPayment, SwedbankError } from '@/lib/shop/swedbankpay'
import { fromMaskedPan, rememberCard } from '@/lib/payment-refs'
import { paymentReturnPath, type PaymentOrder } from '@/lib/shop/payment-methods'

// Delene, som også bruges i browseren (checkout-formularen), ligger i payment-methods.ts
export { PAYMENT_METHODS, isPaymentMethod, confirmationPath, paymentReturnPath, type PaymentMethod, type PaymentOrder } from '@/lib/shop/payment-methods'

// Betalingsleddet i checkout — Swedbank Pay (kort, MobilePay m.fl. i samme betalingsvindue).
//
// orders.payment_status:  unpaid → authorized (beløbet reserveret) → paid (trukket ved levering/afhentning)
//                         failed / cancelled (reservation frigivet) — pickup-ordrer: unpaid → paid i butikken
// orders.payment_provider = 'swedbankpay', orders.payment_reference = Swedbank paymentOrder-id
//
// Testmiljø (Indstillinger → Betaling = test): online betaling vises KUN for indloggede admins,
// så rigtige kunder aldrig kan "betale" med testkort.

// Er online betaling åben? Produktion: for alle. Test: kun for admins (forAdmin).
export async function onlinePaymentAvailable(forAdmin = false): Promise<boolean> {
  const { config } = await resolveSwedbankConfig()
  if (!config) return false
  return config.env === 'prod' || forAdmin
}

async function logPayment(orderId: string, type: string, data: Record<string, unknown> = {}) {
  // payment_events (migration 070) — mangler tabellen, logges kun i serverloggen
  const { error } = await createServiceClient().from('payment_events').insert({ order_id: orderId, type, data })
  if (error) console.log(`[betaling ${orderId}] ${type}`, JSON.stringify(data))
}

// Opret betaling hos Swedbank Pay og returnér betalingssiden
export async function startPayment(order: PaymentOrder, ctx: { userAgent: string }): Promise<{ redirectUrl: string }> {
  const { config } = await resolveSwedbankConfig()
  if (!config) throw new Error('Online betaling er ikke sat op')
  const site = await siteUrl()
  const po = await createPaymentOrder(config, {
    orderNumber: order.order_number, total: Number(order.order_total), userAgent: ctx.userAgent, site,
    completeUrl: `${site}${paymentReturnPath(order)}`,
    cancelUrl:   `${site}${paymentReturnPath(order, true)}`,
    callbackUrl: `${site}/api/shop/payments/swedbank`,
    termsUrl:    `${site}/handelsbetingelser`,
  })
  await createServiceClient().from('orders').update({
    payment_provider: 'swedbankpay', payment_reference: po.id, updated_at: new Date().toISOString(),
  }).eq('id', order.id)
  await logPayment(order.id, 'created', { payment_order: po.id, payee_reference: po.payeeReference, env: config.env })
  return { redirectUrl: po.redirectUrl }
}

export type SyncResult = { status: 'unpaid' | 'authorized' | 'paid' | 'failed' | 'cancelled'; changed: boolean }

// Hent betalingens status hos Swedbank Pay og opdatér ordren. Kaldes fra retursiden og fra callback.
// Idempotent: ændrer kun noget, når status faktisk er ny.
export async function syncPayment(orderId: string): Promise<SyncResult | null> {
  const supabase = createServiceClient()
  const { data: o } = await supabase.from('orders')
    .select('id, order_number, shop_user_id, payment_status, payment_provider, payment_reference')
    .eq('id', orderId).maybeSingle()
  if (!o || o.payment_provider !== 'swedbankpay' || !o.payment_reference) return null
  const { config } = await resolveSwedbankConfig()
  if (!config) return null

  const po = (await getPaymentOrder(config, o.payment_reference)).paymentOrder
  let next: SyncResult['status'] = o.payment_status as SyncResult['status']
  if (po.status === 'Paid') {
    const captured = po.paid?.transactionType === 'Sale' || (po.remainingCaptureAmount === 0 && po.remainingCancellationAmount === 0)
    if (o.payment_status !== 'paid') next = captured ? 'paid' : 'authorized'
  } else if (po.status === 'Failed') {
    if (o.payment_status === 'unpaid') next = 'failed'
  } else if (po.status === 'Cancelled' || po.status === 'Aborted') {
    if (o.payment_status === 'unpaid' || o.payment_status === 'authorized') next = po.status === 'Aborted' ? 'failed' : 'cancelled'
  }
  if (next === o.payment_status) return { status: next, changed: false }

  // Kun opdatér, hvis status ikke er ændret imens (callback og retursiden kan komme samtidig)
  const { data: updated } = await supabase.from('orders')
    .update({ payment_status: next, ...(next === 'paid' ? { paid_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() })
    .eq('id', o.id).eq('payment_status', o.payment_status).select('id')
  if (!updated?.length) return { status: next, changed: false }

  await logPayment(o.id, `status:${next}`, { swedbank_status: po.status, transaction_type: po.paid?.transactionType ?? null, instrument: po.paid?.instrument ?? null })
  if (next === 'authorized' || next === 'paid') {
    const d = po.paid?.details
    const card = d?.maskedPan ? fromMaskedPan(d.maskedPan, { brand: d.cardBrand ?? null, expiry: d.expiryDate ? d.expiryDate.replace(/^(\d{2})\/\d{2}(\d{2})$/, '$1/$2') : null }) : null
    if (card) await rememberCard({ shopUserId: o.shop_user_id, orderId: o.id, card, source: 'online' })
    if (o.payment_status === 'unpaid' || o.payment_status === 'failed') {
      const { sendOrderConfirmation } = await import('@/lib/shop/order-email')
      await sendOrderConfirmation(o.id)
    }
  }
  return { status: next, changed: true }
}

// Træk betalingen, når varerne sendes/udleveres. Returnerer en fejltekst eller null.
export async function captureOrderPayment(orderId: string, actor: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data: o } = await supabase.from('orders').select('id, order_number, payment_status, payment_provider, payment_reference').eq('id', orderId).maybeSingle()
  if (!o || o.payment_provider !== 'swedbankpay' || o.payment_status !== 'authorized' || !o.payment_reference) return null
  const { config } = await resolveSwedbankConfig()
  if (!config) return 'Swedbank Pay er ikke sat op — betalingen kunne ikke trækkes'
  try {
    await capturePayment(config, o.payment_reference, o.order_number)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPayment(o.id, 'capture_failed', { error: msg, by: actor })
    return msg
  }
  await supabase.from('orders').update({ payment_status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', o.id)
  await logPayment(o.id, 'captured', { by: actor })
  return null
}

// Frigiv reservationen, når ordren annulleres før levering. Returnerer en fejltekst eller null.
export async function cancelOrderPayment(orderId: string, actor: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data: o } = await supabase.from('orders').select('id, order_number, payment_status, payment_provider, payment_reference').eq('id', orderId).maybeSingle()
  if (!o || o.payment_provider !== 'swedbankpay' || o.payment_status !== 'authorized' || !o.payment_reference) return null
  const { config } = await resolveSwedbankConfig()
  if (!config) return 'Swedbank Pay er ikke sat op — reservationen kunne ikke frigives'
  try {
    await cancelPayment(config, o.payment_reference, o.order_number)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPayment(o.id, 'cancel_failed', { error: msg, by: actor })
    return msg
  }
  await supabase.from('orders').update({ payment_status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', o.id)
  await logPayment(o.id, 'cancelled', { by: actor })
  return null
}

export { SwedbankError }
