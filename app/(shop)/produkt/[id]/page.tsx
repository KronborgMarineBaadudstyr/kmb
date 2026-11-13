import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Fragment, Suspense, cache } from 'react'
import { AddToCartBtn } from './_add-to-cart'
import { VariantPicker } from './_variant-picker'
import { WishlistBtn } from './_wishlist-btn'
import { ProductCard } from '../../_product-card'
import { AdminEdit } from './_admin-edit'
import { getCurrentAdmin } from '@/lib/admin-auth'
import { slugify } from '@/lib/shop/categories'
import { getAttrOrder } from '@/lib/shop/variant-order'
import { sortVariantsByAttributes } from '@/lib/variant-attributes'
import { splitOutlet, attrLabel } from '@/lib/shop/variant-pricing'

export const dynamic = 'force-dynamic'

function formatDescription(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\\·/g, '·')
    .replace(/\n/g, '<br>')
}

// cache(): metadata og siden deler ét opslag i stedet for to
const getProduct = cache(async (id: string) => {
  const { data } = await createServiceClient()
    .from('products')
    .select(`
      id, name, description, short_description, categories, brand, status,
      sales_price, internal_sku, ean, manufacturer_sku, original_number, original_number_source,
      weight, length, width, height,
      product_images ( url, is_primary, position ),
      product_suppliers (
        supplier_sku, purchase_price, recommended_sales_price, is_active,
        suppliers ( name )
      )
    `)
    .eq('id', id)
    .maybeSingle()
  return data
})

type Variant = {
  id: string
  internal_variant_sku: string
  attributes: { name: string; value: string }[]
  sales_price: number | null
  own_stock_quantity: number
  own_stock_reserved: number
}

async function getVariants(id: string): Promise<Variant[]> {
  const { data } = await createServiceClient()
    .from('product_variants')
    .select('id, internal_variant_sku, attributes, sales_price, own_stock_quantity, own_stock_reserved')
    .eq('product_id', id)
    .eq('status', 'active')
    .order('internal_variant_sku')
  return (data ?? []) as Variant[]
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }): Promise<Metadata> {
  const [{ id }, { variant }] = await Promise.all([params, searchParams])
  const p = await getProduct(id)
  if (!p) return { title: 'Produkt' }
  if (variant) {
    const v = (await getVariants(id)).find(x => x.id === variant)
    if (v) return { title: `${p.name} ${attrLabel(v.attributes)} (Outlet)`.trim() }
  }
  return { title: p.name }
}

