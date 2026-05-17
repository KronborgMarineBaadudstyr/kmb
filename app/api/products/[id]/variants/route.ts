import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/products/[id]/variants
// Returns product_variants rows for product [id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('product_variants')
    .select('id, internal_variant_sku, attributes, ean, sales_price, sale_price, own_stock_quantity, own_stock_reserved, status, woo_variation_id')
    .eq('product_id', id)
    .order('internal_variant_sku')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/products/[id]/variants
// Create a new product_variant row linked to product [id]
// Body: { attributes: [{name,value}], ean?, sales_price?, own_stock_quantity? }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const ts  = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()

  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      product_id:           productId,
      internal_variant_sku: `${ts}-${rnd}`,
      attributes:           body.attributes ?? [],
      ean:                  body.ean ?? null,
      sales_price:          body.sales_price ?? null,
      sale_price:           body.sale_price ?? null,
      own_stock_quantity:   body.own_stock_quantity ?? 0,
      own_stock_reserved:   0,
      status:               'active',
    })
    .select('id, internal_variant_sku')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/products/[id]/variants?variant_id=...
// Delete a product_variant row
export async function DELETE(
  request: Request,
  _ctx: { params: Promise<{ id: string }> },
) {
  const supabase  = createServiceClient()
  const variantId = new URL(request.url).searchParams.get('variant_id')

  if (!variantId) return NextResponse.json({ error: 'variant_id påkrævet' }, { status: 400 })

  const { error } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', variantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
