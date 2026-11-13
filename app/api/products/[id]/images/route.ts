import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/products/[id]/images
// Uploader en billedfil til Supabase Storage og opretter en product_images-række.
// Body: multipart/form-data med feltet "file"
export async function POST(request: Request, { params }: Ctx) {
  const denied = await requireAdmin(); if (denied) return denied
  const { id: productId } = await params
  const supabase = createServiceClient()

  let formData: FormData
  try { formData = await request.formData() }
  catch { return NextResponse.json({ error: 'Ugyldig form data' }, { status: 400 }) }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Ingen fil' }, { status: 400 })

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
  if (!allowedTypes.includes(file.type))
    return NextResponse.json({ error: 'Filtype ikke understøttet (jpg, png, webp, gif, avif)' }, { status: 400 })

  const ext   = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path  = `products/${productId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('product-images')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadErr)
    return NextResponse.json({ error: `Upload fejlede: ${uploadErr.message}` }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(path)

  // Sæt som primær hvis ingen eksisterer
  const { data: existing } = await supabase
    .from('product_images')
    .select('id, is_primary, position')
    .eq('product_id', productId)
    .order('position')

  const hasPrimary = (existing ?? []).some(r => r.is_primary)
  const nextPos    = (existing ?? []).length

  const { data: img, error: insertErr } = await supabase
    .from('product_images')
    .insert({
      product_id:   productId,
      url:          publicUrl,
      alt_text:     null,
      is_primary:   !hasPrimary,
      position:     nextPos,
      source:       'manual',
      storage_path: path,
    })
    .select()
    .single()

  if (insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ data: img })
}

// PATCH /api/products/[id]/images
// Opdatér ét eller flere billeder (is_primary, alt_text, position)
// Body: Array<{ id: string; is_primary?: boolean; alt_text?: string; position?: number }>
export async function PATCH(request: Request, { params }: Ctx) {
  const denied = await requireAdmin(); if (denied) return denied
  const { id: productId } = await params
  const supabase = createServiceClient()

  let rows: { id: string; is_primary?: boolean; alt_text?: string; position?: number }[]
  try { rows = await request.json() }
  catch { return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 }) }

  // Hvis vi sætter en ny primær: nulstil alle andre først
  const newPrimary = rows.find(r => r.is_primary === true)
  if (newPrimary) {
    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId)
  }

  for (const row of rows) {
    const updates: Record<string, unknown> = {}
    if (row.is_primary  !== undefined) updates.is_primary = row.is_primary
    if (row.alt_text    !== undefined) updates.alt_text   = row.alt_text
    if (row.position    !== undefined) updates.position   = row.position
    if (Object.keys(updates).length > 0)
      await supabase.from('product_images').update(updates).eq('id', row.id)
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/products/[id]/images?image_id=xxx
export async function DELETE(request: Request, { params }: Ctx) {
  const denied = await requireAdmin(); if (denied) return denied
  const { id: productId } = await params
  const supabase = createServiceClient()
  const imageId  = new URL(request.url).searchParams.get('image_id')
  if (!imageId) return NextResponse.json({ error: 'image_id påkrævet' }, { status: 400 })

  // Hent storage_path så vi kan slette fra bucket
  const { data: img } = await supabase
    .from('product_images')
    .select('storage_path, is_primary')
    .eq('id', imageId)
    .eq('product_id', productId)
    .single()

  if (img?.storage_path) {
    await supabase.storage.from('product-images').remove([img.storage_path])
  }

  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Hvis primærbillede blev slettet: sæt næste billede som primær
  if (img?.is_primary) {
    const { data: remaining } = await supabase
      .from('product_images')
      .select('id')
      .eq('product_id', productId)
      .order('position')
      .limit(1)
    if (remaining?.[0]) {
      await supabase.from('product_images').update({ is_primary: true }).eq('id', remaining[0].id)
    }
  }

  return NextResponse.json({ ok: true })
}
