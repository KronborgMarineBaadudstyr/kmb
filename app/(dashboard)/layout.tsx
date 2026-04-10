'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { href: '/',          label: 'Dashboard',      icon: '⊞' },
  { href: '/products',  label: 'Produkter',       icon: '📦' },
  { href: '/suppliers', label: 'Leverandører',    icon: '🏭' },
  { href: '/inventory', label: 'Lagerbeholdning', icon: '📊' },
  { href: '/sync',      label: 'Sync & Logs',     icon: '🔄' },
]

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname()
  const active   = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? 'bg-gray-700 text-white'
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  )
}

function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/login', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors rounded-md hover:bg-gray-700"
    >
      Log ud →
    </button>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-700">
          <h1 className="text-sm font-bold text-white">Kronborg Marine</h1>
          <p className="text-xs text-gray-400 mt-0.5">Bådudstyr — Middleware</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map(item => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-700 space-y-2">
          <p className="text-xs text-gray-500">kronborgmarinebaadudstyr.dk</p>
          <LogoutButton />
        </div>
      </aside>

      {/* Hovedindhold */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
