import { createServiceClient } from '@/lib/supabase/server'
import { SHIPPING_METHODS, isShippingMethod } from '@/lib/shop/shipping'
import { confirmationPath, type PaymentMethod } from '@/lib/shop/payment-methods'
import { getStore, type StoreInfo } from '@/lib/shop/store'
import { sendEmail, escapeHtml, siteUrl, fmtKr } from '@/lib/shop/email'

// Ordrebekræftelsen. Betal ved afhentning: sendes når ordren oprettes.
// Online betaling: sendes først, når betalingen er reserveret/gennemført (lib/shop/payment.ts → syncPayment).

type Line = { name: string; qty: number; line_total: number }

export async function sendOrderConfirmation(orderId: string): Promise<boolean> {
  const { data: o } = await createServiceClient().from('orders')
    .select('id, order_number, access_token, email, customer_info, line_items, subtotal, shipping_total, order_total, shipping_method, payment_method, payment_status')
    .eq('id', orderId).maybeSingle()
  const to = o?.email ?? (o?.customer_info as { email?: string } | null)?.email
  if (!o || !to || !o.access_token) return false
  const link = `${await siteUrl()}${confirmationPath({ id: o.id, access_token: o.access_token })}`
  const method = isShippingMethod(o.shipping_method) ? o.shipping_method : 'delivery'
  const payment: PaymentMethod = o.payment_method === 'pickup' ? 'pickup' : 'online'
  return sendEmail(to, `Ordrebekræftelse ${o.order_number} — LoveSailing`,
    orderEmailHtml(o.order_number, (o.line_items ?? []) as Line[], Number(o.subtotal ?? 0), Number(o.shipping_total ?? 0),
      Number(o.order_total), method, payment, o.payment_status, link, await getStore()),
  ).catch(() => false)
}

function orderEmailHtml(
  orderNumber: string, lines: Line[], subtotal: number, shipping: number, total: number,
  method: 'delivery' | 'pickup', payment: PaymentMethod, paymentStatus: string, link: string, store: StoreInfo,
) {
  const rows = lines.map(l => `
    <tr>
      <td style="padding:6px 0">${l.qty} × ${escapeHtml(l.name)}</td>
      <td style="padding:6px 0;text-align:right;white-space:nowrap">${fmtKr(l.line_total)}</td>
    </tr>`).join('')
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#1a2543">
      <h2>Tak for din ordre</h2>
      <p>Ordrenummer: <strong>${escapeHtml(orderNumber)}</strong></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
        <tr><td style="padding-top:12px;border-top:1px solid #dde2ef">Subtotal</td>
            <td style="padding-top:12px;border-top:1px solid #dde2ef;text-align:right">${fmtKr(subtotal)}</td></tr>
        <tr><td>${escapeHtml(SHIPPING_METHODS[method].label)}</td>
            <td style="text-align:right">${shipping === 0 ? 'Gratis' : fmtKr(shipping)}</td></tr>
        <tr><td style="font-weight:700;padding-top:6px">I alt</td>
            <td style="font-weight:700;padding-top:6px;text-align:right">${fmtKr(total)}</td></tr>
      </table>
      ${payment === 'pickup'
        ? `<p>Du betaler ved afhentning hos ${escapeHtml(store.name)}${store.address ? `, ${escapeHtml(store.address)}` : ''}. Vi sender en mail, når varerne er klar til afhentning.</p>`
        : paymentStatus === 'authorized'
          ? `<p>Beløbet er reserveret på dit kort og trækkes først, når varerne ${method === 'pickup' ? 'udleveres' : 'sendes'}.</p>`
          : paymentStatus === 'paid' ? '<p>Betalingen er gennemført.</p>' : ''}
      <p><a href="${link}" style="color:#FF8500">Se din ordre</a></p>
      <p style="font-size:11px;color:#888">LoveSailing.dk · <a href="${new URL(link).origin}/handelsbetingelser" style="color:#888">Handelsbetingelser</a>${store.cvr ? ` · ${escapeHtml(store.legalName ?? store.name)} · CVR ${escapeHtml(store.cvr)}` : ''}</p>
    </div>`
}
