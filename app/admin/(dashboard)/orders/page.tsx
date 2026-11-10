import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { SHIPPING_METHODS, isShippingMethod } from '@/lib/shop/shipping'
import { confirmationPath } from '@/lib/shop/payment'
import { sendEmail, escapeHtml, siteUrl, fmtKr } from '@/lib/shop/email'
import { getStore, pickupPlaceHtml, type StoreInfo } from '@/lib/shop/store'
import { orderedQty, type OrderedEntry } from '@/lib/purchasing'
import { parseCardInput, rememberCard, maskCard } from '@/lib/payment-refs'

export const dynamic = 'force-dynamic'

const STATUSES: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'Ny',                  cls: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Under behandling',    cls: 'bg-yellow-100 text-yellow-800' },
  ready:      { label: 'Klar til afhentning', cls: 'bg-purple-100 text-purple-700' },
  completed:  { label: 'Afsluttet',           cls: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Annulleret',          cls: 'bg-gray-100 text-gray-500' },
}
const PAYMENT: Record<string, { label: string; cls: string }> = {
  unpaid:   { label: 'Ikke betalt', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  paid:     { label: 'Betalt',      cls: 'bg-green-50 text-green-700 border-green-200' },
  failed:   { label: 'Fejlet',      cls: 'bg-red-50 text-red-700 border-red-200' },
  refunded: { label: 'Refunderet',  cls: 'bg-gray-50 text-gray-600 border-gray-200' },
}
const PICKUP_UNPAID = { label: 'Betales ved afhentning', cls: 'bg-purple-50 text-purple-700 border-purple-200' }

type Line     = { cart_id: string; sku: string; name: string; qty: number; price: number; line_total: number; reserved_qty?: number; ordered?: OrderedEntry[] }

// Lager følger status: annulleret frigiver, afsluttet trækker fra, åben (gen)reserverer
async function applyStock(orderId: string, status: string, actor: string) {
  const action = status === 'cancelled' ? 'release' : status === 'completed' ? 'deduct' : 'reserve'
  const { error } = await createServiceClient().rpc('order_stock_apply', { p_order: orderId, p_action: action, p_actor: actor })
  if (error) console.error(`[ordre ${orderId}] lager (${action}) fejlede: ${error.message}`)
}
type Customer = { name?: string; email?: string; phone?: string; address?: string; postcode?: string; city?: string }

async function updateStatus(formData: FormData) {
  'use server'
  const me = await getCurrentAdmin()
  if (!me) return
  const id     = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!id || !(status in STATUSES)) return
  await createServiceClient().from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  await applyStock(id, status, me.email)
  revalidatePath('/admin/orders')
}

