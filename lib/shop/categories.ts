import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/server'

export type CategoryCount = { name: string; product_count: number }

// Alle brugte kategorier (ikke arkiverede/afviste produkter) med antal produkter, flest først.
// Bruger product_category_counts() (migration 063); findes den ikke endnu, tælles side for side.
// cache(): kaldes den flere gange under samme sidevisning, hentes der kun én gang.
export const getCategoryCounts = cache(async (): Promise<CategoryCount[]> => {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('product_category_counts')
  if (!error && data) return data as CategoryCount[]

  const counts = new Map<string, number>()
  for (let from = 0; from < 100_000; from += 1000) {
    const { data: rows } = await supabase.from('products').select('categories')
      .not('status', 'in', '(archived,rejected)').not('categories', 'is', null)
      .order('id').range(from, from + 999)
    for (const r of rows ?? []) for (const c of (r.categories as string[] | null) ?? []) {
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    if (!rows || rows.length < 1000) break
  }
  return [...counts.entries()]
    .map(([name, product_count]) => ({ name, product_count }))
    .sort((a, b) => b.product_count - a.product_count || a.name.localeCompare(b.name, 'da'))
})

export function slugify(s: string) {
  return s.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
