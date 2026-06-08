import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// PATCH /api/products/visibility
// Bulk-opdater hide_when_out_of_stock for valgte produkter eller en hel kategori.
//
// Body (en af to former):
//   { product_ids: string[], hide_when_out_of_stock: boolean }
//   { category: string,      hide_when_out_of_stock: boolean }
//
// Returnerer antal opdaterede produkter.
export async function PATCH(request: Request) {
  const supabase = createServiceClient()

  let body: { product_ids?: string[]; category?: string; hide_when_out_of_stock: boolean }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const { product_ids, category, hide_when_out_of_stock } = body

  if (typeof hide_when_out_of_stock !== 'boolean') {
    return NextResponse.json({ error: 'hide_when_out_of_stock (boolean) er påkrævet' }, { status: 400 })
  }
  if (!product_ids?.length && !category) {
    return NextResponse.json({ error: 'Angiv enten product_ids eller category' }, { status: 400 })
  }

  const ts = new Date().toISOString()

  if (product_ids?.length) {
    // Update specific products
    const { error } = await supabase
      .from('products')
      .update({ hide_when_out_of_stock, updated_at: ts })
      .in('id', product_ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: product_ids.length })
  }

  // Update all products in a category — fetch IDs first, then update
  const { data: catRows, error: catErr } = await supabase
    .from('products')
    .select('id')
    .contains('categories', [category!])

  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 })
  const catIds = (catRows ?? []).map(r => r.id as string)
  if (catIds.length === 0) return NextResponse.json({ updated: 0 })

  const { error } = await supabase
    .from('products')
    .update({ hide_when_out_of_stock, updated_at: ts })
    .in('id', catIds)

  const count = catIds.length

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: count ?? 0 })
}

// GET /api/products/visibility/stats?category=
// Returns counts of hide_when_out_of_stock = true/false in a category (or globally)
export async function GET(request: Request) {
  const supabase = createServiceClient()
  const category = new URL(request.url).searchParams.get('category') ?? ''

  let q = supabase
    .from('products')
    .select('id, hide_when_out_of_stock, own_stock_quantity', { count: 'exact' })
    .eq('status', 'draft')  // include all non-archived

  // Expand to include validated + published
  q = supabase
    .from('products')
    .select('id, hide_when_out_of_stock, own_stock_quantity')

  if (category) q = (q as typeof q).contains('categories', [category])

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  return NextResponse.json({
    total:          rows.length,
    hide_enabled:   rows.filter(r => r.hide_when_out_of_stock).length,
    hide_disabled:  rows.filter(r => !r.hide_when_out_of_stock).length,
    currently_hidden: rows.filter(r => r.hide_when_out_of_stock && r.own_stock_quantity === 0).length,
  })
}
