'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Trin-bjælke øverst på import-siderne, så man kan se hvor i flowet man er.
// Rækkefølgen og navnene skal matche Import-gruppen i _sidebar.tsx.
export const IMPORT_STEPS = [
  { href: '/admin/suppliers', label: 'Leverandører',     hint: 'Hent varer, priser og lager ind' },
  { href: '/admin/changes',   label: 'Import-ændringer', hint: 'Se hvad den seneste import ændrede' },
  { href: '/admin/matching',  label: 'Saml ens varer',   hint: 'Samme vare hos flere leverandører → ét produkt' },
  { href: '/admin/staging',   label: 'Nye varer',        hint: 'Varer uden match: opret, tilknyt eller afvis' },
]

export function ImportFlow({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  const current  = IMPORT_STEPS.findIndex(s => pathname === s.href || pathname.startsWith(s.href + '/'))

  return (
    <nav aria-label="Import-flow" className={`flex items-stretch gap-1.5 overflow-x-auto ${className}`}>
      {IMPORT_STEPS.map((s, i) => {
        const active = i === current
        return (
          <Link key={s.href} href={s.href} aria-current={active ? 'step' : undefined}
            className={`group flex items-start gap-2 min-w-[11rem] flex-1 rounded-lg border px-3 py-2 transition-colors ${
              active ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
            }`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              active ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
            }`}>{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{s.label}</span>
              <span className={`block text-xs leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>{s.hint}</span>
            </span>
          </Link>
        )
      })}
      <Link href="/admin/auto-log"
        className={`flex items-center shrink-0 rounded-lg border px-3 py-2 text-xs ${
          pathname.startsWith('/admin/auto-log') ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-dashed border-gray-300 text-gray-500 hover:text-gray-800'
        }`}>
        🤖 Automatik-log
      </Link>
    </nav>
  )
}
