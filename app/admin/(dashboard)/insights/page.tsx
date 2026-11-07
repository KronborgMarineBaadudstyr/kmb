import Link from 'next/link'
import * as A from '@/lib/ai/analytics'

export const dynamic = 'force-dynamic'

const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december']
const kr  = (n: unknown) => n == null ? '—' : Number(n).toLocaleString('da-DK', { maximumFractionDigits: 0 }) + ' kr'
const pct = (n: unknown) => n == null ? '—' : Math.round(Number(n) * 100) + ' %'
const ask = (q: string) => `/admin/ai?q=${encodeURIComponent(q)}`

async function safe<T>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try { return { data: await p, error: null } } catch (e) { return { data: null, error: e instanceof Error ? e.message : String(e) } }
}

function Card({ title, sub, question, children }: { title: string; sub?: string; question?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {question && (
          <Link href={ask(question)} className="text-xs text-blue-600 hover:underline whitespace-nowrap shrink-0">Spørg AI →</Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-gray-400">{text}</p>

type Row = Record<string, unknown>

export default async function InsightsPage() {
  const now   = new Date()
  const next  = (now.getMonth() + 1) % 12 + 1
  const from  = new Date(now.getTime() - 90 * 86400_000).toISOString()

  const [cov, top, pairs, peaks, affinity, camp] = await Promise.all([
    safe(A.coverage()),
    safe(A.topProducts(from, now.toISOString(), null, 8) as Promise<Row[]>),
    safe(A.boughtTogether(null, 8, 3) as Promise<Row[]>),
    safe(A.seasonalPeaks(next, 8, 10) as Promise<Row[]>),
    safe(A.categoryAffinity(null, 6) as Promise<Row[]>),
    safe(A.campaigns(5) as Promise<Row[]>),
  ])

  const c = cov.data as Row | null
  const orders = Number(c?.orders ?? 0)
  const thin = orders < 200

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Salgsindsigt</h2>
          <p className="text-sm text-gray-500">Forslag ud fra salgshistorikken. Brug AI-assistenten til at gå i dybden.</p>
        </div>
        <Link href="/admin/ai" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 font-medium">
          Åbn AI-assistent
        </Link>
      </div>

      {cov.error && (
        <p className="mb-6 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">
          Salgsanalysen er ikke klar: {cov.error}. Er migration 058 og 059 kørt?
        </p>
      )}

      {c && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${thin ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-white border-gray-200 text-gray-600'}`}>
          <strong>Datagrundlag:</strong>{' '}
          {orders.toLocaleString('da-DK')} ordrer, {Number(c.customers ?? 0).toLocaleString('da-DK')} kunder,{' '}
          {Number(c.products_sold ?? 0).toLocaleString('da-DK')} forskellige produkter solgt
          {c.first_order ? <> fra {new Date(String(c.first_order)).toLocaleDateString('da-DK')}</> : null}
          {' · '}{Number(c.price_changes ?? 0)} registrerede prisændringer.
          {thin && <> Det er for lidt til sikre mønstre — analyserne bliver bedre, når de gamle ordrer er importeret.</>}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Pakkekandidater" sub="Varer der ofte købes i samme ordre (mindst 3 gange)"
          question="Hvilke af de varer, der ofte købes sammen, egner sig til et pakketilbud, og hvad bør pakken koste?">
          {pairs.data?.length ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400"><tr><th className="text-left font-normal pb-1">Par</th><th className="text-right font-normal pb-1">Sammen</th><th className="text-right font-normal pb-1">Lift</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {pairs.data.map((p, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2 text-gray-800">{String(p.name_a)} <span className="text-gray-400">+</span> {String(p.name_b)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{String(p.orders_together)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${Number(p.lift) >= 2 ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{Number(p.lift).toLocaleString('da-DK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty text={pairs.error ? 'Kunne ikke hentes.' : 'Ingen varer er købt sammen mindst 3 gange endnu.'} />}
        </Card>

        <Card title={`Op til ${MONTHS[next - 1]}`} sub="Produkter med en stor del af årssalget i næste måned"
          question={`Hvilke produkter bør vi forberede lager og kampagner på til ${MONTHS[next - 1]}?`}>
          {peaks.data?.filter(p => Number(p.share) >= 0.15).length ? (
            <ul className="text-sm divide-y divide-gray-50">
              {peaks.data.filter(p => Number(p.share) >= 0.15).map((p, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-3">
                  <Link href={`/admin/products/${p.product_id}`} className="text-gray-800 hover:text-blue-600 truncate">{String(p.name)}</Link>
                  <span className="text-gray-500 whitespace-nowrap tabular-nums">{pct(p.share)} af årets salg</span>
                </li>
              ))}
            </ul>
          ) : <Empty text={peaks.error ? 'Kunne ikke hentes.' : 'Ingen tydelige sæsonvarer for næste måned i data endnu.'} />}
        </Card>

        <Card title="Topsælgere" sub="Seneste 90 dage efter omsætning (inkl. moms)"
          question="Hvordan har vores topsælgere udviklet sig, og er der nogen hvor prisen bør justeres?">
          {top.data?.length ? (
            <ul className="text-sm divide-y divide-gray-50">
              {top.data.map((p, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-3">
                  <Link href={`/admin/products/${p.product_id}`} className="text-gray-800 hover:text-blue-600 truncate">{String(p.name)}</Link>
                  <span className="text-gray-500 whitespace-nowrap tabular-nums">{String(p.qty)} stk · {kr(p.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty text={top.error ? 'Kunne ikke hentes.' : 'Intet salg de seneste 90 dage.'} />}
        </Card>

        <Card title="Kunder der køber … køber også" sub="Kategorier der købes af de samme kunder"
          question="Hvilke kategorier køber vores kunder på tværs af, og hvordan kan vi bruge det til mersalg?">
          {affinity.data?.length ? (
            <ul className="text-sm divide-y divide-gray-50">
              {affinity.data.map((a, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-3">
                  <span className="text-gray-800">{String(a.category_a)} <span className="text-gray-400">↔</span> {String(a.category_b)}</span>
                  <span className="text-gray-500 whitespace-nowrap tabular-nums">{String(a.customers_both)} kunder · lift {Number(a.lift).toLocaleString('da-DK')}</span>
                </li>
              ))}
            </ul>
          ) : <Empty text={affinity.error ? 'Kunne ikke hentes.' : 'For få kunder med køb i flere kategorier endnu.'} />}
        </Card>

        <Card title="Kampagner" sub="Salg under kampagnen vs. lige så lang periode før"
          question="Hvilke af vores kampagner virkede, og hvad kan vi lære til den næste?">
          {camp.data?.length ? (
            <ul className="text-sm divide-y divide-gray-50">
              {camp.data.map((k, i) => {
                const before = Number(k.qty_before), during = Number(k.qty_during)
                const change = before > 0 ? Math.round((during / before - 1) * 100) : null
                return (
                  <li key={i} className="py-1.5 flex justify-between gap-3">
                    <span className="text-gray-800 truncate">{String(k.name)}</span>
                    <span className="text-gray-500 whitespace-nowrap tabular-nums">
                      {before} → {during} stk
                      {change != null && <span className={change >= 0 ? 'text-green-700' : 'text-red-600'}> ({change >= 0 ? '+' : ''}{change} %)</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : <Empty text={camp.error ? 'Kunne ikke hentes.' : 'Ingen kampagner med startdato endnu.'} />}
        </Card>

        <Card title="Prissætning" sub="Prisfølsomhed måles fra prishistorikken, der logges fra nu af"
          question="Hvilke produkter har vi data nok på til at vurdere en prisændring, og hvad ville du foreslå?">
          <p className="text-sm text-gray-600">
            Spørg AI-assistenten om konkrete produkter, fx hvad der sker med salg og dækningsbidrag ved en anden pris
            eller et pakketilbud. Den regner på jeres faktiske salg og fortæller, hvor sikkert svaret er.
          </p>
        </Card>
      </div>
    </div>
  )
}
