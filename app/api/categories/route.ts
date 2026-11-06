import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()
  const [{ data, error }, { data: ptCounts }] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('product_types').select('category_id').not('category_id', 'is', null),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Count product types per category
  const countMap: Record<string, number> = {}
  for (const pt of ptCounts ?? []) {
    if (pt.category_id) countMap[pt.category_id] = (countMap[pt.category_id] ?? 0) + 1
  }

  const result = (data ?? []).map(cat => ({ ...cat, product_type_count: countMap[cat.id] ?? 0 }))
  return NextResponse.json(result)
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
