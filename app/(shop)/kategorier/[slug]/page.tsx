import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ProductCard } from '../../_product-card'
import { CategoryFilters } from './_filters'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

function deslugify(slug: string) {
  return slug
    .replace(/ae/g, 'æ').replace(/oe/g, 'ø').replace(/aa/g, 'å')
    .replace(/-/g, ' ')
}
function slugify(s: string) {
  return s.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: deslugify(slug).replace(/\b\w/g, c => c.toUpperCase()) }
}

const PAGE_SIZE = 24

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
  const offset   = (page - 1) * PAGE_SIZE

  const supabase = createServiceClient()

  // Resolve category name from slug
  const { data: allCatRows } = await supabase
    .from('products')
    .select('categories')
    .not('categories', 'is', null)

  const matchedCat = [...new Set(
    (allCatRows ?? []).flatMap(r => r.categories as string[])
  )].find(c => slugify(c) === slug)

  if (!matchedCat) {
    return (
      <div className="ls-empty" style={{ paddingTop: 80 }}>
        <div className="ls-empty-icon">🔍</div>
        <h3>Kategori ikke fundet</h3>
        <p><Link href="/kategorier">← Alle kategorier</Link></p>
      </div>
    )
  }

  // Fetch category description
  const { data: catInfo } = await supabase
    .from('categories')
    .select('description')
    .eq('name', matchedCat)
    .maybeSingle()

  // Build filtered product query
  let query = supabase
    .from('products')
    .select('id, name, categories, sales_price, brand, product_images(url, is_primary)', { count: 'exact' })
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .contains('categories', [matchedCat])

  if (brand)    query = query.eq('brand', brand)
  if (inStock)  query = query.gt('own_stock_quantity', 0)
  if (minPrice) query = query.gte('sales_price', parseFloat(minPrice))
  if (maxPrice) query = query.lte('sales_price', parseFloat(maxPrice))

  switch (sort) {
    case 'price_asc':  query = query.order('sales_price', { ascending: true,  nullsFirst: false }); break
    case 'price_desc': query = query.order('sales_price', { ascending: false, nullsFirst: false }); break
    case 'name_desc':  query = query.order('name',        { ascending: false }); break
    default:           query = query.order('name',        { ascending: true  }); break
  }

  const { data: products, count } = await query.range(offset, offset + PAGE_SIZE - 1)
  const total = count ?? 0
  const pages = Math.ceil(total / PAGE_SIZE)

  // Fetch available brands for filter chips (unfiltered — always show all brands in category)
  const { data: brandRows } = await supabase
    .from('products')
    .select('brand')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .contains('categories', [matchedCat])
    .not('brand', 'is', null)

  const brands = [...new Set((brandRows ?? []).map(r => r.brand as string))]
    .filter(Boolean)
    .sort()

  // Price range for hints
  const { data: priceRange } = await supabase
    .from('products')
    .select('sales_price')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .contains('categories', [matchedCat])
    .not('sales_price', 'is', null)

  const prices     = (priceRange ?? []).map(r => r.sales_price as number).filter(Boolean)
  const globalMin  = prices.length ? Math.min(...prices) : 0
  const globalMax  = prices.length ? Math.max(...prices) : 0

  // Build base URL for pagination (preserves all filters)
  function pageUrl(p: number) {
    const params = new URLSearchParams({ sort, page: String(p) })
    if (brand)    params.set('brand', brand)
    if (inStock)  params.set('in_stock', '1')
    if (minPrice) params.set('min_price', minPrice)
    if (maxPrice) params.set('max_price', maxPrice)
    return `/kategorier/${slug}?${params.toString()}`
  }

  return (
    <>
      {/* Brødkrumme */}
      <nav className="ls-breadcrumb">
        <Link href="/">Hjem</Link>
        <span>/</span>
        <Link href="/kategorier">Kategorier</Link>
        <span>/</span>
        <span style={{ color: 'var(--ink)' }}>{matchedCat}</span>
      </nav>

      {/* Navy kategori-header (improvement 4) */}
      <div className="ls-cat-listing-hero">
        <div className="ls-cat-listing-hero-content">
          <div className="ls-hero-kicker">
            <span className="ls-hero-kicker-dot" />
            Kategori
          </div>
          <h1>{matchedCat}</h1>
          {catInfo?.description && (
            <p className="ls-cat-listing-hero-desc">{catInfo.description}</p>
          )}
          <div className="ls-cat-listing-hero-count">{total.toLocaleString('da-DK')} varer</div>
        </div>
      </div>

      {/* Filter-panel (improvement 5) */}
      <Suspense fallback={null}>
        <CategoryFilters
          brands={brands}
          minPrice={globalMin}
          maxPrice={globalMax}
          current={{ sort, brand, inStock, minPrice, maxPrice }}
        />
      </Suspense>

      {/* Produktgrid */}
      {products && products.length > 0 ? (
        <div className="ls-prodgrid">
          {products.map(p => <ProductCard key={p.id} product={p as any} />)}
        </div>
      ) : (
        /* Tom state med CTA (improvement 7) */
        <div className="ls-empty">
          <div className="ls-empty-icon">📦</div>
          <h3>Ingen produkter fundet</h3>
          <p>Prøv at fjerne filtrene, eller søg i hele kataloget.</p>
          <div className="ls-empty-actions">
            {(brand || inStock || minPrice || maxPrice) && (
              <Link href={`/kategorier/${slug}`} className="ls-btn-primary">
                Fjern filtre
              </Link>
            )}
            <Link href="/soeg" className="ls-btn-ghost">
              Søg i kataloget →
            </Link>
          </div>
        </div>
      )}

      {/* Pagination med className på Link (improvement 6) */}
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
