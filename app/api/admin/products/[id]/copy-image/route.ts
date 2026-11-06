import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/admin/products/[id]/copy-image
// Body: { url, is_primary?: boolean (default true), source?: string }
// Tilføjer en eksisterende billed-URL til product_images uden re-upload.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params
  const supabase = createServiceClient()

  let body: { url?: string; is_primary?: boolean; source?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const url = (body.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Ugyldig URL' }, { status: 400 })

  const isPrimary = body.is_primary !== false
  const source    = body.source === 'supplier' ? 'supplier' : 'copied_from_variant'

  const { data: existing } = await supabase
    .from('product_images')
    .select('id')
    .eq('product_id', productId)

  if (isPrimary) {
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId)
  }

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      url,
      is_primary: isPrimary,
      position:   isPrimary ? 0 : (existing ?? []).length,
      source,
    })
    .select('id, url, alt_text, is_primary, position, source, storage_path')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}
