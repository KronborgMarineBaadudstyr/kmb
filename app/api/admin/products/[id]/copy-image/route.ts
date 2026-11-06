import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/admin/products/[id]/copy-image
// Kopierer en ekstern billed-URL direkte til product_images (ingen re-upload).
// Bruges når parent-produkt oprettes og skal arve billede fra en variant.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params
  const supabase = createServiceClient()

  let body: { url?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const url = (body.url ?? '').trim()
  if (!url) return NextResponse.json({ error: 'Ingen URL' }, { status: 400 })

  // Sæt eksisterende som ikke-primær
  await supabase
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId)

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id:  productId,
      url,
      is_primary:  true,
      position:    0,
      source:      'copied_from_variant',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
