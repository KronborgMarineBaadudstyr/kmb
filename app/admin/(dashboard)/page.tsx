import { createServiceClient } from '@/lib/supabase/server'

async function getStats() {
  const supabase = createServiceClient()
  const [products, shopUsers, suppliers, orders] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('shop_users').select('*', { count: 'exact', head: true }),
    supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
  ])
  return {
    productCount:  products.count  ?? 0,
    shopUserCount: shopUsers.count ?? 0,
    supplierCount: suppliers.count ?? 0,
    orderCount:    orders.count    ?? 0,
  }
}

const STEPS: { label: string; done: boolean; group?: string; skipped?: boolean }[] = [
  // ── Fundament ──
  { group: 'Fundament',        label: 'Next.js projekt oprettet og konfigureret',         done: true  },
  { label: 'Supabase projekt oprettet og forbundet',                                       done: true  },
  { label: 'Database tabeller oprettet (13 tabeller + views)',                             done: true  },
  { label: 'GitHub repo oprettet og kode pushet',                                         done: true  },
  { label: 'Password-beskyttet dashboard (middleware + cookie)',                           done: true  },
  { label: 'Deploy til Vercel',                                                             done: true  },

  // ── Produktdata ──
  { group: 'Produktdata',      label: 'Engangsimport af eksisterende produkter (37.011)',  done: true  },
  { label: 'Produktliste med kolonne-vælger, filtrering og sortering',                    done: true  },
  { label: 'Produktredigering inkl. billeder, varianter og variantfamilier',              done: true  },

  // ── Webshop ──
  { group: 'Webshop (LoveSailing.dk)', label: 'Shop-frontend: forside, kategorier, filtre, søgning, produktside', done: true },
  { label: 'Kurv + "Gem kurv" med e-mail-link (shop_users)',                              done: true  },
  { label: 'Checkout + eget betalingssystem',                                             done: false },
  { label: 'Lagertræk ved salg (webshop + POS)',                                          done: false },

  // ── Leverandører ──
  { group: 'Leverandører',     label: 'Leverandørstyring — opret og konfigurér leverandører', done: true  },
  { label: 'FTP/XML/CSV/XML import fra leverandør (6 leverandører implementeret)',        done: true  },
  { label: 'Sammenlign import med eksisterende Supabase data (staging + needs_review)',   done: true  },
  { label: 'Manuel godkendelsesproces for ændringer (staging review + matching pipeline)', done: true  },

  // ── Ordre & Forsendelse ──
  { group: 'Ordre & Forsendelse', label: 'Ordre-routing motor (optimal leverandørvalg pr. ordre)', done: false },
  { label: 'Ordrepakkeliste — generer plukliste pr. forsendelse',                         done: false },
  { label: 'PDF tilbudsgenerator',                                                        done: false },

  // ── Business Intelligence ──
  { group: 'Business Intelligence', label: 'Produkt prissætningsforslag — salgsoptimering ift. historik og prognoser', done: false },

  // ── POS ──
  { group: 'POS',              label: 'admind POS integration (afventer API docs)',        done: false },
]

export default async function DashboardPage() {
  const { productCount, shopUserCount, supplierCount, orderCount } = await getStats()

  const doneCount = STEPS.filter(s => s.done).length

  const cards = [
    {
      label: 'Produkter i Supabase',
      value: productCount > 0 ? productCount.toLocaleString('da-DK') : '—',
      sub:   productCount > 0 ? 'produkter i masterdatabasen' : 'Ingen produkter endnu',
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
          {STEPS.map((step, i) => (
            <div key={i}>
              {step.group && (
                <p className={`text-xs font-semibold uppercase tracking-wider text-gray-400 ${i > 0 ? 'mt-4' : ''} mb-1.5`}>
                  {step.group}
                </p>
              )}
              <div className="flex items-start gap-3 py-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                  step.done    ? 'bg-green-100 text-green-700' :
                  step.skipped ? 'bg-gray-50 text-gray-300' :
                                 'bg-gray-100 text-gray-400'
                }`}>
                  {step.done ? '✓' : step.skipped ? '–' : ''}
                </div>
                <span className={`text-sm leading-relaxed ${
                  step.done    ? 'text-gray-400 line-through' :
                  step.skipped ? 'text-gray-300 line-through' :
                                 'text-gray-700'
                }`}>
                  {step.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
