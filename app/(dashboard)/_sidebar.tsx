'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { href: '/',          label: 'Dashboard',      icon: '⊞' },
  { href: '/products',  label: 'Produkter',       icon: '📦' },
  { href: '/suppliers', label: 'Leverandører',    icon: '🏭' },
  { href: '/staging',   label: 'Til gennemgang',  icon: '🔍' },
  { href: '/inventory', label: 'Lagerbeholdning', icon: '📊' },
  { href: '/matching',  label: 'Matching',         icon: '🔗' },
  { href: '/sync',      label: 'Sync & Logs',     icon: '🔄' },
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
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
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
        <p className="text-xs text-gray-500">kronborgmarinebaadudstyr.dk</p>
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
