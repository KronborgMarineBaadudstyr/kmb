import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { ProductCard } from './_product-card'

export const dynamic = 'force-dynamic'

const CATEGORY_ICONS: Record<string, string> = {
  'Sikkerhed':             '🛡️',
  'Tovværk & anker':       '⚓',
  'Elektronik':            '📡',
  'Rig & dæk':             '⛵',
  'Bådpleje':              '🪣',
  'Motor & olie':          '⚙️',
  'El & installationer':   '💡',
  'Vand & sanitet':        '💧',
  'Komfort ombord':        '☕',
  'Sejlertøj':             '🧥',
  'Vandsport':             '🏄',
  'Gaveartikler':          '🎁',
  'Navigation':            '🧭',
  'Anker':                 '⚓',
}

function catIcon(name: string) {
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return icon
  }
  return '📦'
}

function slugify(s: string) {
  return s.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function getHomeData() {
  const supabase = createServiceClient()

  // Top categories by product count
  const { data: allProds } = await supabase
    .from('products')
    .select('categories')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .not('categories', 'is', null)

  const counts = new Map<string, number>()
  for (const row of allProds ?? []) {
    for (const cat of (row.categories as string[] ?? [])) {
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
  }
  const topCategories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count, slug: slugify(name), icon: catIcon(name) }))

  // Newest products
  const { data: newest } = await supabase
    .from('products')
    .select('id, name, categories, sales_price, brand, product_images(url, is_primary)')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .order('created_at', { ascending: false })
    .limit(12)

  // Products with price (deals-ish)
  const { data: priced } = await supabase
    .from('products')
    .select('id, name, categories, sales_price, brand, product_images(url, is_primary)')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .not('sales_price', 'is', null)
    .order('sales_price', { ascending: true })
    .limit(12)

  const total = allProds?.length ?? 0

  return { topCategories, newest: newest ?? [], priced: priced ?? [], total }
}

export default async function HomePage() {
  const { topCategories, newest, priced, total } = await getHomeData()

  return (
    <>
      {/* Hero */}
      <div className="ls-hero">
        <div className="ls-hero-kicker">Marine bådudstyr</div>
        <h1>Udrust din båd<br />— til alle eventyr</h1>
        <p>
          {total.toLocaleString('da-DK')} produkter fra de bedste brands.
          Sejl-, motor- og fritidsbåde.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/kategorier" className="ls-btn-primary">Se alle kategorier</Link>
          <Link href="/soeg" className="ls-btn-ghost">Søg i kataloget</Link>
        </div>
      </div>

      {/* Categories */}
      <div className="ls-section-header">
        <h2>Kategorier</h2>
        <Link href="/kategorier">Se alle</Link>
      </div>
      <div className="ls-catgrid">
        {topCategories.map(c => (
          <Link key={c.slug} href={`/kategorier/${c.slug}`} className="ls-cattile">
            <div className="ls-cattile-icon">{c.icon}</div>
            <div className="ls-cattile-name">{c.name}</div>
            <div className="ls-cattile-count">{c.count.toLocaleString('da-DK')} varer</div>
          </Link>
        ))}
      </div>

      {/* Newest */}
      {newest.length > 0 && (
        <>
          <div className="ls-section-header">
            <h2>Nyeste produkter</h2>
            <Link href="/kategorier">Se alle</Link>
          </div>
          <div className="ls-rail">
            {newest.map(p => (
              <ProductCard key={p.id} product={p as any} />
            ))}
          </div>
        </>
      )}

      {/* Priced / affordable */}
      {priced.length > 0 && (
        <>
          <div className="ls-section-header" style={{ marginTop: 8 }}>
            <h2>Fra kr 0 og op</h2>
            <Link href="/soeg">Udforsk</Link>
          </div>
          <div className="ls-rail">
            {priced.map(p => (
              <ProductCard key={p.id} product={p as any} />
            ))}
          </div>
        </>
      )}

      <div style={{ height: 48 }} />
    </>
  )
}
