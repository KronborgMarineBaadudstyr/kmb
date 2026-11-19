'use client'

import { useState } from 'react'

// Kopiér tekst til udklipsholderen (varenumre til portalen, kundenummer, leveringsadresse …)
export function CopyButton({ text, label = 'Kopiér', title, className }: { text: string; label?: string; title?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" title={title}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }
        catch { window.prompt('Kopiér teksten:', text) }
      }}
      className={className ?? 'px-2 py-0.5 text-xs border border-gray-300 bg-white text-gray-600 rounded hover:bg-gray-50 whitespace-nowrap'}>
      {done ? 'Kopieret ✓' : label}
    </button>
  )
}
