'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { href: '/admin',                  label: 'Dashboard',             icon: '⊞' },
  { href: '/admin/suppliers',        label: 'Leverandører',          icon: '🏭' },
  { href: '/admin/matching',         label: 'Produkt match',         icon: '🔗' },
  { href: '/admin/staging',          label: 'Opret produkter',       icon: '✚' },
  { href: '/admin/auto-log',         label: 'Auto-handling log',     icon: '🤖' },
  { href: '/admin/products',         label: 'Produkter',             icon: '📦' },
  { href: '/admin/pricing',          label: 'Prissætning',           icon: '💰' },
  { href: '/admin/inventory',        label: 'Lagerbeholdning',       icon: '📊' },
  { href: '/admin/changes',          label: 'Import-ændringer',      icon: '📋' },
  { href: '/admin/navigation',       label: 'Båd-navigation',        icon: '⚓' },
  { href: '/admin/bundles',          label: 'Bundler & Kampagner',   icon: '🏷️' },
  { href: '/admin/brands',           label: 'Brands',                icon: '🔖' },
  { href: '/admin/category-filters', label: 'Kategori-søgefiltre',   icon: '🔍' },
  { href: '/admin/product-types',    label: 'Produkttyper',          icon: '🏷' },
  { href: '/admin/sync',             label: 'Sync & Logs',           icon: '🔄' },
]

export default function SidebarClient() {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/login', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-sm font-bold text-white">Kronborg Marine</h1>
        <p className="text-xs text-gray-400 mt-0.5">Bådudstyr — Middleware</p>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(item => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                active ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 py-3 border-t border-gray-700 space-y-2">
        <a href="/" className="text-xs text-gray-500 hover:text-gray-300 block">← Se butik</a>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors rounded-md hover:bg-gray-700"
        >
          Log ud →
        </button>
      </div>
    </aside>
  )
}
