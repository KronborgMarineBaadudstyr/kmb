import { createServiceClient } from '@/lib/supabase/server'
import { bulkCreateProductsFromGroups } from '@/lib/bulk-product-creator'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

// POST /api/pipeline/auto-create
export async function POST() {
  const supabase = createServiceClient()
  try {
    const result = await bulkCreateProductsFromGroups(supabase, 2000)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
