import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { SHIPPING_METHODS, isShippingMethod } from '@/lib/shop/shipping'
import { fmtKr } from '@/lib/shop/email'
import { STORE } from '@/lib/shop/store'
import { ClearCart } from './_clear-cart'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ordrebekræftelse', robots: { index: false } }

type Line = { cart_id: string; name: string; image: string | null; qty: number; price: number; line_total: number }
type Customer = { name: string; email: string; phone: string; address: string; postcode: string; city: string }

export default async function ConfirmationPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t }  = await searchParams
  if (!t || !/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = createServiceClient()
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, created_at, customer_info, line_items, shipping_method, shipping_total, subtotal, order_total, payment_status, payment_method, status, customer_note')
    .eq('id', id)
    .eq('access_token', t)
    .maybeSingle()
  if (!order) notFound()

  const lines    = (order.line_items ?? []) as Line[]
  const customer = (order.customer_info ?? {}) as Customer
  const method   = isShippingMethod(order.shipping_method) ? order.shipping_method : 'delivery'

  return (
    <div className="ls-confirm">
      <ClearCart orderId={order.id} />

      <div className="ls-confirm-hero">
        <div className="ls-confirm-check">✓</div>
        <h1>Tak for din ordre, {customer.name?.split(' ')[0]}</h1>
        <p>Ordrenummer <strong>{order.order_number}</strong> · bekræftelse sendt til {customer.email}</p>
      </div>

      {order.payment_method === 'pickup' && order.payment_status !== 'paid' ? (
        <p className="ls-confirm-note">
          {order.status === 'ready'
            ? <>Dine varer er <strong>klar til afhentning</strong>. </>
            : <>Vi sender en mail, når dine varer er klar til afhentning. </>}
          Du betaler {fmtKr(Number(order.order_total))} i butikken, når du henter dem.
          {STORE.address && <><br />{STORE.name}, {STORE.address}</>}
          {STORE.openingHours && <><br />Åbent: {STORE.openingHours}</>}
        </p>
      ) : order.payment_status !== 'paid' && (
        <p className="ls-confirm-note">
          Vi har registreret din ordre og kontakter dig om betaling{method === 'pickup' ? ' og afhentning' : ' og levering'}.
        </p>
      )}

      <div className="ls-confirm-grid">
        <section className="ls-cart-summary" style={{ position: 'static' }}>
          <h2>Varer</h2>
          <ul className="ls-checkout-lines">
            {lines.map(l => (
              <li key={l.cart_id}>
                <span className="ls-checkout-line-thumb">
                  {l.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={l.image} alt="" />
                    : '⚓'}
                  <em>{l.qty}</em>
                </span>
                <span className="ls-checkout-line-name">{l.name}</span>
                <span className="ls-checkout-line-price">{fmtKr(l.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="ls-cart-summary-row"><span>Subtotal</span><span>{fmtKr(Number(order.subtotal))}</span></div>
          <div className="ls-cart-summary-row">
            <span>{SHIPPING_METHODS[method].label}</span>
            <span>{Number(order.shipping_total) === 0 ? 'Gratis' : fmtKr(Number(order.shipping_total))}</span>
          </div>
          <div className="ls-cart-summary-row total"><span>I alt</span><span>{fmtKr(Number(order.order_total))}</span></div>
        </section>

        <section className="ls-cart-summary" style={{ position: 'static' }}>
          <h2>{method === 'pickup' ? 'Afhentning' : 'Leveres til'}</h2>
          <address className="ls-confirm-address">
            {customer.name}<br />
            {method === 'delivery' && <>{customer.address}<br />{customer.postcode} {customer.city}<br /></>}
            {customer.phone}<br />
            {customer.email}
          </address>
          {order.customer_note && (
            <>
              <h2 style={{ marginTop: 16 }}>Bemærkning</h2>
              <p className="ls-confirm-address">{order.customer_note}</p>
            </>
          )}
        </section>
      </div>

      <div style={{ textAlign: 'center', margin: '32px 0 56px' }}>
        <Link href="/" className="ls-btn-primary">Fortsæt med at handle</Link>
      </div>
    </div>
  )
}
