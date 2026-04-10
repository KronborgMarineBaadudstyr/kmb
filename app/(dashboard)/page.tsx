import { createServiceClient } from '@/lib/supabase/server'

async function getStats() {
  const supabase = createServiceClient()
  const [products, wooLinked, suppliers, orders] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).not('woo_product_id', 'is', null),
    supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
  ])
  return {
    productCount:  products.count  ?? 0,
    wooCount:      wooLinked.count ?? 0,
    supplierCount: suppliers.count ?? 0,
    orderCount:    orders.count    ?? 0,
  }
}

const STEPS = [
  { label: 'Next.js projekt oprettet og konfigureret',          done: true  },
  { label: 'Supabase projekt oprettet og forbundet',            done: true  },
  { label: 'Database tabeller oprettet (13 tabeller + views)',  done: true  },
  { label: 'WooCommerce API forbundet (37.011 produkter)',       done: true  },
  { label: 'WooCommerce → Supabase initial import kørt',        done: true  },
  { label: 'Produktliste med kolonne-vælger og filtrering',     done: true  },
  { label: 'Produkt detaljevisning med alle felter',            done: true  },
  { label: 'Password-beskyttet dashboard',                      done: true  },
  { label: 'Deploy til Vercel (GitHub → Vercel)',               done: false },
  { label: 'Leverandørstyring — FTP/XML/Excel import',          done: false },
  { label: 'Supabase → WooCommerce sync (publicér produkter)',  done: false },
  { label: 'Webhook: ordre → lagerreservation',                 done: false },
  { label: 'Ordre-routing og forsendelsesoptimering',           done: false },
  { label: 'admind POS integration',                            done: false },
]

export default async function DashboardPage() {
  const { productCount, wooCount, supplierCount, orderCount } = await getStats()

  const doneCount = STEPS.filter(s => s.done).length

  const cards = [
    {
      label: 'Produkter i Supabase',
      value: productCount > 0 ? productCount.toLocaleString('da-DK') : '—',
      sub:   productCount > 0 ? `${wooCount.toLocaleString('da-DK')} linket til WooCommerce` : 'Kør WooCommerce import',
      color: productCount > 0 ? 'text-gray-900' : 'text-gray-400',
    },
    {
      label: 'Aktive leverandører',
      value: supplierCount > 0 ? supplierCount.toLocaleString('da-DK') : '—',
      sub:   supplierCount > 0 ? 'leverandører konfigureret' : 'Ingen leverandører oprettet endnu',
      color: supplierCount > 0 ? 'text-gray-900' : 'text-gray-400',
    },
    {
      label: 'Woo-synkede produkter',
      value: wooCount > 0 ? wooCount.toLocaleString('da-DK') : '—',
      sub:   wooCount > 0 ? 'har woo_product_id' : 'Afventer import',
      color: wooCount > 0 ? 'text-gray-900' : 'text-gray-400',
    },
    {
      label: 'Ordre i systemet',
      value: orderCount > 0 ? orderCount.toLocaleString('da-DK') : '—',
      sub:   orderCount > 0 ? 'ordre modtaget via webhook' : 'Afventer webhook opsætning',
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

        <div className="space-y-2.5">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                step.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {step.done ? '✓' : ''}
              </div>
              <span className={`text-sm leading-relaxed ${
                step.done ? 'text-gray-400 line-through' : 'text-gray-700'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
