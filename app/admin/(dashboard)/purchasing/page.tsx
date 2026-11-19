import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  buildPurchaseList, buildOrderedList, markSupplierOrdered, undoOrdered, saveSupplierOrdering,
  portalPaste, orderMailBody, type PurchaseGroup, type PurchaseLine, type PurchaseOrder,
} from '@/lib/purchasing'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { ConfirmSubmit } from '../_confirm-submit'
import { CopyButton } from './_copy-button'

export const dynamic = 'force-dynamic'

const kr = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
const kr0 = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr'

const REASON: Record<NonNullable<PurchaseLine['reason']>, string> = {
  preferred: 'Foretrukken',
  cheapest:  'Laveste pris',
  only:      'Eneste',
}

const anchor = (g: PurchaseGroup) => `lev-${g.supplier_id ?? 'none'}`

// ── Server actions (går ikke gennem middleware — tjekker selv admin) ────────────

async function markOrdered(formData: FormData) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/login')
  const supplierId  = String(formData.get('supplier') ?? '')
  const orderId     = String(formData.get('order') ?? '') || undefined     // kun én ordre (fx bestilt til levering hos kunden)
  const selectable  = formData.get('selectable') === '1'                  // tabellen med flueben pr. vare
  const lineKeys    = selectable ? formData.getAll('line').map(String) : undefined
  const supplierRef = String(formData.get('supplier_ref') ?? '')
  const view        = formData.get('view') === 'ordrer' ? '&visning=ordrer' : ''
  const r = await markSupplierOrdered(supplierId, admin.email, { orderId, lineKeys, supplierRef })
  revalidatePath('/admin/purchasing')
  if ('error' in r) redirect(`/admin/purchasing?err=${encodeURIComponent(r.error)}${view}`)
  redirect(`/admin/purchasing?ordered=${encodeURIComponent(r.ref)}${r.failed ? `&failed=${r.failed}` : ''}${view}`)
}

async function undo(formData: FormData) {
  'use server'
  if (!(await getCurrentAdmin())) redirect('/login')
  const ref = String(formData.get('ref') ?? '')
  const r = await undoOrdered(ref)
  revalidatePath('/admin/purchasing')
  redirect(`/admin/purchasing?undone=${encodeURIComponent(ref)}${r.failed ? `&failed=${r.failed}` : ''}`)
}

async function saveOrdering(formData: FormData) {
  'use server'
  if (!(await getCurrentAdmin())) redirect('/login')
  const supplierId = String(formData.get('supplier') ?? '')
  const fields = Object.fromEntries(
    ['portal_url', 'customer_number', 'order_email', 'order_phone', 'cutoff', 'delivery', 'min_order', 'free_freight', 'notes']
      .map(k => [k, String(formData.get(k) ?? '')]))
  const err = await saveSupplierOrdering(supplierId, fields)
  revalidatePath('/admin/purchasing')
  redirect(err ? `/admin/purchasing?err=${encodeURIComponent(err)}` : `/admin/purchasing?saved=1#lev-${supplierId}`)
}

// ── Visning ─────────────────────────────────────────────────────────────────

const orderLink = (n: string | null) => n ? `/admin/orders?q=${encodeURIComponent(n)}` : '/admin/orders'

function OrderLinks({ numbers }: { numbers: string[] }) {
  return <>{numbers.map((n, i) => <span key={n}>{i > 0 && ', '}<a href={orderLink(n)} className="text-blue-600 hover:underline">{n}</a></span>)}</>
}

