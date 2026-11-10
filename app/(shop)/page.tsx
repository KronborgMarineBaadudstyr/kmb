import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { ProductCard } from './_product-card'
import { BOATS, getBoatCategories, type BoatSlug } from '@/lib/shop/boat-types'
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shop/shipping'

export const dynamic = 'force-dynamic'

async function getHomeData() {
  const supabase = createServiceClient()

  // Total product count (all non-archived/rejected)
  const { count: totalCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')

  // Indgange: Sejlbåd / Motorbåd med antal kategorier
  const boats = await Promise.all((Object.keys(BOATS) as BoatSlug[]).map(async slug => {
    const cats = await getBoatCategories(slug)
    return { slug, ...BOATS[slug], categories: cats.length, top: cats.slice(0, 4).map(c => c.name) }
  }))

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

  const total = totalCount ?? 0

  return { boats, newest: newest ?? [], priced: priced ?? [], total }
}

export default async function HomePage() {
  const { boats, newest, priced, total } = await getHomeData()

  return (
    <>
      {/* Hero */}
      <div className="ls-hero">
        {/* Dekorativ geometri */}
        <div className="ls-hero-deco" aria-hidden="true">
          <div className="ls-hero-deco-circle ls-hero-deco-circle--1" />
          <div className="ls-hero-deco-circle ls-hero-deco-circle--2" />
          <div className="ls-hero-deco-stripe" />
        </div>

        <div className="ls-hero-content">
          <div className="ls-hero-kicker">
            <span className="ls-hero-kicker-dot" />
            Marine bådudstyr
          </div>
          <h1>Udrust din båd<br /><em>— til alle eventyr</em></h1>
          <p>
            {total.toLocaleString('da-DK')} produkter fra de bedste brands.
            Til sejl-, motor- og fritidsbåde.
          </p>
          <div className="ls-hero-actions">
            <Link href="/kategorier" className="ls-btn-primary">Se alle kategorier</Link>
            <Link href="/soeg" className="ls-btn-ghost">Søg i kataloget</Link>
          </div>
          <div className="ls-hero-usps">
            <span>✓ Gratis fragt fra {FREE_SHIPPING_THRESHOLD} kr</span>
            <span>✓ Hurtig levering</span>
            <span>✓ 14 dages fortrydelsesret</span>
          </div>
        </div>
      </div>

      {/* Vælg bådtype — derunder kategorierne */}
      <div className="ls-section-header">
        <h2>Hvilken båd har du?</h2>
        <Link href="/kategorier">Alle kategorier</Link>
      </div>
      <div className="ls-boatgrid">
        {boats.map(b => (
          <Link key={b.slug} href={`/${b.slug}`} className={`ls-boattile ls-boattile--${b.slug}`}>
            <div className="ls-boattile-icon" aria-hidden="true">{b.icon}</div>
            <div className="ls-boattile-body">
              <div className="ls-boattile-name">{b.label}</div>
              <div className="ls-boattile-tagline">{b.tagline}</div>
              {b.top.length > 0 && <div className="ls-boattile-cats">{b.top.join(' · ')}{b.categories > b.top.length ? ' …' : ''}</div>}
              <div className="ls-boattile-count">{b.categories} kategorier →</div>
            </div>
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
            <h2>Populære produkter</h2>
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
