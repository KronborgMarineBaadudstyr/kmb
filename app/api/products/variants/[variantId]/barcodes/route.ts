import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/products/variants/[variantId]/barcodes
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ variantId: string }> }
) {
  const { variantId } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('variant_barcodes')
    .select('id, ean, is_primary, note, created_at')
    .eq('variant_id', variantId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/products/variants/[variantId]/barcodes
// Body: { ean: string, is_primary?: boolean, note?: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> }
) {
  const { variantId } = await params
  const supabase = createServiceClient()

  let body: { ean: string; is_primary?: boolean; note?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const { ean, is_primary = false, note } = body
  if (!ean?.trim()) return NextResponse.json({ error: 'ean er påkrævet' }, { status: 400 })

  // Verify variant exists
  const { data: variant } = await supabase
    .from('product_variants')
    .select('id')
    .eq('id', variantId)
    .single()
  if (!variant) return NextResponse.json({ error: 'Variant ikke fundet' }, { status: 404 })

  const { data, error } = await supabase
    .from('variant_barcodes')
    .insert({ variant_id: variantId, ean: ean.trim(), is_primary, note: note?.trim() || null })
    .select('id, ean, is_primary, note, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Stregkoden findes allerede på denne variant' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Keep product_variants.ean in sync with the primary barcode
  if (is_primary) {
    await supabase
      .from('product_variants')
      .update({ ean: ean.trim(), updated_at: new Date().toISOString() })
      .eq('id', variantId)
  }

  return NextResponse.json({ data }, { status: 201 })
}
