'use client'

import { useEffect, useState } from 'react'

// Kategorier på et produkt: chips med primær (første) markeret, fjern, gør til primær, tilføj fra listen af
// brugte kategorier (datalist) eller skriv en ny. Gemmer ved hver ændring.
export function CategoryPicker({ value, onChange, saving }: { value: string[]; onChange: (next: string[]) => void; saving?: boolean }) {
  const [options, setOptions] = useState<string[]>([])
  const [loaded, setLoaded]   = useState(false)
  const [draft, setDraft]     = useState('')

  useEffect(() => {
    fetch('/api/products/category-options').then(r => r.json())
      .then(j => { setOptions((j.options ?? j.data ?? []) as string[]); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const add = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    const existing = options.find(o => o.toLowerCase() === name.toLowerCase()) ?? name
    if (!value.some(c => c.toLowerCase() === existing.toLowerCase())) onChange([...value, existing])
    setDraft('')
  }
  const isNew = (c: string) => loaded && options.length > 0 && !options.some(o => o.toLowerCase() === c.toLowerCase())

  return (
    <div className={`space-y-2 ${saving ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 && <span className="text-sm text-gray-400">Ingen kategorier</span>}
        {value.map((c, i) => (
          <span key={c} className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium border ${
            i === 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
            {i === 0 && <span title="Primær kategori — bruges i brødkrummen og til “Flere i …”">★</span>}
            {c}
            {isNew(c) && <span className="text-amber-600" title="Ny kategori — findes ikke på andre produkter endnu">(ny)</span>}
            {i > 0 && (
              <button type="button" onClick={() => onChange([c, ...value.filter(x => x !== c)])} title="Gør til primær"
                className="px-1 text-gray-400 hover:text-blue-600">☆</button>
            )}
            <button type="button" onClick={() => onChange(value.filter(x => x !== c))} title="Fjern"
              className="px-1 text-gray-400 hover:text-red-600">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm" list="pd-cat-options" value={draft} placeholder="Tilføj kategori…"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }} />
        <button type="button" onClick={() => add(draft)} disabled={!draft.trim()}
          className="px-3 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-40">Tilføj</button>
      </div>
      <datalist id="pd-cat-options">
        {options.filter(o => !value.includes(o)).map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  )
}