// Hvor langt er vi fra minimumsordre / fragtfri levering?
function Threshold({ total, limit, label, reachedText }: { total: number; limit?: number; label: string; reachedText: string }) {
  if (!limit) return null
  const pct = Math.min(100, Math.round((total / limit) * 100))
  const ok  = total >= limit
  return (
    <div className="w-64">
      <div className="flex justify-between gap-3 text-[11px] text-gray-500 mb-0.5">
        <span>{label} {kr0(limit)}</span>
        <span className={ok ? 'text-green-700 font-medium' : 'text-amber-700'}>{ok ? reachedText : `mangler ${kr0(limit - total)}`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${ok ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Alt hvad der skal til for at bestille hos leverandøren: portal, kundenr., kontakt, frister — og redigering
function OrderingInfo({ g }: { g: PurchaseGroup }) {
  const o = g.ordering
  const email = o.order_email ?? g.contact_email
  const phone = o.order_phone ?? g.contact_phone
  const body  = orderMailBody(g)
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(`Bestilling — Kronborg Marine${o.customer_number ? ` (kundenr. ${o.customer_number})` : ''}`)}${body.length < 1500 ? `&body=${encodeURIComponent(body)}` : ''}`
    : null
  const empty = !o.portal_url && !o.customer_number && !email && !phone && !o.cutoff && !o.delivery && !o.notes

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-white text-sm">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        {o.portal_url && (
          <a href={o.portal_url} target="_blank" rel="noreferrer"
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium whitespace-nowrap">
            Åbn B2B-portal ↗
          </a>
        )}
        {o.customer_number && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Kundenr.</span>
            <span className="font-mono font-semibold text-gray-900 select-all">{o.customer_number}</span>
            <CopyButton text={o.customer_number} />
          </div>
        )}
        {email && (
          <div className="flex items-center gap-1.5">
            <a href={mailto ?? `mailto:${email}`} className="text-blue-600 hover:underline">{email}</a>
            {mailto && <span className="text-xs text-gray-400">{body.length < 1500 ? '(åbner mail med varerne)' : ''}</span>}
          </div>
        )}
        {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="text-gray-700 hover:text-blue-600">{phone}</a>}
        {g.contact_name && <span className="text-gray-500">{g.contact_name}</span>}
        {o.cutoff && <span className="text-gray-700"><span className="text-gray-500">Frist:</span> {o.cutoff}</span>}
        {o.delivery && <span className="text-gray-700"><span className="text-gray-500">Levering:</span> {o.delivery}</span>}
      </div>
      {(o.min_order || o.free_freight) && (
        <div className="mt-3 flex flex-wrap gap-6">
          <Threshold total={g.total} limit={o.min_order} label="Minimumsordre" reachedText="nået" />
          <Threshold total={g.total} limit={o.free_freight} label="Fragtfri fra" reachedText="fragtfri" />
        </div>
      )}
      {o.notes && <p className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-1 whitespace-pre-line">{o.notes}</p>}

      <details className="mt-2 group">
        <summary className="cursor-pointer text-xs text-blue-600 hover:underline list-none">
          {empty ? '+ Tilføj bestillingsoplysninger (portal, kundenr., frist, minimumsordre …)' : 'Rediger bestillingsoplysninger'}
        </summary>
        <form action={saveOrdering} className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          <input type="hidden" name="supplier" value={g.supplier_id ?? ''} />
          {([
            ['portal_url',      'B2B-portal (link)',             o.portal_url,      'https://…'],
            ['customer_number', 'Vores kundenr. hos dem',        o.customer_number, ''],
            ['order_email',     'Bestillings-e-mail',            o.order_email,     g.contact_email ?? ''],
            ['order_phone',     'Bestillings-telefon',           o.order_phone,     g.contact_phone ?? ''],
            ['cutoff',          'Frist',                         o.cutoff,          'fx kl. 14 — afsendes samme dag'],
            ['delivery',        'Leveringstid',                  o.delivery,        'fx 1-2 hverdage'],
            ['min_order',       'Minimumsordre (kr ekskl. moms)', o.min_order?.toString(), ''],
            ['free_freight',    'Fragtfri fra (kr ekskl. moms)', o.free_freight?.toString(), ''],
          ] as const).map(([name, label, value, ph]) => (
            <label key={name} className="flex flex-col gap-0.5 text-gray-500">
              {label}
              <input name={name} defaultValue={value ?? ''} placeholder={ph}
                className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900" />
            </label>
          ))}
          <label className="flex flex-col gap-0.5 text-gray-500 sm:col-span-2 lg:col-span-3">
            Noter (fx hvordan man logger ind, særlige regler) — skriv aldrig adgangskoder her
            <textarea name="notes" defaultValue={o.notes ?? ''} rows={2}
              className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900" />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium">Gem</button>
          </div>
        </form>
      </details>
    </div>
  )
}

// Én ordre hos én leverandør: kunde, levering og varer — klar til at bestille med levering direkte til kunden
function OrderCard({ o, supplierId }: { o: PurchaseOrder; supplierId: string | null }) {
  const c = o.customer
  const delivery = o.shipping_method === 'delivery'
  const address = [c.name, c.address, [c.postcode, c.city].filter(Boolean).join(' ')].filter(Boolean)
  return (
    <div className="border-t border-gray-100 px-4 py-3 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-4">
      <div className="text-sm min-w-0">
        <a href={orderLink(o.order_number)} className="font-mono font-semibold text-blue-600 hover:underline">{o.order_number ?? '—'}</a>
        {o.ordered_at && <span className="ml-2 text-xs text-gray-400">{new Date(o.ordered_at).toLocaleDateString('da-DK')}</span>}
        {delivery ? (
          <div className="mt-1.5">
            <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">Sendes til kunden — kan leveres direkte</span>
            <address className="not-italic mt-1.5 text-gray-800 leading-snug select-all">
              {address.map((l, i) => <div key={i}>{l}</div>)}
            </address>
            <div className="text-xs text-gray-500 mt-1">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
            <div className="mt-1.5">
              <CopyButton label="Kopiér adresse" text={[...address, c.phone].filter(Boolean).join('\n')} />
            </div>
          </div>
        ) : (
          <div className="mt-1.5">
            <span className="text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">Afhentes i butikken — bestil til butikken</span>
            <div className="text-gray-800 mt-1.5">{c.name ?? '—'}</div>
            <div className="text-xs text-gray-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
          </div>
        )}
        {o.note && <p className="mt-1.5 text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">Kundens note: {o.note}</p>}
      </div>
      <table className="text-sm self-start">
        <tbody>
          {o.lines.map((l, i) => (
            <tr key={i}>
              <td className="pr-3 py-0.5 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">{l.qty} ×</td>
              <td className="pr-3 py-0.5 text-gray-800">{l.name}</td>
              <td className="py-0.5 font-mono text-xs text-gray-500 whitespace-nowrap">{l.supplier_sku ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {supplierId && (
        <form action={markOrdered} className="self-start flex flex-col gap-1.5 items-stretch">
          <input type="hidden" name="supplier" value={supplierId} />
          <input type="hidden" name="order" value={o.order_id} />
          <input type="hidden" name="view" value="ordrer" />
          <input name="supplier_ref" placeholder="Leverandørens ordrenr." className="border border-gray-300 rounded px-2 py-1 text-xs w-44" />
          <ConfirmSubmit label="Markér ordre som bestilt" pendingLabel="Markerer…"
            confirmText={`Markér varerne til ordre ${o.order_number ?? ''} som bestilt?`}
            className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium disabled:opacity-40 whitespace-nowrap" />
        </form>
      )}
    </div>
  )
}

// Varerne hos én leverandør med flueben (alle valgt) — så det leverandøren ikke har, kan blive stående
function LinesForm({ g }: { g: PurchaseGroup }) {
  return (
    <form action={markOrdered}>
      <input type="hidden" name="supplier" value={g.supplier_id ?? ''} />
      <input type="hidden" name="selectable" value="1" />
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase tracking-wide">
          <tr className="border-b border-gray-100">
            {g.supplier_id && <th className="w-8 pl-4 py-2" title="Fjern fluebenet ved varer, I ikke bestiller nu"></th>}
            <th className="text-left px-4 py-2 font-medium">Vare</th>
            <th className="text-left px-4 py-2 font-medium">Lev. varenr.</th>
            <th className="text-right px-4 py-2 font-medium">Bestil</th>
            <th className="text-right px-4 py-2 font-medium">Indkøbspris</th>
            <th className="text-right px-4 py-2 font-medium">Lev. lager</th>
            <th className="text-left px-4 py-2 font-medium">Ordrer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {g.lines.map(l => {
            const short = l.supplier_stock != null && l.supplier_stock < l.order_qty
            return (
              <tr key={l.key} className="has-[:checked]:bg-white bg-gray-50/60">
                {g.supplier_id && (
                  <td className="pl-4 py-2 align-top">
                    <input type="checkbox" name="line" value={l.key} defaultChecked className="mt-0.5 accent-gray-900" />
                  </td>
                )}
                <td className="px-4 py-2">
                  <a href={`/admin/products/${l.product_id}`} className="text-gray-900 hover:text-blue-600">{l.name}</a>
                  <div className="text-xs text-gray-400 font-mono">
                    {l.sku}{l.ean ? ` · ${l.ean}` : ''}
                    {l.reason && g.supplier_id && <span className="font-sans ml-2 text-gray-400">· {REASON[l.reason]}</span>}
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">
                  {l.supplier_sku
                    ? <span className="inline-flex items-center gap-1.5"><span className="select-all">{l.supplier_sku}</span><CopyButton text={l.supplier_sku} label="⧉" title="Kopiér varenr." className="text-gray-400 hover:text-gray-700" /></span>
                    : '—'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <span className="font-semibold text-gray-900">{l.order_qty}</span>
                  {l.order_qty > l.missing && (
                    <div className="text-xs text-gray-400">mangler {l.missing} · min. {l.moq}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">{kr(l.purchase_price)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${short ? 'text-red-600 font-medium' : 'text-gray-500'}`}
                  title={short ? 'Leverandøren har færre på lager end der skal bestilles' : undefined}>
                  {l.supplier_stock ?? '—'}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500"><OrderLinks numbers={l.orders} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {g.supplier_id && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2 flex-wrap">
          <span className="text-xs text-gray-500 mr-auto">Fjern fluebenet ved varer, I ikke bestiller nu — de bliver stående her.</span>
          <input name="supplier_ref" placeholder="Leverandørens ordrenr. (valgfrit)"
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-60 bg-white" />
          <ConfirmSubmit
            label="Markér valgte som bestilt"
            pendingLabel="Markerer…"
            confirmText={`Markér de valgte varer som bestilt hos ${g.supplier_name}?`}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium disabled:opacity-40" />
        </div>
      )}
    </form>
  )
}

