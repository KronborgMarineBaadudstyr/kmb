import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { parseCardInput, findCustomersByCard, maskCard } from '@/lib/payment-refs'

export const dynamic = 'force-dynamic'

type User = {
  id: string; email: string | null; phone: string | null; name: string | null
  marketing_opt_in: boolean; pay_at_pickup_allowed: boolean | null; last_login_at: string | null; created_at: string
}
type OrderRow = { shop_user_id: string; status: string; source: string; ordered_at: string }

async function setPayAtPickup(formData: FormData) {
  'use server'
  if (!(await isAdmin())) return
  const id = String(formData.get('id') ?? '')
  const v  = String(formData.get('value') ?? 'auto')
  await createServiceClient().from('shop_users')
    .update({ pay_at_pickup_allowed: v === 'yes' ? true : v === 'no' ? false : null })
    .eq('id', id)
  revalidatePath('/admin/customers')
}

async function removeCard(formData: FormData) {
  'use server'
  if (!(await isAdmin())) return
  await createServiceClient().from('customer_payment_refs').delete().eq('id', String(formData.get('id') ?? ''))
  revalidatePath('/admin/customers')
}

type CardRow = { id: string; shop_user_id: string; card_last4: string; card_bin: string | null; card_brand: string | null; times_seen: number }

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; kort?: string; kort_bin?: string }> }) {
  const { q = '', kort = '', kort_bin = '' } = await searchParams
  // Find kunden ud fra delvist kortnummer (sidste 4 cifre, evt. første 6) — fx fra kortterminalens kvittering
  const cardQuery = kort ? parseCardInput(kort, kort_bin) : null
  const cardMatches = cardQuery ? await findCustomersByCard(cardQuery) : []
  const term = q.replace(/[,()*%\\]/g, ' ').trim()
  const supabase = createServiceClient()

  let query = supabase.from('shop_users')
    .select('id, email, phone, name, marketing_opt_in, pay_at_pickup_allowed, last_login_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (term) query = query.or(`email.ilike.%${term}%,phone.ilike.%${term}%,name.ilike.%${term}%`)
  const { data: users, error } = await query

  const ids = (users ?? []).map(u => u.id)
  const { data: orders } = ids.length
    ? await supabase.from('orders').select('shop_user_id, status, source, ordered_at').in('shop_user_id', ids)
    : { data: [] as OrderRow[] }

  // Kendte kort pr. kunde (migration 068 — uden den vises ingen)
  const { data: cardRows } = ids.length
    ? await supabase.from('customer_payment_refs').select('id, shop_user_id, card_last4, card_bin, card_brand, times_seen').in('shop_user_id', ids)
    : { data: [] as CardRow[] }
  const cardsByUser = new Map<string, CardRow[]>()
  for (const c of (cardRows ?? []) as CardRow[]) cardsByUser.set(c.shop_user_id, [...(cardsByUser.get(c.shop_user_id) ?? []), c])

  const stats = new Map<string, { count: number; last: string | null; known: boolean }>()
  for (const o of (orders ?? []) as OrderRow[]) {
    if (['cancelled', 'refunded'].includes(o.status)) continue
    const s = stats.get(o.shop_user_id) ?? { count: 0, last: null, known: false }
    s.count++
    if (!s.last || o.ordered_at > s.last) s.last = o.ordered_at
    if (o.status === 'completed' || o.source !== 'webshop') s.known = true
    stats.set(o.shop_user_id, s)
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Kunder</h2>
          <p className="text-sm text-gray-500">
            Kunder der har handlet før (afsluttet eller gammel/importeret ordre), kan automatisk betale ved afhentning.
            Overstyr pr. kunde herunder.
          </p>
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Søg e-mail, telefon, navn"
            className="w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Søg</button>
        </form>
      </div>

      <section className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <form className="flex items-end gap-2 flex-wrap">
          <label className="text-xs text-gray-500 font-medium">
            Find kunde via kort — sidste 4 cifre
            <input name="kort" defaultValue={kort} inputMode="numeric" maxLength={24} placeholder="1234"
              className="mt-1 block w-28 px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="text-xs text-gray-500 font-medium">
            Første 6 cifre <span className="font-normal text-gray-400">(valgfrit — mere sikkert)</span>
            <input name="kort_bin" defaultValue={kort_bin} inputMode="numeric" maxLength={8} placeholder="492500"
              className="mt-1 block w-28 px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <button className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Find</button>
          <span className="text-xs text-gray-400 ml-2 max-w-md">
            Kortet huskes, når en ordre markeres &quot;Afhentet og betalt&quot; med kortets sidste cifre. Hele kortnummeret gemmes aldrig.
          </span>
        </form>
        {kort && !cardQuery && <p className="mt-3 text-sm text-red-700">Skriv de sidste 4 cifre (fx 1234) — aldrig hele kortnummeret.</p>}
        {cardQuery && (
          <div className="mt-3">
            {cardMatches.length === 0 ? (
              <p className="text-sm text-gray-500">Ingen kunder har betalt med et kort, der ender på {cardQuery.last4}.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900 mb-2">
                  {cardMatches.length === 1 ? 'Er det denne kunde?' : `Er det en af disse ${cardMatches.length} kunder?`}
                  {!cardQuery.bin && cardMatches.length > 1 && <span className="font-normal text-gray-500"> — skriv også de første 6 cifre for at skelne</span>}
                </p>
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
                  {cardMatches.map(m => (
                    <li key={m.shop_user_id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="text-gray-900">{m.name ?? m.email ?? m.phone}</div>
                        <div className="text-xs text-gray-500">
                          {[m.email, m.phone].filter(Boolean).join(' · ')} · <span className="font-mono">{m.card}</span>{m.brand ? ` ${m.brand}` : ''}
                          {' '}· brugt {m.times_seen} {m.times_seen === 1 ? 'gang' : 'gange'}, senest {fmt(m.last_seen_at)}
                          {m.exact && <span className="ml-1 text-green-700">· udsteder passer</span>}
                        </div>
                      </div>
                      <a href={`/admin/customers?q=${encodeURIComponent(m.email ?? m.phone ?? m.name ?? '')}`}
                        className="shrink-0 px-2.5 py-1 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-700">Ja, det er kunden</a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600 mb-4">Kunne ikke hente kunder: {error.message}</p>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Kunde</th>
              <th className="text-right px-4 py-2 font-medium">Ordrer</th>
              <th className="text-left px-4 py-2 font-medium">Seneste køb</th>
              <th className="text-left px-4 py-2 font-medium">Nyheder</th>
              <th className="text-left px-4 py-2 font-medium">Betal ved afhentning</th>
              <th className="text-left px-4 py-2 font-medium">Kendte kort</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(users ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">{term ? 'Ingen kunder matcher' : 'Ingen kunder endnu'}</td></tr>
            )}
            {((users ?? []) as User[]).map(u => {
              const s       = stats.get(u.id) ?? { count: 0, last: null, known: false }
              const current = u.pay_at_pickup_allowed === null ? 'auto' : u.pay_at_pickup_allowed ? 'yes' : 'no'
              const allowed = u.pay_at_pickup_allowed ?? s.known
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2">
                    <div className="text-gray-900">{u.name ?? u.email ?? u.phone}</div>
                    <div className="text-xs text-gray-400">{[u.name ? u.email : null, u.phone].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.count}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmt(s.last)}</td>
                  <td className="px-4 py-2">{u.marketing_opt_in ? <span className="text-green-700">Ja</span> : <span className="text-gray-400">Nej</span>}</td>
                  <td className="px-4 py-2">
                    <form action={setPayAtPickup} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="value" defaultValue={current} className="px-2 py-1 text-sm border border-gray-300 rounded-md">
                        <option value="auto">Automatisk ({s.known ? 'ja' : 'nej'})</option>
                        <option value="yes">Altid</option>
                        <option value="no">Aldrig</option>
                      </select>
                      <button className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Gem</button>
                      <span className={`text-xs ${allowed ? 'text-green-700' : 'text-gray-400'}`}>{allowed ? '✓ tilladt' : 'ikke tilladt'}</span>
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    {(cardsByUser.get(u.id) ?? []).map(c => (
                      <form key={c.id} action={removeCard} className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                        <input type="hidden" name="id" value={c.id} />
                        <span className="font-mono">{maskCard(c)}</span>{c.card_brand && <span className="text-gray-400">{c.card_brand}</span>}
                        <button title="Glem dette kort" className="text-gray-300 hover:text-red-600">✕</button>
                      </form>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
