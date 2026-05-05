import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/product-types — list all product types ordered by name
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/product-types — create a new product type
export async function POST(request: Request) {
  const body = await request.json() as {
    name?: string
    keywords?: string[]
    variant_attributes?: unknown[]
    our_category?: string
    our_subcategory?: string
    notes?: string
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name er påkrævet' }, { status: 400 })
  }
  if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
    return NextResponse.json({ error: 'keywords er påkrævet' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('product_types')
    .insert({
      name:               body.name.trim(),
      keywords:           body.keywords.map((k: string) => k.toLowerCase().trim()).filter(Boolean),
      variant_attributes: body.variant_attributes ?? [],
      our_category:       body.our_category?.trim() || null,
      our_subcategory:    body.our_subcategory?.trim() || null,
      notes:              body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
