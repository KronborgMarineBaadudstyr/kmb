import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { buildPurchaseList, buildOrderedList, markSupplierOrdered, undoOrdered, type PurchaseLine } from '@/lib/purchasing'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { ConfirmSubmit } from '../_confirm-submit'

export const dynamic = 'force-dynamic'

const kr = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'

const REASON: Record<NonNullable<PurchaseLine['reason']>, string> = {
  preferred: 'Foretrukken',
  cheapest:  'Laveste pris',
  only:      'Eneste',
}

async function markOrdered(formData: FormData) {
  'use server'
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/login')
  const supplierId = String(formData.get('supplier') ?? '')
  const r = await markSupplierOrdered(supplierId, admin.email)
  revalidatePath('/admin/purchasing')
  if ('error' in r) redirect(`/admin/purchasing?err=${encodeURIComponent(r.error)}`)
  redirect(`/admin/purchasing?ordered=${encodeURIComponent(r.ref)}${r.failed ? `&failed=${r.failed}` : ''}`)
}

async function undo(formData: FormData) {
  'use server'
  if (!(await getCurrentAdmin())) redirect('/login')
  const ref = String(formData.get('ref') ?? '')
  const r = await undoOrdered(ref)
  revalidatePath('/admin/purchasing')
  redirect(`/admin/purchasing?undone=${encodeURIComponent(ref)}${r.failed ? `&failed=${r.failed}` : ''}`)
}

const fmtDate = (d: string) => new Date(d).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default async function PurchasingPage({
  searchParams,
}: { searchParams: Promise<{ ordered?: string; undone?: string; failed?: string; err?: string }> }) {
  const sp = await searchParams
  const [{ groups, error }, { batches }] = await Promise.all([buildPurchaseList(), buildOrderedList()])
  const lineCount = groups.reduce((s, g) => s + g.lines.length, 0)

  return (
    <div className="p-8 max-w-6xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Indkøb</h2>
      <p className="text-sm text-gray-500 mb-6">
        Varer på åbne ordrer, der ikke kunne tages fra eget lager. Hver vare er placeret hos den foretrukne
        leverandør (prioritet 1), ellers hos den med laveste indkøbspris. Når I har bestilt, så tryk
        &quot;Markér som bestilt&quot; — varerne flyttes til &quot;Bestilt&quot; og bestilles ikke igen.
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
      {sp.err && <p className="mb-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">{sp.err}</p>}

      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Skal bestilles</h3>

      {error && <p className="mb-4 text-sm text-red-600">Kunne ikke hente indkøbslisten: {error}</p>}
      {!error && lineCount === 0 && (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          Intet skal bestilles — alt på åbne ordrer er på eget lager eller allerede bestilt.
        </div>
      )}

      <div className="space-y-6">
        {groups.map(g => (
          <section key={g.supplier_id ?? 'none'} className={`bg-white rounded-lg border overflow-hidden ${g.supplier_id ? 'border-gray-200' : 'border-red-200'}`}>
            <header className={`px-4 py-3 flex items-center justify-between gap-4 flex-wrap border-b ${g.supplier_id ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div>
                <h3 className="font-semibold text-gray-900">{g.supplier_name}</h3>
                <p className="text-xs text-gray-500">
                  {g.lines.length} {g.lines.length === 1 ? 'vare' : 'varer'}
                  {g.total > 0 && <> · indkøb ca. {kr(g.total)} ekskl. moms</>}
                  {g.contact_email && <> · <a href={`mailto:${g.contact_email}`} className="text-blue-600">{g.contact_email}</a></>}
                  {!g.supplier_id && ' · produkterne har ingen aktiv leverandør — tilknyt en under Produkter'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/purchasing/export?supplier=${g.supplier_id ?? 'none'}`}
                  className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 font-medium">
                  Hent CSV
                </a>
                {g.supplier_id && (
                  <form action={markOrdered}>
                    <input type="hidden" name="supplier" value={g.supplier_id} />
                    <ConfirmSubmit
                      label="Markér som bestilt"
                      pendingLabel="Markerer…"
                      confirmText={`Markér ${g.lines.length} ${g.lines.length === 1 ? 'vare' : 'varer'} som bestilt hos ${g.supplier_name}?`}
                      className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium disabled:opacity-40" />
                  </form>
                )}
              </div>
            </header>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wide">
                <tr className="border-b border-gray-100">
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
                    <tr key={l.key}>
                      <td className="px-4 py-2">
                        <a href={`/admin/products/${l.product_id}`} className="text-gray-900 hover:text-blue-600">{l.name}</a>
                        <div className="text-xs text-gray-400 font-mono">
                          {l.sku}{l.ean ? ` · ${l.ean}` : ''}
                          {l.reason && g.supplier_id && <span className="font-sans ml-2 text-gray-400">· {REASON[l.reason]}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">{l.supplier_sku ?? '—'}</td>
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
                      <td className="px-4 py-2 text-xs text-gray-500">{l.orders.join(', ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
                      <td className="px-4 py-1.5 text-xs text-gray-500 w-32">{l.order_number}</td>
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