// Klar til afhentning: sæt status og send mail til kunden (kun første gang)
async function markReady(formData: FormData) {
  'use server'
  if (!(await getCurrentAdmin())) return
  const id = String(formData.get('id') ?? '')
  const supabase = createServiceClient()
  const { data: o } = await supabase.from('orders')
    .update({ status: 'ready', ready_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).is('ready_at', null)
    .select('id, order_number, email, customer_info, line_items, order_total, payment_method, payment_status, access_token')
    .maybeSingle()
  if (!o) {
    // Allerede markeret klar før — opdatér kun status, send ikke mail igen
    await supabase.from('orders').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', id)
  } else {
    const to = o.email ?? (o.customer_info as Customer)?.email
    if (to) await sendEmail(to, `Din ordre ${o.order_number} er klar til afhentning`, readyEmailHtml(o, await siteUrl(), await getStore())).catch(() => false)
  }
  revalidatePath('/admin/orders')
}

async function markPickedUpPaid(formData: FormData) {
  'use server'
  const me = await getCurrentAdmin()
  if (!me) return
  const id  = String(formData.get('id') ?? '')
  const now = new Date().toISOString()
  const { data: o } = await createServiceClient().from('orders')
    .update({ status: 'completed', payment_status: 'paid', paid_at: now, updated_at: now })
    .eq('id', id).select('shop_user_id').maybeSingle()
  await applyStock(id, 'completed', me.email)
  // Betalt med kort i butikken: sidste 4 cifre (fra kvitteringen) gemmes som reference til kunden — aldrig hele nummeret
  const card = parseCardInput(String(formData.get('card') ?? ''))
  if (card) await rememberCard({ shopUserId: o?.shop_user_id ?? null, orderId: id, card, source: 'manual' })
  revalidatePath('/admin/orders')
}

function readyEmailHtml(o: {
  id: string; order_number: string; customer_info: unknown; line_items: unknown; order_total: number
  payment_method: string | null; payment_status: string; access_token: string | null
}, site: string, store: StoreInfo) {
  const c     = (o.customer_info ?? {}) as Customer
  const lines = (Array.isArray(o.line_items) ? o.line_items : []) as Line[]
  const pay   = o.payment_method === 'pickup' && o.payment_status !== 'paid'
  const link  = o.access_token ? `${site}${confirmationPath({ id: o.id, access_token: o.access_token })}` : null
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#1a2543">
      <h2>${c.name ? `Hej ${escapeHtml(c.name.split(' ')[0])}` : 'Hej'} — dine varer er klar</h2>
      <p>Ordre <strong>${escapeHtml(o.order_number)}</strong> ligger klar til afhentning hos:</p>
      <p style="background:#f0f2f8;border-radius:8px;padding:12px 14px">${pickupPlaceHtml(store)}</p>
      <ul style="padding-left:18px;font-size:14px">
        ${lines.map(l => `<li>${l.qty} × ${escapeHtml(l.name)}</li>`).join('')}
      </ul>
      ${pay ? `<p>Du betaler <strong>${fmtKr(Number(o.order_total))}</strong> i butikken, når du henter varerne.</p>` : ''}
      ${link ? `<p><a href="${link}" style="color:#FF8500">Se din ordre</a></p>` : ''}
      <p style="font-size:11px;color:#888">${escapeHtml(store.name)} · LoveSailing.dk</p>
    </div>`
}

const kr = (n: number | string | null) =>
  n == null ? '—' : Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2 }) + ' kr'

const btn = 'px-3 py-1.5 text-sm rounded-md font-medium'

type OrderListRow = {
  id: string; order_number: string | null; source: string; status: string; payment_status: string; payment_method: string | null
  email: string | null; customer_info: unknown; line_items: unknown; shipping_method: string; order_total: number
  customer_note: string | null; ordered_at: string; ready_at: string | null; stock_state: string | null; payment_card?: unknown
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q } = await searchParams
  const orderNo = q?.trim() || null     // fra Indkøb: vis én ordre, foldet ud
  const COLS = 'id, order_number, source, status, payment_status, payment_method, email, customer_info, line_items, shipping_method, order_total, customer_note, ordered_at, ready_at, stock_state'
  const load = (cols: string) => {
    let query = createServiceClient().from('orders').select(cols)
      .order('ordered_at', { ascending: false })
      .limit(200)
    if (status && status in STATUSES) query = query.eq('status', status)
    if (orderNo) query = query.eq('order_number', orderNo)
    return query
  }
  // payment_card kommer med migration 068 — uden den vises ordrerne stadig
  let res = await load(`${COLS}, payment_card`)
  if (res.error && /payment_card/.test(res.error.message)) res = await load(COLS)
  const { error } = res
  const orders = res.data as unknown as OrderListRow[] | null

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Ordrer</h2>
          <p className="text-sm text-gray-500">
            {orderNo
              ? <>Viser ordre <span className="font-mono">{orderNo}</span> · <a href="/admin/orders" className="text-blue-600 hover:underline">Vis alle ordrer</a></>
              : 'Seneste 200 ordrer. Klik en ordre for detaljer og handlinger.'}
          </p>
        </div>
        <nav className="flex gap-1.5 text-sm flex-wrap">
          <a href="/admin/orders" className={`px-3 py-1.5 rounded-md border ${!status ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>Alle</a>
          {Object.entries(STATUSES).map(([k, s]) => (
            <a key={k} href={`/admin/orders?status=${k}`}
              className={`px-3 py-1.5 rounded-md border ${status === k ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">Kunne ikke hente ordrer: {error.message}</p>}
      {!error && (orders ?? []).length === 0 && (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          Ingen ordrer
        </div>
      )}

      <div className="space-y-2">
        {(orders ?? []).map(o => {
          const c        = (o.customer_info ?? {}) as Customer
          const lines    = (Array.isArray(o.line_items) ? o.line_items : []) as Line[]
          const st       = STATUSES[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-500' }
          const isPickup = o.shipping_method === 'pickup'
          const payAtPickup = o.payment_method === 'pickup' && o.payment_status !== 'paid'
          const pay      = payAtPickup ? PICKUP_UNPAID : (PAYMENT[o.payment_status] ?? PAYMENT.unpaid)
          const method   = isShippingMethod(o.shipping_method) ? SHIPPING_METHODS[o.shipping_method].label : o.shipping_method
          const open     = !['completed', 'cancelled'].includes(o.status)
          const tracked  = o.stock_state === 'reserved' || o.stock_state === 'deducted'
          const toOrder  = tracked ? lines.reduce((s, l) => s + Math.max(0, (Number(l.qty) || 0) - (l.reserved_qty ?? 0) - orderedQty(l)), 0) : 0
          return (
            <details key={o.id} open={!!orderNo} className="bg-white rounded-lg border border-gray-200 group">
              <summary className="list-none cursor-pointer px-4 py-3 grid grid-cols-[110px_120px_1fr_150px_100px_auto] gap-4 items-center text-sm hover:bg-gray-50">
                <span className="font-mono font-semibold text-gray-900">
                  {o.order_number ?? '—'}
                  {o.source !== 'webshop' && <span className="ml-1.5 text-[10px] uppercase text-gray-400">{o.source}</span>}
                </span>
                <span className="text-gray-500 text-xs">{new Date(o.ordered_at).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900 truncate">{c.name ?? '—'}</span>
                  <span className="block text-xs text-gray-400 truncate">{o.email ?? c.email}</span>
                </span>
                <span className="text-xs text-gray-500">{method} · {lines.reduce((s, l) => s + (Number(l.qty) || 1), 0)} stk.</span>
                <span className="font-semibold text-gray-900 text-right tabular-nums">{kr(o.order_total)}</span>
                <span className="flex gap-1.5 justify-end">
                  {open && toOrder > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full border whitespace-nowrap bg-amber-50 text-amber-800 border-amber-200"
                      title="Ikke nok på eget lager — skal bestilles hos leverandør">{toOrder} skal bestilles</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${pay.cls}`}>{pay.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                </span>
              </summary>

              <div className="border-t border-gray-100 px-4 py-4 grid grid-cols-[1fr_280px] gap-6">
                <table className="w-full text-sm self-start">
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.cart_id ?? i} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 pr-3 text-gray-500 tabular-nums w-10">{l.qty}×</td>
                        <td className="py-1.5 pr-3 text-gray-900">
                          {l.name}<span className="ml-2 font-mono text-xs text-gray-400">{l.sku}</span>
                          {tracked && <StockNote qty={Number(l.qty) || 0} reserved={l.reserved_qty ?? 0} ordered={Array.isArray(l.ordered) ? l.ordered : []} deducted={o.stock_state === 'deducted'} />}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-700 whitespace-nowrap">{kr(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="text-sm space-y-3">
                  <div className="text-gray-700 leading-relaxed">
                    {c.name}<br />
                    {c.address && !isPickup && <>{c.address}<br />{c.postcode} {c.city}<br /></>}
                    {c.phone && <a href={`tel:${c.phone}`} className="text-blue-600">{c.phone}</a>}<br />
                    {c.email && <a href={`mailto:${c.email}`} className="text-blue-600">{c.email}</a>}
                  </div>
                  {!!o.payment_card && (
                    <p className="text-xs text-gray-500">Betalt med kort {maskCard(o.payment_card as { last4: string; bin?: string | null })}</p>
                  )}
                  {o.customer_note && (
                    <p className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-900 whitespace-pre-wrap">{o.customer_note}</p>
                  )}

                  {isPickup && open && (
                    <div className="flex flex-col gap-2">
                      {o.status !== 'ready' && (
                        <form action={markReady}>
                          <input type="hidden" name="id" value={o.id} />
                          <button className={`${btn} w-full bg-purple-600 text-white hover:bg-purple-700`}>
                            Klar til afhentning{o.ready_at ? '' : ' — send mail'}
                          </button>
                        </form>
                      )}
                      <form action={markPickedUpPaid} className="flex flex-col gap-1.5">
                        <input type="hidden" name="id" value={o.id} />
                        {payAtPickup && (
                          <label className="text-xs text-gray-500">
                            Betalt med kort? Sidste 4 cifre fra kvitteringen <span className="text-gray-400">(valgfrit — genkender kunden næste gang)</span>
                            <input name="card" inputMode="numeric" maxLength={24} placeholder="fx 1234"
                              className="mt-1 w-full px-2 py-1 text-sm border border-gray-300 rounded-md font-mono" />
                          </label>
                        )}
                        <button className={`${btn} w-full bg-green-600 text-white hover:bg-green-700`}>
                          {payAtPickup ? `Afhentet og betalt (${kr(o.order_total)})` : 'Afhentet'}
                        </button>
                      </form>
                    </div>
                  )}

                  <form action={updateStatus} className="flex gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <select name="status" defaultValue={o.status}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md">
                      {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                    <button className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>Gem</button>
                  </form>
                </div>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

function StockNote({ qty, reserved, ordered, deducted }: { qty: number; reserved: number; ordered: OrderedEntry[]; deducted: boolean }) {
  const orderedTotal = ordered.reduce((n, e) => n + (Number(e.qty) || 0), 0)
  const missing = qty - reserved - orderedTotal
  if (reserved >= qty) {
    return <div className="text-xs text-green-700">{deducted ? 'Trukket fra eget lager' : 'Reserveret på eget lager'}</div>
  }
  const parts: React.ReactNode[] = []
  if (reserved > 0) parts.push(<span key="r" className="text-green-700">{reserved} fra eget lager</span>)
  for (const e of ordered) {
    parts.push(
      <span key={e.ref} className="text-blue-700" title={e.ref}>
        {e.qty} bestilt hos {e.supplier_name} {new Date(e.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
      </span>)
  }
  if (missing > 0) parts.push(<span key="m" className="text-amber-700">{missing} skal bestilles</span>)
  return <div className="text-xs">{parts.flatMap((p, i) => i ? [<span key={`s${i}`} className="text-gray-300"> · </span>, p] : [p])}</div>
}
