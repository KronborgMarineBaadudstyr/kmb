import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/products/pricing
// Returns products where sales_price IS NULL, enriched with supplier pricing.
// Each product gets its active suppliers sorted by priority.
export async function GET() {
  const supabase = createServiceClient()

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, name, internal_sku, status, sales_price,
      primary_image_url,
      product_suppliers (
        id, priority, is_active,
        purchase_price, recommended_sales_price,
        supplier_sku, item_status,
        suppliers ( id, name )
      )
    `)
    .is('sales_price', null)
    .in('status', ['draft', 'validated'])
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich: find best active supplier, derive suggested price
  const enriched = (products ?? []).map(p => {
    const activeSuppliers = ((p.product_suppliers ?? []) as unknown as {
      id: string; priority: number; is_active: boolean
      purchase_price: number | null; recommended_sales_price: number | null
      supplier_sku: string; item_status: string
      suppliers: { id: string; name: string }[] | null
    }[])
      .filter(s => s.is_active)
      .sort((a, b) => a.priority - b.priority)

    const primary = activeSuppliers[0] ?? null

    // Vejl. price: use highest recommended_sales_price from active suppliers
    const vejlPrice = activeSuppliers
      .map(s => s.recommended_sales_price)
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a)[0] ?? null

    // Suggested (purchase_price × markup) — default 40%
    const purchasePrice = primary?.purchase_price ?? null

    return {
      id:             p.id,
      name:           p.name,
      internal_sku:   p.internal_sku,
      status:         p.status,
      primary_image_url: p.primary_image_url,
      sales_price:    p.sales_price,
      primary_supplier: primary ? {
        name:                    (Array.isArray(primary.suppliers) ? (primary.suppliers as { name: string }[])[0]?.name : (primary.suppliers as { name: string } | null)?.name) ?? '—',
        purchase_price:          primary.purchase_price,
        recommended_sales_price: primary.recommended_sales_price,
        supplier_sku:            primary.supplier_sku,
      } : null,
      vejl_price:     vejlPrice,
      purchase_price: purchasePrice,
      supplier_count: activeSuppliers.length,
    }
  })

  // Split: has_vejl (has recommended price) vs needs_manual (no recommended price)
  const has_vejl    = enriched.filter(p => p.vejl_price != null)
  const needs_manual = enriched.filter(p => p.vejl_price == null)

  return NextResponse.json({ has_vejl, needs_manual, total: enriched.length })
}
