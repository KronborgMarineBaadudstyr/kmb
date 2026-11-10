import { createServiceClient } from '@/lib/supabase/server'
import { getCategoryCounts, slugify } from '@/lib/shop/categories'

// Shoppens indgang: Sejlbåd / Motorbåd → kategorier for bådtypen → kategori.
// Hvilke kategorier der hører til hvilken bådtype, styres i Sortiment → Kategorier (categories.boat_types).
// Produkter med bådtype (products.boat_type) kun for den anden bådtype skjules; produkter uden bådtype vises for begge.

export type BoatSlug = 'sejlbaad' | 'motorbaad'
export type BoatType = 'sejlbåd' | 'motorbåd'

export const BOATS: Record<BoatSlug, { type: BoatType; other: BoatType; label: string; icon: string; tagline: string }> = {
  sejlbaad:  { type: 'sejlbåd',  other: 'motorbåd', label: 'Sejlbåd',  icon: '⛵', tagline: 'Rig, sejl, dæk og alt til livet under sejl' },
  motorbaad: { type: 'motorbåd', other: 'sejlbåd',  label: 'Motorbåd', icon: '🚤', tagline: 'Motor, styring, el og udstyr til motorbåden' },
}

export const isBoatSlug = (s: unknown): s is BoatSlug => s === 'sejlbaad' || s === 'motorbaad'

export type BoatCategory = { name: string; slug: string; count: number; description: string | null; image_url: string | null }

// Kategorier for en bådtype: dem der er markeret til bådtypen (eller ikke har nogen markering) og har varer
export async function getBoatCategories(boat: BoatSlug): Promise<BoatCategory[]> {
  const { type } = BOATS[boat]
  const [{ data: rows }, counts] = await Promise.all([
    createServiceClient().from('categories').select('name, description, image_url, boat_types, sort_order, active'),
    getCategoryCounts(),
  ])
  const meta = new Map((rows ?? []).map(r => [r.name as string, r]))
  return counts
    .filter(c => {
      const m = meta.get(c.name)
      if (m && m.active === false) return false
      const types = (m?.boat_types ?? []) as string[]
      return types.length === 0 || types.includes(type)
    })
    .map(c => {
      const m = meta.get(c.name)
      return { name: c.name, slug: slugify(c.name), count: c.product_count, description: m?.description ?? null, image_url: m?.image_url ?? null, order: (m?.sort_order as number | null) ?? 9999 }
    })
    .sort((a, b) => a.order - b.order || b.count - a.count)
    .map(({ order: _order, ...c }) => c)
}
