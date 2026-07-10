import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/auto-actions/[id]
// body: { action: 'revert' }  — fortryder den automatiske handling
export async function PATCH(request: Request, { params }: Params) {
  const { id }  = await params
  const body    = await request.json() as { action: 'revert' }
  const supabase = createServiceClient()

  if (body.action !== 'revert') {
    return NextResponse.json({ error: 'Ukendt action' }, { status: 400 })
  }

  // Fetch the action record
  const { data: action, error: aErr } = await supabase
    .from('pipeline_auto_actions')
    .select('*')
    .eq('id', id)
    .single()

  if (aErr || !action) return NextResponse.json({ error: 'Ikke fundet' }, { status: 404 })
  if (action.status === 'reverted') return NextResponse.json({ error: 'Allerede fortrudt' }, { status: 409 })

  const now = new Date().toISOString()

  if (action.action_type === 'auto_match') {
    // Remove the product_supplier link that was created
    await supabase
      .from('product_suppliers')
      .delete()
      .eq('product_id', action.product_id)
      .eq('supplier_id', action.supplier_id)

    // Return staging row to pending_review
    if (action.staging_id) {
      await supabase
        .from('supplier_product_staging')
        .update({ status: 'pending_review', updated_at: now })
        .eq('id', action.staging_id)
    }
  }

  if (action.action_type === 'auto_create') {
    // Archive the auto-created product
    await supabase
      .from('products')
      .update({ status: 'archived', updated_at: now })
      .eq('id', action.product_id)

    // Return staging row to pending_review
    if (action.staging_id) {
      await supabase
        .from('supplier_product_staging')
        .update({ status: 'pending_review', updated_at: now })
        .eq('id', action.staging_id)
    }
  }

  // Mark action as reverted
  await supabase
    .from('pipeline_auto_actions')
    .update({ status: 'reverted', reverted_at: now })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
