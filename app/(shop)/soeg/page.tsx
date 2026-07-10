import { createServiceClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { ProductCard } from '../_product-card'
import { SearchInput } from './_search-input'

export const metadata: Metadata = { title: 'Søg' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q = '', page: pageStr = '1' } = await searchParams
  const page   = Math.max(1, parseInt(pageStr))
  const offset = (page - 1) * PAGE_SIZE

  let products: any[] = []
  let total = 0
  let pages = 0

  if (q.trim().length >= 2) {
    const supabase = createServiceClient()

    const { data, count } = await supabase
      .from('products')
      .select('id, name, categories, sales_price, brand, product_images(url, is_primary)', { count: 'exact' })
      .not('status', 'eq', 'archived')
      .not('status', 'eq', 'rejected')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    products = data ?? []
    total    = count ?? 0
    pages    = Math.ceil(total / PAGE_SIZE)
  }

  return (
    <div className="ls-search-page">
      <SearchInput initialQ={q} />

      {q.trim().length >= 2 ? (
        <>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 20 }}>
            {total > 0
              ? `${total.toLocaleString('da-DK')} resultater for "${q}"`
              : `Ingen resultater for "${q}"`}
          </div>

          {products.length > 0 ? (
            <div className="ls-prodgrid">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          ) : (
            <div className="ls-empty">
              <div className="ls-empty-icon">🔍</div>
              <h3>Ingen resultater</h3>
              <p>Prøv et kortere søgeord eller gennemse <a href="/kategorier">kategorierne</a>.</p>
            </div>
          )}

          {pages > 1 && (
            <div className="ls-pagination">
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                const p = i + 1
                return (
                  <a key={p} href={`/soeg?q=${encodeURIComponent(q)}&page=${p}`}>
                    <span className={page === p ? 'active' : ''}>{p}</span>
                  </a>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <div className="ls-empty">
          <div className="ls-empty-icon">🔎</div>
          <h3>Søg i kataloget</h3>
          <p>Indtast mindst 2 tegn for at søge</p>
        </div>
      )}

      <div style={{ height: 48 }} />
    </div>
  )
}
