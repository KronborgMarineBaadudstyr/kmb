import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractBrandFromDB } from '@/lib/extract-brand'

export const dynamic = 'force-dynamic'

// POST /api/products/create
// Full product creation: product row + optional product_suppliers row + optional product_images row
//
// Body:
// {
//   name, brand?, description?, short_description?,
//   categories?, tags?, sales_price?, ean?, manufacturer_sku?,
//   weight?, length?, width?, height?,
//   status?,
//   internal_sku?,          ← override auto-generated SKU
//   supplier_id?,           ← link to existing supplier
//   supplier_sku?,          ← supplier's own item number
//   supplier_product_name?, ← supplier's product name (defaults to name)
//   purchase_price?,        ← supplier purchase price
//   recommended_sales_price?,
//   image_url?,             ← primary image URL
// }
export async function POST(request: Request) {
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name er påkrævet' }, { status: 400 })
  }

  // ── Resolve internal_sku ──────────────────────────────────────────────────
  let internalSku: string
  if (body.internal_sku && typeof body.internal_sku === 'string' && body.internal_sku.trim()) {
    // Check uniqueness
    const candidate = body.internal_sku.trim().toUpperCase()
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('internal_sku', candidate)
      .single()
    if (existing) {
      return NextResponse.json({ error: `Varenummer "${candidate}" er allerede i brug` }, { status: 409 })
    }
    internalSku = candidate
  } else {
    // Auto-generate
    const ts  = Date.now().toString(36).toUpperCase()
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
    internalSku = `KMB-${ts}-${rnd}`
  }

  // ── Auto-detect brand from product name if not provided ──────────────────
  const resolvedBrand: string | null =
    (body.brand && typeof body.brand === 'string' && body.brand.trim())
      ? body.brand.trim()
      : await extractBrandFromDB(body.name.trim(), supabase)

  // ── Create product ────────────────────────────────────────────────────────
  const { data: product, error: prodError } = await supabase
    .from('products')
    .insert({
      internal_sku:      internalSku,
      name:              body.name.trim(),
      brand:             resolvedBrand,
      description:       body.description        ?? null,
      short_description: body.short_description  ?? null,
      categories:        Array.isArray(body.categories) ? body.categories : [],
      tags:              Array.isArray(body.tags)        ? body.tags        : [],
      sales_price:       body.sales_price        ?? null,
      ean:               body.ean                ?? null,
      manufacturer_sku:  body.manufacturer_sku   ?? null,
      weight:            body.weight             ?? null,
      length:            body.length             ?? null,
      width:             body.width              ?? null,
      height:            body.height             ?? null,
      status:            body.status             ?? 'draft',
    })
    .select('id, internal_sku, name')
    .single()

  if (prodError || !product) {
    return NextResponse.json({ error: prodError?.message ?? 'Produkt-oprettelse fejlede' }, { status: 500 })
  }

  const productId = product.id
  const warnings: string[] = []

  // ── Create product_suppliers row ──────────────────────────────────────────
  if (body.supplier_id && typeof body.supplier_id === 'string') {
    const { error: supError } = await supabase
      .from('product_suppliers')
      .insert({
        product_id:              productId,
        supplier_id:             body.supplier_id,
        supplier_sku:            body.supplier_sku            ?? internalSku,
        supplier_product_name:   body.supplier_product_name   ?? body.name,
        purchase_price:          body.purchase_price          ?? null,
        recommended_sales_price: body.recommended_sales_price ?? null,
        priority:                1,
        is_active:               true,
        item_status:             'active',
      })
    if (supError) warnings.push(`Leverandørlink fejlede: ${supError.message}`)
  }

  // ── Add primary image ─────────────────────────────────────────────────────
  if (body.image_url && typeof body.image_url === 'string' && body.image_url.trim()) {
    const { error: imgError } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        url:        body.image_url.trim(),
        is_primary: true,
        position:   0,
        source:     'manual',
      })
    if (imgError) warnings.push(`Billede-link fejlede: ${imgError.message}`)
  }

  return NextResponse.json({
    data: product,
    warnings: warnings.length > 0 ? warnings : undefined,
  }, { status: 201 })
}
