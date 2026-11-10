import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ProductCard } from '../../_product-card'
import { CategoryFilters } from './_filters'
import { Suspense } from 'react'
import { getCategoryCounts, slugify } from '@/lib/shop/categories'
import { GET as getProducts } from '@/app/api/products/route'
import { BOATS, isBoatSlug, type BoatSlug } from '@/lib/shop/boat-types'

export const dynamic = 'force-dynamic'

function deslugify(slug: string) {
  return slug
    .replace(/ae/g, 'æ').replace(/oe/g, 'ø').replace(/aa/g, 'å')
    .replace(/-/g, ' ')
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: deslugify(slug).replace(/\b\w/g, c => c.toUpperCase()) }
}

const PAGE_SIZE = 24

type ApiProduct = {
  id: string
  name: string
  brand?: string | null
  sales_price?: number | null
  categories?: string[]
  primary_image_url?: string | null
}

async function fetchProducts(opts: {
  category:  string
  sort:      string
  page:      number
  brand?:    string
  inStock?:  boolean
  minPrice?: string
  maxPrice?: string
  boat?:     BoatSlug | null
}) {
  const [sortCol, sortDir] = opts.sort === 'price_asc'  ? ['sales_price', 'asc']  :
                             opts.sort === 'price_desc' ? ['sales_price', 'desc'] :
                             opts.sort === 'name_desc'  ? ['name',        'desc'] :
                                                          ['name',        'asc']

  const params = new URLSearchParams({
    category: opts.category,
    sort:     sortCol,
    order:    sortDir,
    page:     String(opts.page),
    per_page: String(PAGE_SIZE),
    shop:     '1',
  })
  if (opts.brand)    params.set('brand', opts.brand)
  if (opts.inStock)  params.set('in_stock', '1')
  if (opts.minPrice) params.set('min_price', opts.minPrice)
  if (opts.maxPrice) params.set('max_price', opts.maxPrice)
  if (opts.boat)     params.set('boat_type', BOATS[opts.boat].type)

  // Kalder API'ets handler direkte i samme proces (samme logik, intet ekstra HTTP-hop/koldstart)
  const res = await getProducts(new Request(`http://internal/api/products?${params.toString()}`))
  if (!res.ok) return { products: [], total: 0 }
  const json = await res.json()
  return {
    products: (json.data ?? []) as ApiProduct[],
    total:    (json.total ?? 0) as number,
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    sort?:      string
    page?:      string
    brand?:     string
    in_stock?:  string
    min_price?: string
    max_price?: string
    baad?:      string
  }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const sort     = sp.sort      ?? 'name_asc'
  const page     = Math.max(1, parseInt(sp.page ?? '1'))
  const brand    = sp.brand     ?? ''
  const inStock  = sp.in_stock  === '1'
  const minPrice = sp.min_price ?? ''
  const maxPrice = sp.max_price ?? ''
  const boat     = isBoatSlug(sp.baad) ? sp.baad : null   // kom fra Sejlbåd / Motorbåd

  const supabase = createServiceClient()

  // Find kategorinavnet ud fra slug (ét kald via product_category_counts())
  const matchedCat = (await getCategoryCounts()).find(c => slugify(c.name) === slug)?.name

  if (!matchedCat) {
    return (
      <div className="ls-empty" style={{ paddingTop: 80 }}>
        <div className="ls-empty-icon">🔍</div>
        <h3>Kategori ikke fundet</h3>
        <p><Link href="/kategorier">← Alle kategorier</Link></p>
      </div>
    )
  }

  // Beskrivelse, produkter, brands og prisinterval hentes samtidig
  const [catInfo, { products, total }, { data: brandRows }, { data: priceRange }] = await Promise.all([
    supabase
      .from('categories')
      .select('description')
      .eq('name', matchedCat)
      .maybeSingle()
      .then(r => r.data),

    fetchProducts({ category: matchedCat, sort, page, brand: brand || undefined, inStock, minPrice: minPrice || undefined, maxPrice: maxPrice || undefined, boat }),

    // Brands til filter-chips (ufiltreret — viser altid alle brands i kategorien)
    supabase
      .from('products')
      .select('brand')
      .not('status', 'in', '(archived,rejected)')
      .contains('categories', [matchedCat])
      .not('brand', 'is', null),

    // Prisinterval (ufiltreret)
    supabase
      .from('products')
      .select('sales_price')
      .not('status', 'in', '(archived,rejected)')
      .contains('categories', [matchedCat])
      .not('sales_price', 'is', null),
  ])

  const pages = Math.ceil(total / PAGE_SIZE)

  const brands = [...new Set((brandRows ?? []).map(r => r.brand as string))]
    .filter(Boolean)
    .sort()

  const prices    = (priceRange ?? []).map(r => r.sales_price as number).filter(Boolean)
  const globalMin = prices.length ? Math.min(...prices) : 0
  const globalMax = prices.length ? Math.max(...prices) : 0

  // Build URL for pagination (preserves all filters)
  function pageUrl(p: number) {
    const params = new URLSearchParams({ sort, page: String(p) })
    if (brand)    params.set('brand', brand)
    if (inStock)  params.set('in_stock', '1')
    if (minPrice) params.set('min_price', minPrice)
    if (maxPrice) params.set('max_price', maxPrice)
    if (boat)     params.set('baad', boat)
    return `/kategorier/${slug}?${params.toString()}`
  }

  // Map API response to ProductCard shape (API returns primary_image_url, card expects product_images)
  const mappedProducts = products.map(p => ({
    ...p,
    product_images: p.primary_image_url
      ? [{ url: p.primary_image_url, is_primary: true }]
      : [],
  }))

  return (
    <>
      {/* Brødkrumme */}
      <nav className="ls-breadcrumb">
        <Link href="/">Hjem</Link>
        <span>/</span>
        {boat
          ? <Link href={`/${boat}`}>{BOATS[boat].label}</Link>
          : <Link href="/kategorier">Kategorier</Link>}
        <span>/</span>
        <span style={{ color: 'var(--ink)' }}>{matchedCat}</span>
      </nav>

      {/* Navy kategori-header */}
      <div className="ls-cat-listing-hero">
        <div className="ls-cat-listing-hero-content">
          <div className="ls-hero-kicker">
            <span className="ls-hero-kicker-dot" />
            {boat ? `${BOATS[boat].icon} ${BOATS[boat].label}` : 'Kategori'}
          </div>
          <h1>{matchedCat}</h1>
          {catInfo?.description && (
            <p className="ls-cat-listing-hero-desc">{catInfo.description}</p>
          )}
          <div className="ls-cat-listing-hero-count">{total.toLocaleString('da-DK')} varer</div>
        </div>
      </div>

      {/* Filter-panel */}
      <Suspense fallback={null}>
        <CategoryFilters
          brands={brands}
          minPrice={globalMin}
          maxPrice={globalMax}
          current={{ sort, brand, inStock, minPrice, maxPrice }}
        />
      </Suspense>

      {/* Produktgrid */}
      {mappedProducts.length > 0 ? (
        <div className="ls-prodgrid">
          {mappedProducts.map(p => <ProductCard key={p.id} product={p as any} />)}
        </div>
      ) : (
        <div className="ls-empty">
          <div className="ls-empty-icon">📦</div>
          <h3>Ingen produkter fundet</h3>
          <p>Prøv at fjerne filtrene, eller søg i hele kataloget.</p>
          <div className="ls-empty-actions">
            {(brand || inStock || minPrice || maxPrice) && (
              <Link href={`/kategorier/${slug}${boat ? `?baad=${boat}` : ''}`} className="ls-btn-primary">
                Fjern filtre
              </Link>
            )}
            <Link href="/soeg" className="ls-btn-ghost">
              Søg i kataloget →
            </Link>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="ls-pagination">
          {page > 1 && (
            <Link href={pageUrl(page - 1)}>←</Link>
          )}
          {(() => {
            const window = 2
            const nums: number[] = []
            for (let p = 1; p <= pages; p++) {
              if (p === 1 || p === pages || Math.abs(p - page) <= window) nums.push(p)
            }
            const result: React.ReactNode[] = []
            let prev = 0
            for (const p of nums) {
              if (prev && p - prev > 1) result.push(<span key={`gap-${p}`} className="ls-pagination-gap">…</span>)
              result.push(
                <Link
                  key={p}
                  href={pageUrl(p)}
                  className={page === p ? 'active' : ''}
                >
                  {p}
                </Link>
              )
              prev = p
            }
            return result
          })()}
          {page < pages && (
            <Link href={pageUrl(page + 1)}>→</Link>
          )}
        </div>
      )}

      <div style={{ height: 48 }} />
    </>
  )
}
