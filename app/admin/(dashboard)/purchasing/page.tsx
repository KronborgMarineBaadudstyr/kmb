import { buildPurchaseList, type PurchaseLine } from '@/lib/purchasing'

export const dynamic = 'force-dynamic'

const kr = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'

const REASON: Record<NonNullable<PurchaseLine['reason']>, string> = {
  preferred: 'Foretrukken',
  cheapest:  'Laveste pris',
  only:      'Eneste',
}

export default async function PurchasingPage() {
  const { groups, error } = await buildPurchaseList()
  const lineCount = groups.reduce((s, g) => s + g.lines.length, 0)

  return (
    <div className="p-8 max-w-6xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Indkøb</h2>
      <p className="text-sm text-gray-500 mb-6">
        Varer på åbne ordrer, der ikke kunne tages fra eget lager. Hver vare er placeret hos den foretrukne
        leverandør (prioritet 1), ellers hos den med laveste indkøbspris. Listen opdateres løbende — en vare
        forsvinder, når ordren er afsluttet eller annulleret.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">Kunne ikke hente indkøbslisten: {error}</p>}
      {!error && lineCount === 0 && (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          Intet skal bestilles — alle åbne ordrer kan leveres fra eget lager.
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
              <a href={`/api/purchasing/export?supplier=${g.supplier_id ?? 'none'}`}
                className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 font-medium">
                Hent CSV
              </a>
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
    </div>
  )
}
