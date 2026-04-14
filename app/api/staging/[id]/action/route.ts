import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type ActionBody = {
  action:     'match' | 'new_product' | 'reject' | 'reopen'
  product_id?: string
}

// POST /api/staging/[id]/action
// Udfør en handling på en staging-række
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action, product_id }: ActionBody = await request.json()

  const supabase = createServiceClient()

  const { data: row, error: rowErr } = await supabase
    .from('supplier_product_staging')
    .select('*')
    .eq('id', id)
    .single()

  if (rowErr || !row) {
    return NextResponse.json({ error: 'Staging-række ikke fundet' }, { status: 404 })
  }

  const raw         = row.raw_data as Record<string, unknown>
  const supplierId  = row.supplier_id as string
  const now         = new Date().toISOString()

  // ── Afvis ──
  if (action === 'reject') {
    await supabase
      .from('supplier_product_staging')
      .update({ status: 'rejected', reviewed_at: now })
      .eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // ── Genåbn (fortryd) ──
  if (action === 'reopen') {
    await supabase
      .from('supplier_product_staging')
      .update({ status: 'pending_review', reviewed_at: null, matched_product_id: null })
      .eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // ── Match til eksisterende produkt ──
  if (action === 'match') {
    if (!product_id) {
      return NextResponse.json({ error: 'product_id kræves' }, { status: 400 })
    }

    // Check om product_suppliers-rækken allerede eksisterer
    const { data: existing } = await supabase
      .from('product_suppliers')
      .select('id, priority')
      .eq('product_id', product_id)
      .eq('supplier_id', supplierId)
      .maybeSingle()

    const supplierRow = {
      supplier_id:             supplierId,
      product_id,
      supplier_sku:            raw.supplier_sku as string,
      supplier_product_name:   raw.supplier_product_name as string ?? row.normalized_name,
      purchase_price:          (raw.purchase_price as number) ?? null,
      recommended_sales_price: (raw.recommended_sales_price as number) ?? null,
      supplier_stock_quantity: (raw.supplier_stock_quantity as number) ?? 0,
      supplier_stock_reserved: 0,
      item_status:             ((raw.supplier_stock_quantity as number) ?? 0) > 0 ? 'active' : 'out_of_stock',
      supplier_images:         raw.supplier_images ?? [],
      extra_data:              row.raw_data,
      variant_id:              null,
      is_active:               true,
    }

    if (existing) {
      // Bevar priority — opdater alt andet
      const { error } = await supabase
        .from('product_suppliers')
        .update({ ...supplierRow, priority: existing.priority })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('product_suppliers')
        .insert({ ...supplierRow, priority: 1 })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabase
      .from('supplier_product_staging')
      .update({ status: 'matched', matched_product_id: product_id, reviewed_at: now })
      .eq('id', id)

    return NextResponse.json({ ok: true })
  }

  // ── Opret nyt produkt (kladde) ──
  if (action === 'new_product') {
    const categories = (raw.categories as string[]) ?? []

    // Unik intern SKU baseret på staging-rækkens UUID-prefix
    const internalSku = `DRAFT-${id.slice(0, 8).toUpperCase()}`

    const { data: newProduct, error: prodErr } = await supabase
      .from('products')
      .insert({
        internal_sku:    internalSku,
        name:            row.normalized_name as string,
        ean:             row.normalized_ean  ?? null,
        sales_price:     (raw.recommended_sales_price as number) ?? null,
        categories,
        unit:            row.normalized_unit      ?? null,
        unit_size:       row.normalized_unit_size ?? null,
        status:          'draft',
        woo_sync_status: null,
      })
      .select('id')
      .single()

    if (prodErr || !newProduct) {
      return NextResponse.json({ error: prodErr?.message ?? 'Kunne ikke oprette produkt' }, { status: 500 })
    }

    const { error: spErr } = await supabase
      .from('product_suppliers')
      .insert({
        supplier_id:             supplierId,
        product_id:              newProduct.id,
        supplier_sku:            raw.supplier_sku as string,
        supplier_product_name:   (raw.supplier_product_name as string) ?? row.normalized_name,
        purchase_price:          (raw.purchase_price as number) ?? null,
        recommended_sales_price: (raw.recommended_sales_price as number) ?? null,
        supplier_stock_quantity: (raw.supplier_stock_quantity as number) ?? 0,
        supplier_stock_reserved: 0,
        item_status:             ((raw.supplier_stock_quantity as number) ?? 0) > 0 ? 'active' : 'out_of_stock',
        supplier_images:         raw.supplier_images ?? [],
        extra_data:              row.raw_data,
        variant_id:              null,
        priority:                1,
        is_active:               true,
      })

    if (spErr) {
      // Rollback: fjern det netop oprettede produkt
      await supabase.from('products').delete().eq('id', newProduct.id)
      return NextResponse.json({ error: spErr.message }, { status: 500 })
    }

    await supabase
      .from('supplier_product_staging')
      .update({ status: 'new_product', matched_product_id: newProduct.id, reviewed_at: now })
      .eq('id', id)

    return NextResponse.json({ ok: true, product_id: newProduct.id })
  }

  return NextResponse.json({ error: 'Ukendt action' }, { status: 400 })
}
