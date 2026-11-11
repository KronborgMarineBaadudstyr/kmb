import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { confirmationPath, startPayment, syncPayment } from '@/lib/shop/payment'
import { fmtKr } from '@/lib/shop/email'
import { PendingSubmit } from '@/app/_components/pending-submit'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Betaling', robots: { index: false } }

// Kunden kommer hertil fra Swedbank Pays betalingsvindue (completeUrl og cancelUrl).
// At kunden er her, betyder ikke at betalingen lykkedes — status hentes altid hos Swedbank Pay.

async function loadOrder(id: string, token: string) {
  const { data } = await createServiceClient().from('orders')
    .select('id, order_number, access_token, order_total, email, payment_status, payment_provider')
    .eq('id', id).maybeSingle()
  return data && token && data.access_token === token ? data : null
}

async function retry(formData: FormData) {
  'use server'
  const o = await loadOrder(String(formData.get('id') ?? ''), String(formData.get('t') ?? ''))
  if (!o || o.payment_status === 'authorized' || o.payment_status === 'paid') redirect('/')
  let target: string
  try {
    const ua = (await headers()).get('user-agent') ?? ''
    target = (await startPayment({ ...o, order_total: Number(o.order_total), email: o.email ?? '' }, { userAgent: ua })).redirectUrl
  } catch {
    target = `/checkout/betaling/${o.id}?t=${encodeURIComponent(o.access_token)}&fejl=1`
  }
  redirect(target)
}

export default async function PaymentReturnPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; afbrudt?: string; fejl?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const order = await loadOrder(id, sp.t ?? '')
  if (!order) notFound()
  if (order.payment_provider !== 'swedbankpay') redirect(confirmationPath(order))

  let status = order.payment_status
  let lookupFailed = false
  try {
    status = (await syncPayment(order.id))?.status ?? status
  } catch (e) {
    lookupFailed = true
    console.error(`[betaling ${order.order_number}] status kunne ikke hentes:`, e instanceof Error ? e.message : e)
  }
  if (status === 'authorized' || status === 'paid') redirect(confirmationPath(order))

  const title = sp.afbrudt ? 'Betalingen blev afbrudt' : status === 'unpaid' && !lookupFailed ? 'Vi venter på svar fra betalingen' : 'Betalingen blev ikke gennemført'
  return (
    <div className="ls-confirm">
      <div className="ls-confirm-hero">
        <div className="ls-confirm-check" style={{ background: 'var(--warn)' }}>!</div>
        <h1>{title}</h1>
        <p>Ordre <strong>{order.order_number}</strong> · {fmtKr(Number(order.order_total))} · der er ikke trukket penge.</p>
      </div>
      <p className="ls-confirm-note">
        {sp.fejl
          ? 'Betalingen kunne ikke startes lige nu. Prøv igen om lidt.'
          : lookupFailed
            ? 'Vi kunne ikke hente status for betalingen lige nu. Opdatér siden om lidt — er betalingen gået igennem, får du en bekræftelse på mail.'
            : status === 'unpaid'
              ? 'Hvis du har gennemført betalingen, kan der gå et øjeblik, før vi får svar. Opdatér siden om lidt.'
              : 'Din ordre er gemt. Du kan prøve at betale igen — fx med et andet kort eller MobilePay.'}
      </p>
      <form action={retry} style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        <input type="hidden" name="id" value={order.id} />
        <input type="hidden" name="t" value={order.access_token} />
        <PendingSubmit label="Prøv at betale igen" pendingLabel="Åbner betaling…" className="ls-btn-primary" />
        <Link href="/kurv" className="ls-btn-ghost" style={{ color: 'var(--ink)' }}>Tilbage til kurven</Link>
      </form>
    </div>
  )
}
