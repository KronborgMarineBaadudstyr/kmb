import Link from 'next/link'
import { getStore } from '@/lib/shop/store'

// Sidefod med firmaoplysninger og link til handelsbetingelser (oplysningspligt). Data fra Butiksoplysninger.
export async function ShopFooter() {
  const s = await getStore()
  return (
    <footer className="ls-footer">
      <span>
        © {new Date().getFullYear()} {s.legalName ?? s.name}
        {s.cvr && <> · CVR {s.cvr}</>}
        {s.address && <> · {s.address}</>}
        {s.email && <> · <a href={`mailto:${s.email}`}>{s.email}</a></>}
        {s.phone && <> · tlf. {s.phone}</>}
      </span>
      <nav>
        <Link href="/handelsbetingelser">Handelsbetingelser</Link>
        <Link href="/konto">Min konto</Link>
      </nav>
    </footer>
  )
}
