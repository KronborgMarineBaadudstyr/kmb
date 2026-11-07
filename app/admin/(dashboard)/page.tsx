import { createServiceClient } from '@/lib/supabase/server'

async function getStats() {
  const supabase = createServiceClient()
  const [products, published, shopUsers, suppliers, orders] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('shop_users').select('*', { count: 'exact', head: true }),
    supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
  ])
  return {
    productCount:   products.count  ?? 0,
    publishedCount: published.count ?? 0,
    shopUserCount:  shopUsers.count ?? 0,
    supplierCount:  suppliers.count ?? 0,
    orderCount:     orders.count    ?? 0,
  }
}

type StepStatus = 'done' | 'progress' | 'waiting' | 'todo'
type Step = { label: string; status: StepStatus; group?: string; note?: string }

// Opdateres når status ændrer sig. note = hvad der mangler / ventes på.
const STEPS: Step[] = [
  // ── Fundament ──
  { group: 'Fundament',        label: 'Next.js, Supabase, GitHub og deploy til Vercel',                    status: 'done' },
  { label: 'Admin-login med e-mail og magic link — ejer/admin-roller',                                      status: 'done' },
  { label: 'Database lukket for offentlig adgang (RLS) + login på alle admin-API\'er',                       status: 'done' },
  { label: 'E-mails fra lovesailing.dk',                                                                     status: 'progress', note: 'midlertidig afsender — domænet skal verificeres i Resend' },

  // ── Produktdata ──
  { group: 'Produktdata',      label: 'Engangsimport af eksisterende produkter (37.011)',                   status: 'done' },
  { label: 'Produktliste med kolonne-vælger, filtrering og sortering',                                      status: 'done' },
  { label: 'Produktredigering inkl. billeder, varianter og variantfamilier',                                status: 'done' },
  { label: 'Levetid og vedligehold på produkter',                                                            status: 'done' },
  { label: 'Kør matching og gennemgå match-grupper',                                                         status: 'progress', note: 'gennemgang i Produkt match' },

  // ── Leverandører & import ──
  { group: 'Leverandører & import', label: 'Leverandørstyring — opret og konfigurér leverandører',         status: 'done' },
  { label: 'Import fra 6 leverandører (FTP/XML/CSV/API) med daglige cron-jobs',                             status: 'done' },
  { label: 'Staging, matching og godkendelse af nye produkter — også som massehandling',                    status: 'done' },

  // ── Webshop ──
  { group: 'Webshop (LoveSailing.dk)', label: 'Shop-frontend: forside, kategorier, filtre, søgning, produktside', status: 'done' },
  { label: 'Kurv + "Gem kurv" med e-mail-link',                                                              status: 'done' },
  { label: 'Kundekonto med login via e-mail-link, ordrehistorik og vedligehold',                            status: 'done' },
  { label: 'Checkout med betal ved afhentning for kendte kunder',                                           status: 'done' },
  { label: 'Online betaling',                                                                                status: 'waiting', note: 'valg af betalingsudbyder' },
  { label: 'Handelsbetingelser-side',                                                                        status: 'waiting', note: 'firmaoplysninger og retur-/reklamationsregler' },
  { label: 'Login med telefonnummer (SMS)',                                                                  status: 'waiting', note: 'valg af SMS-udbyder' },

  // ── Kunder & ordrer ──
  { group: 'Kunder & ordrer',  label: 'Ordreflow: Ny → Klar til afhentning (mail) → Afhentet og betalt',   status: 'done' },
  { label: 'Kundeliste med styring af betal ved afhentning',                                                status: 'done' },
  { label: 'Vedligeholdspåmindelser på e-mail ud fra levetid',                                              status: 'done' },
  { label: 'Import af gamle ordrer (e-mail/telefon som kunde-id)',                                          status: 'waiting', note: 'eksempel på eksportfil' },

  // ── Lager & indkøb ──
  { group: 'Lager & indkøb',   label: 'Eget lager-justering med årsagskode og log',                         status: 'done' },
  { label: 'Lagertræk ved salg',                                                                             status: 'progress', note: 'webshop virker — POS afventer admind' },
  { label: 'Indkøbsliste pr. leverandør med CSV og markering af bestilte varer',                                                           status: 'done' },
  { label: 'Automatiske bestillinger til leverandører',                                                     status: 'waiting', note: 'afklaring af hvordan hver leverandør modtager bestillinger' },

  // ── Ordre & forsendelse ──
  { group: 'Ordre & forsendelse', label: 'Ordre-routing (optimal leverandør pr. vare)',                    status: 'progress', note: 'leverandørvalg findes i indkøbslisten' },
  { label: 'Pakkeliste — plukliste pr. forsendelse',                                                        status: 'todo' },
  { label: 'PDF-tilbudsgenerator',                                                                           status: 'todo' },

  // ── Business Intelligence ──
  { group: 'Salg & AI',        label: 'Prishistorik (logges automatisk)',                                    status: 'done' },
  { label: 'Salgsindsigt: pakkekandidater, sæson, topsælgere, kategorier, kampagner',                   status: 'done' },
  { label: 'AI-assistent til salg, prissætning og kampagner (Claude)',                                  status: 'done' },
  { label: 'Pålidelige analyser og prisforslag',                                                         status: 'waiting', note: 'mere salgshistorik — import af gamle ordrer' },
  { label: 'Egen AI-nøgle til butikken i admin',                                                         status: 'todo' },

  // ── POS ──
  { group: 'POS',              label: 'admind POS-integration',                                              status: 'waiting', note: 'API-dokumentation fra admind' },
]

