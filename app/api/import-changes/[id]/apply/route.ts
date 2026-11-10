import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/import-changes/[id]/apply
// Bruger leverandørens nye vejl. pris som vores salgspris (for varer hvor vi havde vores egen pris,
// eller hvor leverandøren ikke er den foretrukne). Kræver admin (middleware).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: row, error } = await supabase
    .from('import_change_log')
    .select('id, change_type, product_id, variant_id, new_recommended_price, our_price_old')
    .eq('id', id)
    .maybeSingle()
  if (error)  return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row)   return NextResponse.json({ error: 'Ændringen findes ikke' }, { status: 404 })
  if (row.change_type !== 'price_changed' || !row.product_id) {
    return NextResponse.json({ error: 'Ændringen er ikke knyttet til et produkt' }, { status: 400 })
  }
  const price = Number(row.new_recommended_price)
  if (!(price > 0)) return NextResponse.json({ error: 'Leverandøren har ingen ny vejl. pris' }, { status: 400 })

  const target = row.variant_id
    ? supabase.from('product_variants').select('sales_price').eq('id', row.variant_id).maybeSingle()
    : supabase.from('products').select('sales_price').eq('id', row.product_id).maybeSingle()
  const { data: current } = await target
  const before = current?.sales_price ?? null

  const upd = row.variant_id
    ? await supabase.from('product_variants').update({ sales_price: price }).eq('id', row.variant_id)
    : await supabase.from('products').update({ sales_price: price }).eq('id', row.product_id)
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 })

  await supabase.from('import_change_log')
    .update({ price_action: 'applied', our_price_old: before, our_price_new: price })
    .eq('id', id)

  return NextResponse.json({ ok: true, sales_price: price })
}
