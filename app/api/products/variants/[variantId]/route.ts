import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED_FIELDS = ['attributes', 'ean', 'sales_price', 'sale_price', 'own_stock_quantity', 'own_stock_reserved', 'weight', 'status', 'hide_when_out_of_stock']

// PATCH /api/products/variants/[variantId]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> }
) {
  const { variantId } = await params
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = body[field]
    }
  }

  const { data, error } = await supabase
    .from('product_variants')
    .update(updates)
    .eq('id', variantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