const STATUS_STYLE: Record<StepStatus, { icon: string; dot: string; text: string; badge?: string }> = {
  done:     { icon: '✓', dot: 'bg-green-100 text-green-700', text: 'text-gray-400 line-through' },
  progress: { icon: '◐', dot: 'bg-amber-100 text-amber-700', text: 'text-gray-800', badge: 'I gang' },
  waiting:  { icon: '⏸', dot: 'bg-gray-100 text-gray-500',  text: 'text-gray-600', badge: 'Afventer' },
  todo:     { icon: '',  dot: 'bg-gray-100 text-gray-400',  text: 'text-gray-700' },
}

export default async function DashboardPage() {
  const { productCount, publishedCount, shopUserCount, supplierCount, orderCount } = await getStats()

  const count = (st: StepStatus) => STEPS.filter(s => s.status === st).length
  const doneCount = count('done')

  const cards = [
    {
      label: 'Produkter i alt',
      value: productCount > 0 ? productCount.toLocaleString('da-DK') : '—',
      sub:   productCount > 0 ? `${publishedCount.toLocaleString('da-DK')} publicerede` : 'Ingen produkter endnu',
      color: productCount > 0 ? 'text-gray-900' : 'text-gray-400',
    },
    {
      label: 'Aktive leverandører',
      value: supplierCount > 0 ? supplierCount.toLocaleString('da-DK') : '—',
      sub:   supplierCount > 0 ? 'leverandører konfigureret' : 'Ingen leverandører oprettet endnu',
      color: supplierCount > 0 ? 'text-gray-900' : 'text-gray-400',
    },
    {
      label: 'Shop-kunder',
      value: shopUserCount > 0 ? shopUserCount.toLocaleString('da-DK') : '—',
      sub:   shopUserCount > 0 ? 'e-mails i shop_users' : 'Ingen endnu',
      color: shopUserCount > 0 ? 'text-gray-900' : 'text-gray-400',
    },
    {
      label: 'Ordre i systemet',
      value: orderCount > 0 ? orderCount.toLocaleString('da-DK') : '—',
      sub:   orderCount > 0 ? 'ordrer i systemet' : 'Afventer checkout',
      color: orderCount > 0 ? 'text-gray-900' : 'text-gray-400',
    },
  ]

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h2>
      <p className="text-gray-500 mb-8">Oversigt over Kronborg Marine Bådudstyr middleware system</p>

      {/* Status kort */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-5">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{card.label}</p>
            <p className={`text-3xl font-bold mt-2 ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Opsætningsstatus */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Opsætningsstatus</h3>
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-green-700">{doneCount}</span>
            <span className="text-gray-400"> / {STEPS.length} fuldført</span>
            <span className="text-gray-300"> · </span>
            <span className="text-amber-700">{count('progress')} i gang</span>
            <span className="text-gray-300"> · </span>
            <span className="text-gray-500">{count('waiting')} afventer</span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all"
            style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="space-y-1">
          {STEPS.map((step, i) => {
            const st = STATUS_STYLE[step.status]
            return (
            <div key={i}>
              {step.group && (
                <p className={`text-xs font-semibold uppercase tracking-wider text-gray-400 ${i > 0 ? 'mt-4' : ''} mb-1.5`}>
                  {step.group}
                </p>
              )}
              <div className="flex items-start gap-3 py-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${st.dot}`}>
                  {st.icon}
                </div>
                <span className="text-sm leading-relaxed">
                  <span className={st.text}>{step.label}</span>
                  {st.badge && (
                    <span className={`ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded ${
                      step.status === 'progress' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}>{st.badge}</span>
                  )}
                  {step.note && <span className="ml-2 text-xs text-gray-400">{step.note}</span>}
                </span>
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
