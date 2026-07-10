import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ProductCard } from '../../_product-card'

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
  searchParams: Promise<{ sort?: string; page?: string }>
}) {
  const { slug } = await params
  const { sort = 'name_asc', page: pageStr = '1' } = await searchParams
  const page   = Math.max(1, parseInt(pageStr))
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createServiceClient()

  // Find all categories that match this slug
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

  let query = supabase
    .from('products')
    .select('id, name, categories, sales_price, brand, product_images(url, is_primary)', { count: 'exact' })
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .contains('categories', [matchedCat])

  switch (sort) {
    case 'price_asc':  query = query.order('sales_price', { ascending: true,  nullsFirst: false }); break
    case 'price_desc': query = query.order('sales_price', { ascending: false, nullsFirst: false }); break
    case 'name_desc':  query = query.order('name',        { ascending: false }); break
    default:           query = query.order('name',        { ascending: true  }); break
  }

  const { data: products, count } = await query.range(offset, offset + PAGE_SIZE - 1)
  const total = count ?? 0
  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <nav className="ls-breadcrumb">
        <Link href="/">Hjem</Link>
        <span>/</span>
        <Link href="/kategorier">Kategorier</Link>
        <span>/</span>
        <span style={{ color: 'var(--ink)' }}>{matchedCat}</span>
      </nav>

      <div className="ls-listing-header">
        <h1>{matchedCat}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ls-listing-count">{total.toLocaleString('da-DK')} varer</span>
          <form>
            <input type="hidden" name="page" value="1" />
            <select name="sort" className="ls-sort-select" defaultValue={sort}
              onChange={(e) => {
                // client-side navigation for sort
              }}>
              <option value="name_asc">Navn A–Å</option>
              <option value="name_desc">Navn Å–A</option>
              <option value="price_asc">Pris lav–høj</option>
              <option value="price_desc">Pris høj–lav</option>
            </select>
          </form>
        </div>
      </div>

      {products && products.length > 0 ? (
        <div className="ls-prodgrid">
          {products.map(p => <ProductCard key={p.id} product={p as any} />)}
        </div>
      ) : (
        <div className="ls-empty">
          <div className="ls-empty-icon">📦</div>
          <h3>Ingen produkter fundet</h3>
        </div>
      )}

      {pages > 1 && (
        <div className="ls-pagination">
          {page > 1 && (
            <Link href={`/kategorier/${slug}?sort=${sort}&page=${page - 1}`}>←</Link>
          )}
          {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
            const p = i + 1
            return (
              <Link key={p} href={`/kategorier/${slug}?sort=${sort}&page=${p}`}>
                <span className={page === p ? 'active' : ''}>{p}</span>
              </Link>
            )
          })}
          {page < pages && (
            <Link href={`/kategorier/${slug}?sort=${sort}&page=${page + 1}`}>→</Link>
          )}
        </div>
      )}

      <div style={{ height: 48 }} />
    </>
  )
}
