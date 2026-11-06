'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

type NavItem = { href: string; label: string; icon: string }
type NavGroup = { group: string; icon: string; items: NavItem[] }
type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup {
  return 'group' in e
}

const navEntries: NavEntry[] = [
  { href: '/admin',                  label: 'Dashboard',           icon: '⊞' },

  { group: 'Import', icon: '📥', items: [
    { href: '/admin/suppliers',      label: 'Leverandører',        icon: '🏭' },
    { href: '/admin/matching',       label: 'Produkt match',       icon: '🔗' },
    { href: '/admin/staging',        label: 'Opret produkter',     icon: '✚' },
    { href: '/admin/auto-log',       label: 'Auto-handling log',   icon: '🤖' },
  ]},

  { href: '/admin/changes',          label: 'Import-ændringer',    icon: '📋' },
  { href: '/admin/products',         label: 'Produkter',           icon: '📦' },
  { href: '/admin/pricing',          label: 'Prissætning',         icon: '💰' },
  { href: '/admin/inventory',        label: 'Lagerbeholdning',     icon: '📊' },
  { href: '/admin/bundles',          label: 'Bundler & Kampagner', icon: '🏷️' },
  { href: '/admin/brands',           label: 'Brands',              icon: '🔖' },
  { href: '/admin/categories',       label: 'Kategorier',          icon: '📂' },
  { href: '/admin/navigation',       label: 'Båd-navigation',      icon: '⚓' },
  { href: '/admin/category-filters', label: 'Kategori-søgefiltre', icon: '🔍' },
  { href: '/admin/product-types',    label: 'Produkttyper',        icon: '🏷' },
  { href: '/admin/sync',             label: 'Sync & Logs',         icon: '🔄' },
]

export default function SidebarClient() {
  const pathname = usePathname()
  const router   = useRouter()

  const importPaths = ['/admin/suppliers', '/admin/matching', '/admin/staging', '/admin/auto-log']
  const importActive = importPaths.some(p => pathname.startsWith(p))
  const [importOpen, setImportOpen] = useState(importActive)

  async function handleLogout() {
    await fetch('/api/auth/login', { method: 'DELETE' })
    router.push('/login')
  }

  function isActive(href: string) {
    return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
  }

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-sm font-bold text-white">Kronborg Marine</h1>
        <p className="text-xs text-gray-400 mt-0.5">Bådudstyr — Middleware</p>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navEntries.map(entry => {
          if (!isGroup(entry)) {
            const active = isActive(entry.href)
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <span className="text-base">{entry.icon}</span>
                {entry.label}
              </Link>
            )
          }

          // Group
          const groupActive = entry.items.some(i => isActive(i.href))
          const open = entry.group === 'Import' ? importOpen : groupActive

          return (
            <div key={entry.group}>
              <button
                onClick={() => entry.group === 'Import' && setImportOpen(v => !v)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  groupActive ? 'text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <span className="text-base">{entry.icon}</span>
                <span className="flex-1 text-left">{entry.group}</span>
                <span className="text-xs text-gray-500">{open ? '▾' : '▸'}</span>
              </button>
              {open && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-700 pl-2">
                  {entry.items.map(item => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                          active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                      >
                        <span>{item.icon}</span>
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
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
