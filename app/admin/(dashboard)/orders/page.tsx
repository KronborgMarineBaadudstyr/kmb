import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { SHIPPING_METHODS, isShippingMethod } from '@/lib/shop/shipping'

export const dynamic = 'force-dynamic'

const STATUSES: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'Ny',                cls: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Under behandling',  cls: 'bg-yellow-100 text-yellow-800' },
  completed:  { label: 'Afsluttet',         cls: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Annulleret',        cls: 'bg-gray-100 text-gray-500' },
}
const PAYMENT: Record<string, { label: string; cls: string }> = {
  unpaid:   { label: 'Ikke betalt', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  paid:     { label: 'Betalt',      cls: 'bg-green-50 text-green-700 border-green-200' },
  failed:   { label: 'Fejlet',      cls: 'bg-red-50 text-red-700 border-red-200' },
  refunded: { label: 'Refunderet',  cls: 'bg-gray-50 text-gray-600 border-gray-200' },
}

type Line     = { cart_id: string; sku: string; name: string; qty: number; price: number; line_total: number }
type Customer = { name?: string; email?: string; phone?: string; address?: string; postcode?: string; city?: string }

async function updateStatus(formData: FormData) {
  'use server'
  if (!(await isAdmin())) return
  const id     = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!id || !(status in STATUSES)) return
  await createServiceClient().from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/orders')
}

const kr = (n: number | string | null) =>
  n == null ? '—' : Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2 }) + ' kr'

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  let query = createServiceClient()
    .from('orders')
    .select('id, order_number, source, status, payment_status, email, customer_info, line_items, shipping_method, order_total, customer_note, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && status in STATUSES) query = query.eq('status', status)
  const { data: orders, error } = await query

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Ordrer</h2>
          <p className="text-sm text-gray-500">Seneste 200 ordrer fra webshoppen. Klik en ordre for detaljer.</p>
        </div>
        <nav className="flex gap-1.5 text-sm">
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
          Ingen ordrer endnu
        </div>
      )}

      <div className="space-y-2">
        {(orders ?? []).map(o => {
          const c      = (o.customer_info ?? {}) as Customer
          const lines  = (Array.isArray(o.line_items) ? o.line_items : []) as Line[]
          const st     = STATUSES[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-500' }
          const pay    = PAYMENT[o.payment_status] ?? PAYMENT.unpaid
          const method = isShippingMethod(o.shipping_method) ? SHIPPING_METHODS[o.shipping_method].label : o.shipping_method
          return (
            <details key={o.id} className="bg-white rounded-lg border border-gray-200 group">
              <summary className="list-none cursor-pointer px-4 py-3 grid grid-cols-[110px_120px_1fr_150px_100px_auto] gap-4 items-center text-sm hover:bg-gray-50">
                <span className="font-mono font-semibold text-gray-900">
                  {o.order_number ?? '—'}
                  {o.source !== 'webshop' && <span className="ml-1.5 text-[10px] uppercase text-gray-400">{o.source}</span>}
                </span>
                <span className="text-gray-500 text-xs">{new Date(o.created_at).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900 truncate">{c.name ?? '—'}</span>
                  <span className="block text-xs text-gray-400 truncate">{o.email ?? c.email}</span>
                </span>
                <span className="text-xs text-gray-500">{method} · {lines.reduce((s, l) => s + l.qty, 0)} stk.</span>
                <span className="font-semibold text-gray-900 text-right tabular-nums">{kr(o.order_total)}</span>
                <span className="flex gap-1.5 justify-end">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${pay.cls}`}>{pay.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                </span>
              </summary>

              <div className="border-t border-gray-100 px-4 py-4 grid grid-cols-[1fr_260px] gap-6">
                <table className="w-full text-sm">
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.cart_id} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 pr-3 text-gray-500 tabular-nums w-10">{l.qty}×</td>
                        <td className="py-1.5 pr-3 text-gray-900">{l.name}<span className="ml-2 font-mono text-xs text-gray-400">{l.sku}</span></td>
                        <td className="py-1.5 text-right tabular-nums text-gray-700 whitespace-nowrap">{kr(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="text-sm space-y-3">
                  <div className="text-gray-700 leading-relaxed">
                    {c.name}<br />
                    {c.address && <>{c.address}<br />{c.postcode} {c.city}<br /></>}
                    {c.phone && <a href={`tel:${c.phone}`} className="text-blue-600">{c.phone}</a>}<br />
                    {c.email && <a href={`mailto:${c.email}`} className="text-blue-600">{c.email}</a>}
                  </div>
                  {o.customer_note && (
                    <p className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-900 whitespace-pre-wrap">{o.customer_note}</p>
                  )}
                  <form action={updateStatus} className="flex gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <select name="status" defaultValue={o.status}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md">
                      {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                    <button className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700">Gem</button>
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
