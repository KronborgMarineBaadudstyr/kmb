import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select(`
      *,
      campaign_products ( id, product_id, sale_price,
        products ( id, name, internal_sku, primary_image_url, sales_price )
      )
    `)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/campaigns
// Creates a campaign and optionally applies sale_price to products.
// Body: {
//   name, description?, type, discount_type, discount_value?,
//   bundle_qty?, kit_price?, start_date?, end_date?, status?,
//   products: Array<{ product_id: string; sales_price: number; sale_price?: number }>
//   apply_prices: boolean  — if true, write sale_price back to products table
// }
export async function POST(request: Request) {
  const supabase = createServiceClient()
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  const {
    name, description, type, discount_type, discount_value,
    bundle_qty, kit_price, start_date, end_date, status = 'draft',
    products: productItems = [],
    apply_prices = false,
  } = body as {
    name: string; description?: string
    type: string; discount_type: string; discount_value?: number
    bundle_qty?: number; kit_price?: number
    start_date?: string; end_date?: string; status?: string
    products: Array<{ product_id: string; sales_price: number; sale_price?: number }>
    apply_prices: boolean
  }

  if (!name?.trim()) return NextResponse.json({ error: 'Navn er påkrævet' }, { status: 400 })

  // 1. Create campaign
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .insert({
      name: name.trim(), description, type, discount_type,
      discount_value, bundle_qty, kit_price,
      start_date: start_date || null,
      end_date:   end_date   || null,
      status,
    })
    .select()
    .single()

  if (campErr || !campaign)
    return NextResponse.json({ error: campErr?.message ?? 'Kampagne kunne ikke oprettes' }, { status: 500 })

  // 2. Create campaign_products rows
  if (productItems.length > 0) {
    const rows = productItems.map(p => ({
      campaign_id: campaign.id,
      product_id:  p.product_id,
      sale_price:  p.sale_price ?? null,
    }))
    const { error: cpErr } = await supabase.from('campaign_products').insert(rows)
    if (cpErr) {
      // Rollback campaign
      await supabase.from('campaigns').delete().eq('id', campaign.id)
      return NextResponse.json({ error: cpErr.message }, { status: 500 })
    }
  }

  // 3. If apply_prices: write computed sale_price to products.sale_price
  if (apply_prices && productItems.length > 0) {
    for (const p of productItems) {
      let salePrice = p.sale_price
      // If not explicitly provided, compute from discount
      if (salePrice == null && discount_type && discount_value != null) {
        if (discount_type === 'percentage')
          salePrice = Math.round(p.sales_price * (1 - discount_value / 100) * 100) / 100
        else if (discount_type === 'fixed_amount')
          salePrice = Math.round((p.sales_price - discount_value) * 100) / 100
        else if (discount_type === 'fixed_price')
          salePrice = discount_value
      }
      if (salePrice != null) {
        await supabase
          .from('products')
          .update({ sale_price: salePrice, updated_at: new Date().toISOString() })
          .eq('id', p.product_id)
      }
    }
  }

  return NextResponse.json({ data: campaign, products_added: productItems.length })
}
