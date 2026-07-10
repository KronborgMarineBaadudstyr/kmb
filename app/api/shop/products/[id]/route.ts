import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('products')
    .select(`
      id, name, description, short_description, categories, boat_type,
      sales_price, internal_sku, ean, manufacturer_sku, brand,
      weight, length, width, height, status,
      product_images ( url, is_primary, position ),
      product_suppliers (
        supplier_sku, purchase_price, recommended_sales_price, is_active, priority,
        suppliers ( name )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Ikke fundet' }, { status: 404 })

  return NextResponse.json(data)
}
