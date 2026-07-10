import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Kategorier' }
export const dynamic = 'force-dynamic'

const ICONS: Record<string, string> = {
  'sikkerhed': '🛡️', 'tovværk': '⚓', 'anker': '⚓', 'elektronik': '📡',
  'rig': '⛵', 'bådpleje': '🪣', 'vedligehold': '🔧', 'motor': '⚙️',
  'el ': '💡', 'installationer': '💡', 'vand': '💧', 'sanitet': '💧',
  'komfort': '☕', 'sejlertøj': '🧥', 'tøj': '🧥', 'vandsport': '🏄',
  'gave': '🎁', 'navigation': '🧭', 'sko': '👟',
}
function catIcon(name: string) {
  const n = name.toLowerCase()
  for (const [key, icon] of Object.entries(ICONS)) {
    if (n.includes(key)) return icon
  }
  return '📦'
}
function slugify(s: string) {
  return s.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default async function CategoriesPage() {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('products')
    .select('categories')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .not('categories', 'is', null)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    for (const cat of (row.categories as string[] ?? [])) {
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
  }
  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, slug: slugify(name), icon: catIcon(name) }))

  return (
    <>
      <div className="ls-listing-header">
        <h1>Alle kategorier</h1>
        <span className="ls-listing-count">{categories.length} kategorier</span>
      </div>
      <div className="ls-catgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {categories.map(c => (
          <Link key={c.slug} href={`/kategorier/${c.slug}`} className="ls-cattile">
            <div className="ls-cattile-icon">{c.icon}</div>
            <div className="ls-cattile-name">{c.name}</div>
            <div className="ls-cattile-count">{c.count.toLocaleString('da-DK')} varer</div>
          </Link>
        ))}
      </div>
      <div style={{ height: 48 }} />
    </>
  )
}
