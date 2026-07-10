'use client'

import { useEffect, useState } from 'react'

type FilterRow = {
  id:             string
  category:       string
  attribute_name: string
  filter_label:   string | null
  use_for_search: boolean
  position:       number
  updated_at:     string
}

// ── Inline edit ────────────────────────────────────────────────────────────────
function InlineText({ value, onSave, placeholder, mono }: {
  value: string | null; onSave: (v: string | null) => void; placeholder?: string; mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')
  const ref = { current: null as HTMLInputElement | null }

  function open()   { setDraft(value ?? ''); setEditing(true); setTimeout(() => ref.current?.focus(), 0) }
  function commit() { setEditing(false); const v = draft.trim() || null; if (v !== value) onSave(v) }

  if (editing) return (
    <input ref={r => { ref.current = r }} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      placeholder={placeholder}
      className={`px-2 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 w-full bg-white ${mono ? 'font-mono' : ''}`} />
  )
  return (
    <button onClick={open}
      className={`text-left w-full px-1 -mx-1 py-0.5 rounded text-xs hover:bg-blue-50 transition-colors ${
        value ? (mono ? 'font-mono text-gray-700' : 'text-gray-900') : 'text-gray-300'
      }`}>
      {value || placeholder || '—'}
    </button>
  )
}

// ── Add form ───────────────────────────────────────────────────────────────────
function AddFilterForm({ categories, onAdded }: {
  categories: string[]
  onAdded: (row: FilterRow) => void
}) {
  const [category,  setCategory]  = useState('')
  const [attrName,  setAttrName]  = useState('')
  const [label,     setLabel]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !attrName.trim()) { setError('Kategori og attributnavn er påkrævet'); return }
    setSaving(true); setError(null)

    const res = await fetch('/api/category-filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, attribute_name: attrName.trim(), filter_label: label.trim() || null }),
    })
    const json = await res.json()
    if (json.error) { setError(json.error); setSaving(false); return }

    onAdded(json.data as FilterRow)
    setCategory(''); setAttrName(''); setLabel('')
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="flex gap-2 items-end flex-wrap bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex-1 min-w-36">
        <label className="block text-xs text-gray-500 mb-1 font-medium">Kategori</label>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
          <option value="">Vælg kategori…</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__custom__">— Skriv kategori manuelt —</option>
        </select>
        {category === '__custom__' && (
          <input className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="kategori-navn" onChange={e => setCategory(e.target.value)} autoFocus />
        )}
      </div>
      <div className="flex-1 min-w-28">
        <label className="block text-xs text-gray-500 mb-1 font-medium">Attributnavn</label>
        <input value={attrName} onChange={e => setAttrName(e.target.value)}
          placeholder="fx Størrelse, Farve"
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>
      <div className="flex-1 min-w-28">
        <label className="block text-xs text-gray-500 mb-1 font-medium">Filterlabel <span className="text-gray-300 font-normal">(valgfrit)</span></label>
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder="fx Diameter (mm)"
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>
      <div>
        <button type="submit" disabled={saving || !category || !attrName.trim()}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 transition-colors">
          {saving ? 'Tilføjer…' : '+ Tilføj'}
        </button>
      </div>
      {error && <p className="w-full text-xs text-red-500">{error}</p>}
    </form>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CategoryFiltersPage() {
  const [rows,       setRows]       = useState<FilterRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')

  useEffect(() => {
    fetch('/api/category-filters')
      .then(r => r.json())
      .then(j => {
        setRows(j.data ?? [])
        setCategories(j.categories ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  async function patch(id: string, fields: Partial<FilterRow>) {
    const res = await fetch(`/api/category-filters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const json = await res.json()
    if (!json.error) setRows(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r))
  }

  async function remove(id: string) {
    await fetch(`/api/category-filters/${id}`, { method: 'DELETE' })
    setRows(prev => prev.filter(r => r.id !== id))
  }

  // Group by category for display
  const filtered = rows.filter(r =>
    !search || r.category.toLowerCase().includes(search.toLowerCase()) ||
    r.attribute_name.toLowerCase().includes(search.toLowerCase())
  )

  const byCat = filtered.reduce<Record<string, FilterRow[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  const sortedCats = Object.keys(byCat).sort()

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Kategori-søgefiltre</h1>
        <p className="text-sm text-gray-500">
          Angiv hvilke variant-attributter der eksponeres som søgefiltre per kategori i shoppen.
          Bruges ved WooCommerce-sync til at konfigurere attribut-filtre i layered navigation.
        </p>
      </div>

      <div className="mb-6">
        <AddFilterForm categories={categories} onAdded={row => setRows(prev => [...prev, row])} />
      </div>

      {rows.length > 0 && (
        <div className="mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Søg kategori eller attribut…"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 w-72" />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Henter…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏷️</p>
          <p className="font-medium text-gray-500">Ingen søgefiltre konfigureret endnu</p>
          <p className="text-sm mt-1">Tilføj en kategori og et attributnavn herover</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedCats.map(cat => (
            <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{cat}</h3>
                <span className="text-xs text-gray-400">{byCat[cat].length} attribut{byCat[cat].length !== 1 ? 'ter' : ''}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-2 w-40">Attribut</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">Filterlabel i shop</th>
                    <th className="text-center text-xs font-medium text-gray-400 px-4 py-2 w-28">Søgefilter</th>
                    <th className="text-center text-xs font-medium text-gray-400 px-4 py-2 w-20">Pos.</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {byCat[cat].sort((a, b) => a.position - b.position || a.attribute_name.localeCompare(b.attribute_name)).map(row => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 group transition-colors">
                      <td className="px-4 py-2">
                        <span className="text-xs font-medium text-gray-700 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          {row.attribute_name}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <InlineText
                          value={row.filter_label}
                          placeholder={row.attribute_name}
                          onSave={v => patch(row.id, { filter_label: v })} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => patch(row.id, { use_for_search: !row.use_for_search })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            row.use_for_search ? 'bg-blue-600' : 'bg-gray-200'
                          }`}
                          title={row.use_for_search ? 'Deaktiver som søgefilter' : 'Aktiver som søgefilter'}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                            row.use_for_search ? 'translate-x-[18px]' : 'translate-x-[2px]'
                          }`} />
                        </button>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number" min={0} max={99}
                          defaultValue={row.position}
                          onBlur={e => {
                            const v = parseInt(e.target.value, 10)
                            if (!isNaN(v) && v !== row.position) patch(row.id, { position: v })
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="w-12 text-center text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => remove(row.id)}
                          className="text-gray-200 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Slet">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Sådan bruges konfigurationen:</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-600">
            <li>Attributter med <strong>Søgefilter = ON</strong> markeres som filtrerbare i WooCommerce ved sync</li>
            <li>Filterlabel bruges som visningsnavn i shoppens filterpanel (layered navigation)</li>
            <li>Position styrer rækkefølgen af filtre i filterpanelet</li>
            <li>Attributter skal matche navne på produkt-varianter præcist (store/kleine bogstaver tæller)</li>
          </ul>
        </div>
      )}
    </div>
  )
}
