import Link from 'next/link'
import { BOATS, getBoatCategories, type BoatSlug } from '@/lib/shop/boat-types'
import { catIcon } from './_category-icons'

// Side for én bådtype: alle kategorier, der hører til sejlbåd eller motorbåd
export async function BoatCategoriesPage({ boat }: { boat: BoatSlug }) {
  const b = BOATS[boat]
  const otherSlug: BoatSlug = boat === 'sejlbaad' ? 'motorbaad' : 'sejlbaad'
  const categories = await getBoatCategories(boat)

  return (
    <>
      <nav className="ls-breadcrumb">
        <Link href="/">Hjem</Link>
        <span>/</span>
        <span style={{ color: 'var(--ink)' }}>{b.label}</span>
      </nav>

      <div className="ls-cat-hero">
        <div className="ls-cat-hero-content">
          <div className="ls-hero-kicker">
            <span className="ls-hero-kicker-dot" />
            {b.icon} {b.label}
          </div>
          <h1>Udstyr til {b.label.toLowerCase()}en</h1>
          <p>{b.tagline} · {categories.length} kategorier</p>
        </div>
      </div>

      <div className="ls-catgrid-full">
        {categories.map(c => (
          <Link key={c.slug} href={`/kategorier/${c.slug}?baad=${boat}`} className="ls-cattile-full">
            <div className="ls-cattile-full-icon">
              {c.image_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.image_url} alt={c.name} />
                : <span>{catIcon(c.name)}</span>}
            </div>
            <div className="ls-cattile-full-body">
              <div className="ls-cattile-full-name">{c.name}</div>
              {c.description && <div className="ls-cattile-full-desc">{c.description}</div>}
              <div className="ls-cattile-full-count">{c.count.toLocaleString('da-DK')} varer</div>
            </div>
            <div className="ls-cattile-full-arrow">→</div>
          </Link>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 14 }}>
        <Link href={`/${otherSlug}`}>{BOATS[otherSlug].icon} Se udstyr til {BOATS[otherSlug].label.toLowerCase()}</Link>
        {' · '}
        <Link href="/kategorier">Alle kategorier</Link>
      </p>
      <div style={{ height: 48 }} />
    </>
  )
}
