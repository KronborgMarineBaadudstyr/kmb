import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/shop/categories — returns all categories with product counts
export async function GET() {
  const supabase = createServiceClient()

  // Get all distinct categories from products
  const { data, error } = await supabase
    .from('products')
    .select('categories')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .not('categories', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Count products per category
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    for (const cat of (row.categories as string[] ?? [])) {
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
  }

  const categories = Array.from(counts.entries())
    .map(([name, count]) => ({ name, slug: slugify(name), count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ categories })
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
