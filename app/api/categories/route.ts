import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json() as {
    name?: string
    subcategories?: { name: string; keywords: string[] }[]
    keywords?: string[]
    boat_types?: string[]
    sort_order?: number
  }

  if (!body.name?.trim())
    return NextResponse.json({ error: 'name er påkrævet' }, { status: 400 })

  const supabase = createServiceClient()

  // Find highest sort_order for new item
  const { data: last } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const { data, error } = await supabase
    .from('categories')
    .insert({
      name:          body.name.trim(),
      subcategories: body.subcategories ?? [],
      keywords:      body.keywords ?? [],
      boat_types:    body.boat_types ?? ['sejlbåd', 'motorbåd'],
      sort_order:    body.sort_order ?? ((last?.sort_order ?? 0) + 1),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
