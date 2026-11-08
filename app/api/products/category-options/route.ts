import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCategoryCounts } from '@/lib/shop/categories'

export const dynamic = 'force-dynamic'

// GET /api/products/category-options — kategoriforslag til "Rediger produkt" på shoppen
// (kategoritabellen inkl. underkategorier + alle brugte kategorier). Kræver admin (middleware.ts).
export async function GET() {
  const [{ data: catRows }, used] = await Promise.all([
    createServiceClient().from('categories').select('name, subcategories'),
    getCategoryCounts(),
  ])
  const names = new Set<string>()
  for (const c of catRows ?? []) {
    if (c.name) names.add(c.name)
    for (const sub of (c.subcategories as { name?: string }[] | null) ?? []) if (sub?.name) names.add(sub.name)
  }
  for (const u of used) names.add(u.name)
  return NextResponse.json({ options: [...names].sort((a, b) => a.localeCompare(b, 'da')) })
}
