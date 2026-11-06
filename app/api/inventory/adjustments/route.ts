import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/inventory/adjustments?product_id=&limit=50
export async function GET(request: Request) {
  const url       = new URL(request.url)
  const productId = url.searchParams.get('product_id') || ''
  const limit     = Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10))

  const supabase = createServiceClient()

  let q = supabase
    .from('stock_adjustments')
    .select('*, products(name, internal_sku)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (productId) q = q.eq('product_id', productId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/inventory/adjustments
// Body: { product_id, variant_id?, field, delta, reason, note }
export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json() as {
    product_id: string
    variant_id?: string | null
    field?: string
    delta: number
    reason: string
    note?: string | null
  }

  const { product_id, variant_id, field = 'own_stock_quantity', delta, reason, note } = body

  if (!product_id || typeof delta !== 'number' || delta === 0 || !reason) {
    return NextResponse.json({ error: 'product_id, delta (≠0) og reason er påkrævet' }, { status: 400 })
  }

  // Fetch current value
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('own_stock_quantity, own_stock_reserved')
    .eq('id', product_id)
    .single()

  if (fetchErr || !product) {
    return NextResponse.json({ error: 'Produkt ikke fundet' }, { status: 404 })
  }

  const currentValue = (product as Record<string, number>)[field] ?? 0
  const newValue = Math.max(0, currentValue + delta)

  // Apply adjustment to product
  const { error: updateErr } = await supabase
    .from('products')
    .update({ [field]: newValue, updated_at: new Date().toISOString() })
    .eq('id', product_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Log the adjustment
  const { data: adjustment, error: logErr } = await supabase
    .from('stock_adjustments')
    .insert({ product_id, variant_id: variant_id ?? null, field, delta, reason, note: note ?? null })
    .select()
    .single()

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  return NextResponse.json({ data: adjustment, new_value: newValue })
}
