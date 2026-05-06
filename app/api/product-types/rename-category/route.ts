import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/product-types/rename-category
// Renames our_category and/or our_subcategory across all product types in bulk.
// If new_category already exists, all rows merge into it.
export async function POST(request: Request) {
  const body = await request.json() as {
    old_category:    string
    new_category:    string
    old_subcategory?: string
    new_subcategory?: string
  }

  const { old_category, new_category, old_subcategory, new_subcategory } = body

  if (!old_category || !new_category) {
    return NextResponse.json({ error: 'old_category og new_category er påkrævet' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const updatePayload = {
    our_category: new_category.trim(),
    ...(new_subcategory !== undefined ? { our_subcategory: new_subcategory.trim() || null } : {}),
  }

  // Build filter conditions
  let q = supabase
    .from('product_types')
    .update(updatePayload)
    .eq('our_category', old_category)

  if (old_subcategory !== undefined) {
    q = old_subcategory
      ? q.eq('our_subcategory', old_subcategory)
      : q.is('our_subcategory', null)
  }

  const { error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
