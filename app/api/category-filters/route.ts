import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — hent alle category_attribute_filters + alle kendte kategorier fra products
export async function GET() {
  const supabase = createServiceClient()

  const [{ data: filters }, { data: cats }] = await Promise.all([
    supabase
      .from('category_attribute_filters')
      .select('*')
      .order('category')
      .order('position')
      .order('attribute_name'),
    supabase.rpc('get_all_categories'),
  ])

  // Fallback: hent kategorier manuelt hvis RPC ikke findes
  let categories: string[] = []
  if (cats) {
    categories = (cats as { category: string }[]).map(r => r.category)
  } else {
    // Hent direkte fra products (langsom fallback)
    const { data: prods } = await supabase.from('products').select('categories')
    if (prods) {
      const set = new Set<string>()
      for (const p of prods as { categories: string[] }[]) {
        for (const c of (p.categories ?? [])) set.add(c)
      }
      categories = [...set].sort()
    }
  }

  return NextResponse.json({ data: filters ?? [], categories })
}

// POST — opret ny category_attribute_filter
export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json()

  const { category, attribute_name, filter_label, use_for_search, position } = body
  if (!category || !attribute_name) {
    return NextResponse.json({ error: 'category og attribute_name er påkrævet' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('category_attribute_filters')
    .insert({
      category,
      attribute_name,
      filter_label:   filter_label   ?? null,
      use_for_search: use_for_search ?? true,
      position:       position       ?? 0,
      updated_at:     new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
