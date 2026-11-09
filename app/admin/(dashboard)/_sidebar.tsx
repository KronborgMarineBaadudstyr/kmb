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

  { group: 'Kunder', icon: '👥', items: [
    { href: '/admin/orders',         label: 'Ordrer',              icon: '🧾' },
    { href: '/admin/customers',      label: 'Kundeliste',          icon: '👤' },
    { href: '/admin/lifecycle',      label: 'Vedligehold',         icon: '⏳' },
  ]},

  { group: 'Salg & AI', icon: '📈', items: [
    { href: '/admin/insights',       label: 'Salgsindsigt',        icon: '💡' },
    { href: '/admin/ai',             label: 'AI-assistent',        icon: '🤖' },
    { href: '/admin/ai-viden',       label: 'AI-viden',            icon: '📚' },
  ]},

  { href: '/admin/products',         label: 'Produkter',           icon: '📦' },
  { href: '/admin/pricing',          label: 'Prissætning',         icon: '💰' },
  { href: '/admin/inventory',        label: 'Lagerbeholdning',     icon: '📊' },
  { href: '/admin/purchasing',       label: 'Indkøb',              icon: '🚚' },
  { href: '/admin/bundles',          label: 'Bundler & Kampagner', icon: '🏷️' },
  { href: '/admin/navigation',       label: 'Båd-navigation',      icon: '⚓' },

  { group: 'Import', icon: '📥', items: [
    // Rækkefølgen følger flowet (samme trin som _import-flow.tsx)
    { href: '/admin/suppliers',      label: 'Leverandører',        icon: '🏭' },
    { href: '/admin/changes',        label: 'Import-ændringer',    icon: '📋' },
    { href: '/admin/matching',       label: 'Saml ens varer',      icon: '🔗' },
    { href: '/admin/staging',        label: 'Nye varer',           icon: '✚' },
    { href: '/admin/auto-log',       label: 'Automatik-log',       icon: '🤖' },
  ]},

  { group: 'Indstillinger', icon: '⚙️', items: [
    { href: '/admin/sortiment',        label: 'Sortiment',           icon: '📂' },   // kategorier, varetyper, variant-egenskaber, søgefiltre
    { href: '/admin/brands',           label: 'Brands',              icon: '🔖' },
  ]},
]

// Kun for ejere
const OWNER_ITEMS: NavItem[] = [
  { href: '/admin/ai-noegle', label: 'AI-nøgle',        icon: '🗝' },
  { href: '/admin/admins',    label: 'Administratorer', icon: '🔑' },
]

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  )
}

export default function SidebarClient({ admin }: { admin: { email: string; role: 'owner' | 'admin' } }) {
  const pathname = usePathname()
  const router   = useRouter()

  // AI-nøgle og Administratorer ligger under Indstillinger og ses kun af ejere
  const entries = navEntries.map(e =>
    isGroup(e) && e.group === 'Indstillinger' && admin.role === 'owner' ? { ...e, items: [...e.items, ...OWNER_ITEMS] } : e)

  // Grupper kan foldes ud/ind; den gruppe man står i er foldet ud fra start
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  async function handleLogout() {
    await fetch('/api/auth/login', { method: 'DELETE' })
    router.push('/login')
  }

  function isActive(href: string) {
    return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/')
  }

  function isOpen(g: NavGroup) {
    return toggled[g.group] ?? g.items.some(i => isActive(i.href))
  }

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-sm font-bold text-white">Kronborg Marine</h1>
        <p className="text-xs text-gray-400 mt-0.5">Bådudstyr — Middleware</p>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {entries.map(entry => {
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
          const open = isOpen(entry)

          return (
            <div key={entry.group}>
              <button
                onClick={() => setToggled(t => ({ ...t, [entry.group]: !open }))}
                aria-expanded={open}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  groupActive ? 'text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <span className="text-base">{entry.icon}</span>
                <span className="flex-1 text-left">{entry.group}</span>
                <Chevron open={open} />
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
        <p className="text-xs text-gray-400 truncate" title={admin.email}>{admin.email}</p>
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
