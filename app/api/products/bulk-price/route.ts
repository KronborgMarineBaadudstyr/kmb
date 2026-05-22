import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/products/bulk-price
// Body: {
//   product_ids: string[]
//   field: 'sales_price' | 'sale_price'   — which price field to update
//   mode:  'fixed' | 'percentage' | 'amount'
//   value: number
//   category?: string                      — alt. til product_ids: alle i kategori
// }
export async function POST(request: Request) {
  const supabase = createServiceClient()
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const field    = body.field as string   // 'sales_price' | 'sale_price'
  const mode     = body.mode  as string   // 'fixed' | 'percentage' | 'amount'
  const value    = Number(body.value)
  const category = body.category as string | undefined

  if (!['sales_price', 'sale_price'].includes(field))
    return NextResponse.json({ error: 'Ugyldigt felt' }, { status: 400 })
  if (!['fixed', 'percentage', 'amount'].includes(mode))
    return NextResponse.json({ error: 'Ugyldig tilstand' }, { status: 400 })

  let productIds = (body.product_ids as string[]) ?? []

  // If category given, fetch all product ids in that category
  if (category && productIds.length === 0) {
    const { data } = await supabase
      .from('products')
      .select('id, sales_price')
      .contains('categories', [category])
    productIds = (data ?? []).map(p => p.id)
  }

  if (productIds.length === 0)
    return NextResponse.json({ error: 'Ingen produkter valgt' }, { status: 400 })

  let updated = 0
  const errors: string[] = []

  if (mode === 'fixed') {
    // Set the same fixed price on all products
    const { error, count } = await supabase
      .from('products')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .in('id', productIds)
    if (error) errors.push(error.message)
    else updated = count ?? productIds.length
  } else {
    // percentage or amount: must fetch current prices first
    const { data: products, error: fetchErr } = await supabase
      .from('products')
      .select('id, sales_price, sale_price')
      .in('id', productIds)
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    for (const p of products ?? []) {
      const current = p[field as 'sales_price' | 'sale_price'] as number | null
      if (current == null) continue // skip products without a current price

      let newPrice: number
      if (mode === 'percentage') {
        newPrice = Math.round(current * (1 + value / 100) * 100) / 100
      } else {
        // amount
        newPrice = Math.round((current + value) * 100) / 100
      }
      newPrice = Math.max(0, newPrice)

      const { error } = await supabase
        .from('products')
        .update({ [field]: newPrice, updated_at: new Date().toISOString() })
        .eq('id', p.id)
      if (error) errors.push(`${p.id}: ${error.message}`)
      else updated++
    }
  }

  return NextResponse.json({
    updated,
    errors: errors.length > 0 ? errors : undefined,
    message: `Opdaterede ${updated} produkter`,
  })
}
