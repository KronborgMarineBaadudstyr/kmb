import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/product-types/[id]
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Ikke fundet' }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/product-types/[id]
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json() as {
    name?: string
    keywords?: string[]
    variant_attributes?: unknown[]
    our_category?: string | null
    our_subcategory?: string | null
    notes?: string | null
    active?: boolean
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name !== undefined)               updates.name               = body.name.trim()
  if (body.keywords !== undefined)           updates.keywords           = body.keywords.map((k: string) => k.toLowerCase().trim()).filter(Boolean)
  if (body.variant_attributes !== undefined) updates.variant_attributes = body.variant_attributes
  if (body.our_category !== undefined)       updates.our_category       = body.our_category?.trim() || null
  if (body.our_subcategory !== undefined)    updates.our_subcategory    = body.our_subcategory?.trim() || null
  if (body.notes !== undefined)              updates.notes              = body.notes?.trim() || null
  if (body.active !== undefined)             updates.active             = body.active

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('product_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Ikke fundet' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/product-types/[id]
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('product_types')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