// "Flere i …" streames ind efter selve produktet, så siden ikke venter på det
async function RelatedProducts({ id, category }: { id: string; category: string }) {
  const { data } = await createServiceClient()
    .from('products')
    .select('id, name, categories, sales_price, brand, product_images(url, is_primary)')
    .contains('categories', [category])
    .not('status', 'in', '(archived,rejected)')
    .neq('id', id)
    .limit(8)

  const related = (data ?? []) as {
    id: string; name: string; categories: string[];
    sales_price: number | null; brand: string | null;
    product_images: { url: string; is_primary: boolean }[]
  }[]
  if (related.length === 0) return null

  return (
    <>
      <div className="ls-section-header" style={{ marginTop: 48 }}>
        <h2>Flere i {category}</h2>
        <Link href={`/kategorier/${slugify(category)}`}>Se alle</Link>
      </div>
      <div className="ls-prodgrid ls-prodgrid--related">
        {related.map(r => <ProductCard key={r.id} product={r as any} />)}
      </div>
    </>
  )
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const [{ id }, { variant: variantParam }] = await Promise.all([params, searchParams])

  // Produkt, varianter, admin-tjek og variant-rækkefølgen (Sortiment → Variant-egenskaber) hentes samtidig
  const [p, rawVariants, admin, attrOrder] = await Promise.all([getProduct(id), getVariants(id), getCurrentAdmin(), getAttrOrder()])
  const variants = sortVariantsByAttributes(rawVariants, attrOrder)

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


  function fmtPrice(n: number) {
    return n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr'
  }

  const specs: [string, string][] = []
  if (p.ean)              specs.push(['EAN', p.ean])
  // Producentens originale varenummer — aldrig leverandørens (kunden skal kunne genkende varen fra producentens katalog)
  const originalNo = p.manufacturer_sku || (p.original_number_source === 'manufacturer_sku' ? p.original_number : null)
  if (originalNo)         specs.push(['Producentens varenr.', originalNo])
  if (p.internal_sku)     specs.push(['Varenr.', p.internal_sku])
  if (p.weight)           specs.push(['Vægt', `${p.weight} kg`])
  if (p.length)           specs.push(['Længde', `${p.length} cm`])
  if (p.width)            specs.push(['Bredde', `${p.width} cm`])
  if (p.height)           specs.push(['Højde', `${p.height} cm`])

  // Varianter med afvigende pris er outlet-varer (lib/shop/variant-pricing.ts). ?variant=<id> på en af dem viser den som et selvstændigt produkt
  const { reference, regular, outlet } = splitOutlet(variants, p.sales_price ?? null)
  const outletVariant = variantParam ? outlet.find(v => v.id === variantParam) ?? null : null
  const hasVariants = !outletVariant && (regular.length > 0 || outlet.length > 0)
  const title = outletVariant ? `${p.name} ${attrLabel(outletVariant.attributes)}`.trim() : p.name
  const shownPrice = outletVariant ? outletVariant.sales_price : (hasVariants ? null : (p.sales_price ?? reference))

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
        <span style={{ color: 'var(--ink)' }}>{title}</span>
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
          <h1 className="ls-pdp-name">{title}{outletVariant && <span className="ls-outlet-tag ls-outlet-tag--lg">Outlet</span>}</h1>
          {outletVariant && (
            <p className="ls-outlet-note">
              Udgave til særpris · <Link href={`/produkt/${p.id}`}>Se {p.name} i alle udgaver →</Link>
            </p>
          )}

          {!hasVariants && (
            shownPrice
              ? <div className="ls-pdp-price">{fmtPrice(shownPrice)}</div>
              : <div className="ls-pdp-price" style={{ fontSize: 16, color: 'var(--ink-3)' }}>Kontakt for pris</div>
          )}

          {p.short_description && (
            <div className="ls-pdp-desc"
              dangerouslySetInnerHTML={{ __html: formatDescription(p.short_description) }} />
          )}

          {/* Variant picker — replaces simple add-to-cart when variants exist */}
          {hasVariants
            ? <VariantPicker
                variants={regular}
                outlet={outlet}
                productId={p.id}
                productName={p.name}
                basePrice={reference}
                image={primaryImage}
                attrOrder={attrOrder}
              />
            : <AddToCartBtn
                product={{
                  id:    outletVariant ? `${p.id}__${outletVariant.id}` : p.id,   // produktId__variantId → ordren får variantens pris
                  name:  outletVariant ? `${title} (Outlet)` : p.name,
                  price: shownPrice ?? 0, image: primaryImage,
                }}
              />
          }

          <WishlistBtn name={title} price={shownPrice} image={primaryImage} />

          {p.description && (
            <div className="ls-pdp-desc" style={{ marginTop: 8 }}
              dangerouslySetInnerHTML={{ __html: formatDescription(p.description) }} />
          )}

          {specs.length > 0 && (
            <div className="ls-pdp-meta">
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: 0 }}>
                {specs.map(([k, v]) => (
                  <Fragment key={k}>
                    <dt style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, whiteSpace: 'nowrap' }}>{k}</dt>
                    <dd style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>{v}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          )}

        </div>
      </div>

      {firstCat && (
        <Suspense fallback={null}>
          <RelatedProducts id={p.id} category={firstCat} />
        </Suspense>
      )}

      <div style={{ height: 48 }} />

      {/* Kategoriforslagene hentes først, når admin åbner panelet */}
      {admin && (
        <AdminEdit product={{
          id: p.id, name: p.name, brand: p.brand ?? null, sales_price: p.sales_price ?? null,
          status: p.status, categories: cats, short_description: p.short_description ?? null, description: p.description ?? null,
        }} />
      )}
    </>
  )
}
