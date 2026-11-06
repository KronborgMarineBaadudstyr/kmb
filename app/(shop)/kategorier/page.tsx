import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Kategorier' }
export const dynamic = 'force-dynamic'

function slugify(s: string) {
  return s.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const FALLBACK_ICONS: Record<string, string> = {
  'sikkerhed': '🛡️', 'tovværk': '⚓', 'anker': '⚓', 'elektronik': '📡',
  'navigation': '🧭', 'rig': '⛵', 'bådpleje': '🪣', 'vedligehold': '🔧',
  'motor': '⚙️', 'el': '💡', 'installationer': '💡', 'vand': '💧',
  'sanitet': '💧', 'komfort': '☕', 'sejlertøj': '🧥', 'tøj': '🧥',
  'vandsport': '🏄', 'gave': '🎁', 'sko': '👟',
}
function catIcon(name: string) {
  const n = name.toLowerCase()
  for (const [key, icon] of Object.entries(FALLBACK_ICONS)) {
    if (n.includes(key)) return icon
  }
  return '📦'
}

export default async function CategoriesPage() {
  const supabase = createServiceClient()

  // Hent beskrivelser og billeder fra categories-tabellen
  const { data: catRows } = await supabase
    .from('categories')
    .select('name, description, image_url')

  const descMap = new Map<string, { description: string | null; image_url: string | null }>()
  for (const row of catRows ?? []) {
    descMap.set(row.name, { description: row.description, image_url: row.image_url })
  }

  // Tæl produkter per kategori
  const { data: prodRows } = await supabase
    .from('products')
    .select('categories')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .not('categories', 'is', null)

  const counts = new Map<string, number>()
  for (const row of prodRows ?? []) {
    for (const cat of (row.categories as string[] ?? [])) {
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
  }

  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      slug: slugify(name),
      icon: catIcon(name),
      description: descMap.get(name)?.description ?? null,
      image_url:   descMap.get(name)?.image_url   ?? null,
    }))

  return (
    <>
      {/* Hero-banner */}
      <div className="ls-cat-hero">
        <div className="ls-cat-hero-content">
          <div className="ls-hero-kicker">
            <span className="ls-hero-kicker-dot" />
            Sortiment
          </div>
          <h1>Alle kategorier</h1>
          <p>{categories.length} kategorier · {[...counts.values()].reduce((a, b) => a + b, 0).toLocaleString('da-DK')} produkter</p>
        </div>
      </div>

      {/* Grid */}
      <div className="ls-catgrid-full">
        {categories.map(c => (
          <Link key={c.slug} href={`/kategorier/${c.slug}`} className="ls-cattile-full">
            <div className="ls-cattile-full-icon">
              {c.image_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.image_url} alt={c.name} />
                : <span>{c.icon}</span>}
            </div>
            <div className="ls-cattile-full-body">
              <div className="ls-cattile-full-name">{c.name}</div>
              {c.description && (
                <div className="ls-cattile-full-desc">{c.description}</div>
              )}
              <div className="ls-cattile-full-count">{c.count.toLocaleString('da-DK')} varer</div>
            </div>
            <div className="ls-cattile-full-arrow">→</div>
          </Link>
        ))}
      </div>

      <div style={{ height: 48 }} />
    </>
  )
}
