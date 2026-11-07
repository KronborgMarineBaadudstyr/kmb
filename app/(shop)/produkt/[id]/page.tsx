import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AddToCartBtn } from './_add-to-cart'
import { VariantPicker } from './_variant-picker'
import { WishlistBtn } from './_wishlist-btn'
import { ProductCard } from '../../_product-card'

export const dynamic = 'force-dynamic'

function formatDescription(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\\·/g, '·')
    .replace(/\n/g, '<br>')
}

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
  if (p.ean)              specs.push(['EAN', p.ean])
  if (p.manufacturer_sku) specs.push(['Producent varenr.', p.manufacturer_sku])
  if (p.internal_sku)     specs.push(['Varenr.', p.internal_sku])
  if (p.weight)           specs.push(['Vægt', `${p.weight} kg`])
  if (p.length)           specs.push(['Længde', `${p.length} cm`])
  if (p.width)            specs.push(['Bredde', `${p.width} cm`])
  if (p.height)           specs.push(['Højde', `${p.height} cm`])

  // Fetch variants
  const { data: variantRows } = await supabase
    .from('product_variants')
    .select('id, internal_variant_sku, attributes, sales_price, own_stock_quantity, own_stock_reserved')
    .eq('product_id', id)
    .eq('status', 'active')
    .order('internal_variant_sku')

  const variants = (variantRows ?? []) as {
    id: string
    internal_variant_sku: string
    attributes: { name: string; value: string }[]
    sales_price: number | null
    own_stock_quantity: number
    own_stock_reserved: number
  }[]

  // Fetch related products from same category (excluding this product)
  const { data: relatedRows } = firstCat
    ? await supabase
        .from('products')
        .select('id, name, categories, sales_price, brand, product_images(url, is_primary)')
        .contains('categories', [firstCat])
        .not('status', 'eq', 'archived')
        .not('status', 'eq', 'rejected')
        .neq('id', id)
        .limit(8)
    : { data: [] }

  const related = (relatedRows ?? []) as {
    id: string; name: string; categories: string[];
    sales_price: number | null; brand: string | null;
    product_images: { url: string; is_primary: boolean }[]
  }[]

  const hasVariants = variants.length > 0

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

          {!hasVariants && (
            p.sales_price
              ? <div className="ls-pdp-price">{fmtPrice(p.sales_price)}</div>
              : <div className="ls-pdp-price" style={{ fontSize: 16, color: 'var(--ink-3)' }}>Kontakt for pris</div>
          )}

          {p.short_description && (
            <div className="ls-pdp-desc"
              dangerouslySetInnerHTML={{ __html: formatDescription(p.short_description) }} />
          )}

          {/* Variant picker — replaces simple add-to-cart when variants exist */}
          {hasVariants
            ? <VariantPicker
                variants={variants}
                productId={p.id}
                productName={p.name}
                basePrice={p.sales_price ?? null}
                image={primaryImage}
              />
            : <AddToCartBtn
                product={{ id: p.id, name: p.name, price: p.sales_price ?? 0, image: primaryImage }}
              />
          }

          <WishlistBtn name={p.name} price={p.sales_price} image={primaryImage} />

          {p.description && (
            <div className="ls-pdp-desc" style={{ marginTop: 8 }}
              dangerouslySetInnerHTML={{ __html: formatDescription(p.description) }} />
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
              Leverandør: {[...new Set(suppliers.map(s => {
                const sup = Array.isArray(s.suppliers) ? s.suppliers[0] : s.suppliers
                return sup?.name
              }).filter(Boolean))].join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Relaterede produkter */}
      {related.length > 0 && (
        <>
          <div className="ls-section-header" style={{ marginTop: 48 }}>
            <h2>Flere i {firstCat}</h2>
            <Link href={`/kategorier/${slugify(firstCat!)}`}>Se alle</Link>
          </div>
          <div className="ls-prodgrid ls-prodgrid--related">
            {related.map(r => <ProductCard key={r.id} product={r as any} />)}
          </div>
        </>
      )}

      <div style={{ height: 48 }} />
    </>
  )
}
