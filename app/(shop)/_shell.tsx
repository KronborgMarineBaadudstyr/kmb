'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useCart } from './_cart'

export function ShopHeader() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [, startTransition] = useTransition()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term) {
      startTransition(() => router.push(`/soeg?q=${encodeURIComponent(term)}`))
    }
  }

  return (
    <header className="ls-header">
      <div className="ls-header-inner">
        <Link href="/" className="ls-logo-text">
          LoveSailing<span>.dk</span>
        </Link>

        <form className="ls-search-bar" onSubmit={handleSearch}>
          <svg className="ls-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Søg vare, brand eller varenr…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </form>

        <div className="ls-header-actions">
          <Link href="/kategorier" className="ls-header-btn">Kategorier</Link>
          <Link href="/min-baad" className="ls-header-btn">Min båd</Link>
          <CartBtn />
        </div>
      </div>
    </header>
  )
}

function CartBtn() {
  const { count } = useCart()
  return (
    <Link href="/kurv" className="ls-header-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
      Kurv
      {count > 0 && <span className="ls-cart-badge">{count}</span>}
    </Link>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const { count } = useCart()

  const tabs = [
    { href: '/',           icon: <HomeIcon />,       label: 'Hjem' },
    { href: '/kategorier', icon: <GridIcon />,        label: 'Kategorier' },
    { href: '/soeg',       icon: <SearchIcon />,      label: 'Søg' },
    { href: '/kurv',       icon: <CartIcon c={count}/>, label: 'Kurv' },
    { href: '/min-baad',   icon: <UserIcon />,        label: 'Min båd' },
  ]

  return (
    <nav className="ls-bottom-nav">
      {tabs.map(t => {
        const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} className={active ? 'active' : ''}>
            {t.icon}
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

function HomeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function GridIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function SearchIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
}
function CartIcon({ c }: { c: number }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
      {c > 0 && (
        <span style={{ position:'absolute', top:-5, right:-6, background:'#c8102e', color:'#fff',
          fontSize:9, fontWeight:800, minWidth:16, height:16, borderRadius:8,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
          {c}
        </span>
      )}
    </div>
  )
}
function UserIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