const fmtDate = (d: string) => new Date(d).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default async function PurchasingPage({
  searchParams,
}: { searchParams: Promise<{ ordered?: string; undone?: string; failed?: string; err?: string; saved?: string; visning?: string }> }) {
  const sp = await searchParams
  const byOrder = sp.visning === 'ordrer'
  const [{ groups, error }, { batches }] = await Promise.all([buildPurchaseList(), buildOrderedList()])
  const lineCount = groups.reduce((s, g) => s + g.lines.length, 0)

  return (
    <div className="p-8 max-w-6xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Indkøb</h2>
      <p className="text-sm text-gray-500 mb-6">
        Varer på åbne ordrer, der ikke kunne tages fra eget lager, fordelt pr. leverandør (foretrukken leverandør,
        ellers laveste indkøbspris). Bestil i leverandørens portal, og tryk &quot;Markér valgte som bestilt&quot; —
        varerne flyttes til &quot;Bestilt&quot; og bestilles ikke igen.
      </p>

      {sp.ordered && (
        <p className="mb-4 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">
          ✓ Markeret som bestilt ({sp.ordered}).{sp.failed ? ` ${sp.failed} ordre(r) blev ændret samtidig og kom ikke med — de står stadig under "Skal bestilles".` : ''}
        </p>
      )}
      {sp.undone && (
        <p className="mb-4 text-sm bg-gray-50 border border-gray-200 text-gray-700 rounded-lg px-4 py-2">
          Bestilling {sp.undone} er fortrudt — varerne står igen under &quot;Skal bestilles&quot;.{sp.failed ? ` ${sp.failed} ordre(r) kunne ikke opdateres; prøv igen.` : ''}
        </p>
      )}
      {sp.saved && <p className="mb-4 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2">✓ Bestillingsoplysningerne er gemt.</p>}
      {sp.err && <p className="mb-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{sp.err}</p>}

      {/* Overblik: én række pr. leverandør — klik for at springe ned */}
      {groups.length > 1 && (
        <nav className="mb-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {groups.map(g => {
            const o = g.ordering
            const below = o.min_order && g.total < o.min_order
            return (
              <a key={anchor(g)} href={`#${anchor(g)}`}
                className={`block rounded-lg border px-3 py-2 hover:border-gray-400 ${g.supplier_id ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}`}>
                <div className="font-medium text-gray-900 text-sm">{g.supplier_name}</div>
                <div className="text-xs text-gray-500">
                  {g.lines.length} {g.lines.length === 1 ? 'vare' : 'varer'} · {g.orders.length} {g.orders.length === 1 ? 'ordre' : 'ordrer'}
                  {g.total > 0 && <> · {kr0(g.total)}</>}
                  {below && <span className="text-amber-700"> · under min. {kr0(o.min_order!)}</span>}
                  {o.cutoff && <> · frist {o.cutoff}</>}
                </div>
              </a>
            )
          })}
        </nav>
      )}

      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Skal bestilles</h3>
        <nav className="flex gap-1 text-sm">
          <a href="/admin/purchasing" className={`px-3 py-1 rounded-md border ${!byOrder ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>Pr. vare</a>
          <a href="/admin/purchasing?visning=ordrer" className={`px-3 py-1 rounded-md border ${byOrder ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
            title="Varerne fordelt på ordrer med kundens adresse — til bestilling med levering direkte til kunden">Pr. ordre</a>
        </nav>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Kunne ikke hente indkøbslisten: {error}</p>}
      {!error && lineCount === 0 && (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          Intet skal bestilles — alt på åbne ordrer er på eget lager eller allerede bestilt.
        </div>
      )}

      <div className="space-y-6">
        {groups.map(g => (
          <section key={anchor(g)} id={anchor(g)} className={`scroll-mt-4 bg-white rounded-lg border overflow-hidden ${g.supplier_id ? 'border-gray-200' : 'border-red-200'}`}>
            <header className={`px-4 py-3 flex items-center justify-between gap-4 flex-wrap border-b ${g.supplier_id ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div>
                <h3 className="font-semibold text-gray-900">{g.supplier_name}</h3>
                <p className="text-xs text-gray-500">
                  {g.lines.length} {g.lines.length === 1 ? 'vare' : 'varer'} · {g.orders.length} {g.orders.length === 1 ? 'ordre' : 'ordrer'}
                  {g.total > 0 && <> · indkøb ca. {kr(g.total)} ekskl. moms</>}
                  {!g.supplier_id && ' · produkterne har ingen aktiv leverandør — tilknyt en under Produkter'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {g.supplier_id && (
                  <CopyButton text={portalPaste(g)} label="Kopiér varenr. + antal"
                    title="Til leverandørens hurtigbestilling: ét varenummer og antal pr. linje (tab-separeret)"
                    className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium" />
                )}
                <a href={`/api/purchasing/export?supplier=${g.supplier_id ?? 'none'}`}
                  className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium">
                  Hent CSV
                </a>
              </div>
            </header>
            {g.supplier_id && <OrderingInfo g={g} />}
            {byOrder ? (
              g.orders.length > 0
                ? g.orders.map(o => <OrderCard key={o.order_id} o={o} supplierId={g.supplier_id} />)
                : <p className="px-4 py-3 text-sm text-gray-400">Varerne kunne ikke knyttes til en ordre.</p>
            ) : (
              <LinesForm g={g} />
            )}
          </section>
        ))}
      </div>

      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-10 mb-3">Bestilt — afventer levering</h3>
      {batches.length === 0 ? (
        <p className="text-sm text-gray-400">Ingen åbne bestillinger.</p>
      ) : (
        <div className="space-y-3">
          {batches.map(b => (
            <section key={b.ref} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <header className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm">
                  <span className="font-semibold text-gray-900">{b.supplier_name}</span>
                  <span className="text-gray-500"> · bestilt {fmtDate(b.at)} af {b.by}</span>
                  {b.supplier_ref && <span className="ml-2 text-gray-700">· deres ordrenr. <span className="font-mono">{b.supplier_ref}</span></span>}
                  <span className="ml-2 font-mono text-xs text-gray-400">{b.ref}</span>
                </div>
                <form action={undo}>
                  <input type="hidden" name="ref" value={b.ref} />
                  <ConfirmSubmit
                    label="Fortryd"
                    pendingLabel="Fortryder…"
                    confirmText={`Fortryd bestilling ${b.ref}? Varerne kommer tilbage under "Skal bestilles".`}
                    className="px-2.5 py-1 text-xs border border-gray-300 text-gray-600 rounded-md hover:bg-white disabled:opacity-40" />
                </form>
              </header>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {b.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-4 py-1.5 text-gray-800">{l.name}<span className="ml-2 font-mono text-xs text-gray-400">{l.sku}</span></td>
                      <td className="px-4 py-1.5 text-right tabular-nums w-20">{l.qty} stk</td>
                      <td className="px-4 py-1.5 text-xs w-32">{l.order_number && <a href={orderLink(l.order_number)} className="text-blue-600 hover:underline">{l.order_number}</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
