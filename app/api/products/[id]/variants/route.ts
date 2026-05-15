import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/products/[id]/variants
// Returns all variants of a product (siblings sharing the same parent, or children of this product)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Find the effective parent id
  const { data: self } = await supabase
    .from('products')
    .select('id, name, parent_product_id, variant_attributes, internal_sku')
    .eq('id', id)
    .single()

  if (!self) return NextResponse.json({ error: 'Ikke fundet' }, { status: 404 })

  const parentId = self.parent_product_id ?? self.id

  // Load parent
  const { data: parent } = await supabase
    .from('products')
    .select('id, name, internal_sku, variant_attributes')
    .eq('id', parentId)
    .single()

  // Load all children
  const { data: variants } = await supabase
    .from('products')
    .select('id, name, internal_sku, variant_attributes, status, ean')
    .eq('parent_product_id', parentId)
    .order('name')

  return NextResponse.json({ parent, variants: variants ?? [] })
}

// POST /api/products/[id]/variants
// Link another product as a variant of [id] (making [id] the parent)
// Body: { variant_product_id: string, variant_attributes?: Record<string,string> }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: parentId } = await params
  const supabase = createServiceClient()

  const body = await request.json() as {
    variant_product_id: string
    variant_attributes?: Record<string, string>
  }

  if (!body.variant_product_id) {
    return NextResponse.json({ error: 'variant_product_id påkrævet' }, { status: 400 })
  }

  // Ensure parent itself has no parent (can't chain)
  const { data: parent } = await supabase
    .from('products')
    .select('parent_product_id')
    .eq('id', parentId)
    .single()

  if (parent?.parent_product_id) {
    return NextResponse.json({ error: 'Forælderen er selv en variant — vælg rod-produktet som forælder' }, { status: 400 })
  }

  const { error } = await supabase
    .from('products')
    .update({
      parent_product_id:  parentId,
      variant_attributes: body.variant_attributes ?? {},
      updated_at:         new Date().toISOString(),
    })
    .eq('id', body.variant_product_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/products/[id]/variants?variant_id=...
// Unlink a variant (set parent_product_id = null)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params
  const supabase  = createServiceClient()
  const variantId = new URL(request.url).searchParams.get('variant_id')

  if (!variantId) return NextResponse.json({ error: 'variant_id påkrævet' }, { status: 400 })

  const { error } = await supabase
    .from('products')
    .update({ parent_product_id: null, variant_attributes: {}, updated_at: new Date().toISOString() })
    .eq('id', variantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
