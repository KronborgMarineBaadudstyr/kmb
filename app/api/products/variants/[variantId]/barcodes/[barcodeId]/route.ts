import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// PATCH /api/products/variants/[variantId]/barcodes/[barcodeId]
// Body: { ean?, is_primary?, note? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ variantId: string; barcodeId: string }> }
) {
  const { variantId, barcodeId } = await params
  const supabase = createServiceClient()

  let body: { ean?: string; is_primary?: boolean; note?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}
  if (body.ean     !== undefined) updates.ean        = body.ean.trim()
  if (body.note    !== undefined) updates.note       = body.note?.trim() || null
  if (body.is_primary !== undefined) updates.is_primary = body.is_primary

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Ingen felter at opdatere' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('variant_barcodes')
    .update(updates)
    .eq('id', barcodeId)
    .eq('variant_id', variantId)
    .select('id, ean, is_primary, note, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Stregkode ikke fundet' }, { status: 404 })

  // Keep product_variants.ean in sync with the primary barcode
  if (data.is_primary) {
    await supabase
      .from('product_variants')
      .update({ ean: data.ean, updated_at: new Date().toISOString() })
      .eq('id', variantId)
  }

  return NextResponse.json({ data })
}

// DELETE /api/products/variants/[variantId]/barcodes/[barcodeId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ variantId: string; barcodeId: string }> }
) {
  const { variantId, barcodeId } = await params
  const supabase = createServiceClient()

  // Check if it's the primary before deleting
  const { data: existing } = await supabase
    .from('variant_barcodes')
    .select('id, is_primary')
    .eq('id', barcodeId)
    .eq('variant_id', variantId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Stregkode ikke fundet' }, { status: 404 })

  const { error } = await supabase
    .from('variant_barcodes')
    .delete()
    .eq('id', barcodeId)
    .eq('variant_id', variantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If we deleted the primary, promote the oldest remaining barcode to primary
  if (existing.is_primary) {
    const { data: remaining } = await supabase
      .from('variant_barcodes')
      .select('id, ean')
      .eq('variant_id', variantId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (remaining) {
      await supabase
        .from('variant_barcodes')
        .update({ is_primary: true })
        .eq('id', remaining.id)
      // Sync ean on variant
      await supabase
        .from('product_variants')
        .update({ ean: remaining.ean, updated_at: new Date().toISOString() })
        .eq('id', variantId)
    } else {
      // No barcodes left — clear ean on variant
      await supabase
        .from('product_variants')
        .update({ ean: null, updated_at: new Date().toISOString() })
        .eq('id', variantId)
    }
  }

  return NextResponse.json({ ok: true })
}
