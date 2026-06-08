import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/brands — list all known brands
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('known_brands')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/brands — create a new brand
export async function POST(request: Request) {
  const supabase = createServiceClient()
  let body: { name: string; aliases?: string[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name er påkrævet' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('known_brands')
    .insert({ name: body.name.trim(), aliases: body.aliases ?? [] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// PATCH /api/brands?id=
export async function PATCH(request: Request) {
  const supabase = createServiceClient()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id påkrævet' }, { status: 400 })

  let body: { name?: string; aliases?: string[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.aliases !== undefined) updates.aliases = body.aliases

  const { data, error } = await supabase
    .from('known_brands')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/brands?id=
export async function DELETE(request: Request) {
  const supabase = createServiceClient()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id påkrævet' }, { status: 400 })

  const { error } = await supabase.from('known_brands').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
