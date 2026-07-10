import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AddToCartBtn } from './_add-to-cart'

export const dynamic = 'force-dynamic'

function slugify(s: string) {
  return s.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceClient()
  const { data } = await supabase.from('products').select('name').eq('id', id).single()
  return { title: data?.name ?? 'Produkt' }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: p } = await supabase
    .from('products')
    .select(`
      id, name, description, short_description, categories, brand,
      sales_price, internal_sku, ean, manufacturer_sku,
      weight, length, width, height,
      product_images ( url, is_primary, position ),
      product_suppliers (
        supplier_sku, purchase_price, recommended_sales_price, is_active,
        suppliers ( name )
      )
    `)
    .eq('id', id)
    .single()

  if (!p) {
    return (
      <div className="ls-empty" style={{ paddingTop: 80 }}>
        <div className="ls-empty-icon">🔍</div>
        <h3>Produkt ikke fundet</h3>
        <p><Link href="/">← Tilbage til forsiden</Link></p>
      </div>
    )
  }

  const images = ((p.product_images ?? []) as { url: string; is_primary: boolean; position: number }[])
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.position - b.position)

  const primaryImage = images[0]?.url

  const cats = (p.categories as string[] | null) ?? []
  const firstCat = cats[0]

  const suppliers = ((p.product_suppliers ?? []) as {
    supplier_sku: string
    recommended_sales_price: number | null
    is_active: boolean
    suppliers: { name: string }[] | { name: string } | null
  }[]).filter(s => s.is_active)

  function fmtPrice(n: number) {
    return n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr'
  }

  const specs: [string, string][] = []
  if (p.ean)               specs.push(['EAN', p.ean])
  if (p.manufacturer_sku)  specs.push(['Producent varenr.', p.manufacturer_sku])
  if (p.internal_sku)      specs.push(['Varenr.', p.internal_sku])
  if (p.weight)            specs.push(['Vægt', `${p.weight} kg`])
  if (p.length)            specs.push(['Længde', `${p.length} cm`])
  if (p.width)             specs.push(['Bredde', `${p.width} cm`])
  if (p.height)            specs.push(['Højde', `${p.height} cm`])

  return (
    <>
      <nav className="ls-breadcrumb">
        <Link href="/">Hjem</Link>
        <span>/</span>
        {firstCat && (
          <>
            <Link href={`/kategorier/${slugify(firstCat)}`}>{firstCat}</Link>
            <span>/</span>
          </>
        )}
        <span style={{ color: 'var(--ink)' }}>{p.name}</span>
      </nav>

      <div className="ls-pdp">
        {/* Left: image */}
        <div className="ls-pdp-images">
          {primaryImage ? (
            <img src={primaryImage} alt={p.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 24 }} />
          ) : (
            <span className="placeholder">⚓</span>
          )}
        </div>

        {/* Right: info */}
        <div className="ls-pdp-info">
          {p.brand && <div className="ls-pdp-brand">{p.brand}</div>}
          <h1 className="ls-pdp-name">{p.name}</h1>

          {p.sales_price ? (
            <div className="ls-pdp-price">{fmtPrice(p.sales_price)}</div>
          ) : (
            <div className="ls-pdp-price" style={{ fontSize: 16, color: 'var(--ink-3)' }}>Kontakt for pris</div>
          )}

          {p.short_description && (
            <div className="ls-pdp-desc">{p.short_description}</div>
          )}

          <AddToCartBtn
            product={{ id: p.id, name: p.name, price: p.sales_price ?? 0, image: primaryImage }}
          />

          {p.description && (
            <div className="ls-pdp-desc" style={{ marginTop: 8 }}
              dangerouslySetInnerHTML={{ __html: p.description }} />
          )}

          {specs.length > 0 && (
            <div className="ls-pdp-meta">
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: 0 }}>
                {specs.map(([k, v]) => (
                  <>
                    <dt key={`k-${k}`} style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, whiteSpace: 'nowrap' }}>{k}</dt>
                    <dd key={`v-${k}`} style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>{v}</dd>
                  </>
                ))}
              </dl>
            </div>
          )}

          {suppliers.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Leverandør: {suppliers.map(s => {
                const sup = Array.isArray(s.suppliers) ? s.suppliers[0] : s.suppliers
                return sup?.name
              }).filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 48 }} />
    </>
  )
}
