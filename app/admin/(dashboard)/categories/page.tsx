'use client'

import { useState, useEffect, useCallback } from 'react'

type Subcategory = { name: string; keywords: string[]; boat_types?: string[] }

type CategoryRow = {
  id: string
  name: string
  subcategories: Subcategory[]
  keywords: string[]
  boat_types: string[]
  sort_order: number
  active: boolean
  image_url?: string | null
  description?: string | null
  product_type_count?: number
}

const BOAT_TYPE_OPTIONS = ['sejlbåd', 'motorbåd']

// ── Inline text editor ────────────────────────────────────────────────────────
function InlineText({
  value, onSave, placeholder, className = '',
}: {
  value: string; onSave: (v: string) => void; placeholder?: string; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim())
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value) } }}
        placeholder={placeholder}
        className={`border border-blue-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white ${className}`}
      />
    )
  }
  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className={`text-left rounded px-1 -mx-1 hover:bg-blue-50 transition-colors ${className}`}
      title="Klik for at redigere"
    >
      {value || <span className="text-gray-300">{placeholder}</span>}
    </button>
  )
}

// ── Inline textarea editor ────────────────────────────────────────────────────
function InlineTextarea({
  value, onSave, placeholder, className = '',
}: {
  value: string | null | undefined; onSave: (v: string | null) => void; placeholder?: string; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  function commit() {
    setEditing(false)
    const v = draft.trim() || null
    if (v !== (value ?? null)) onSave(v)
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(value ?? '') } }}
        placeholder={placeholder}
        className={`border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white w-full resize-none ${className}`}
      />
    )
  }
  return (
    <button
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className={`text-left rounded px-1 -mx-1 hover:bg-blue-50 transition-colors w-full ${className}`}
      title="Klik for at redigere"
    >
      {value
        ? <span className="text-gray-700 text-sm whitespace-pre-wrap">{value}</span>
        : <span className="text-gray-300 text-sm italic">{placeholder ?? '—'}</span>
      }
    </button>
  )
}

// ── Keyword tag list ──────────────────────────────────────────────────────────
function KeywordTags({
  keywords, onChange,
}: {
  keywords: string[]; onChange: (kw: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function add() {
    const kw = draft.trim().toLowerCase()
    if (kw && !keywords.includes(kw)) onChange([...keywords, kw])
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {keywords.map(kw => (
        <span key={kw} className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
          {kw}
          <button onClick={() => onChange(keywords.filter(k => k !== kw))} className="text-gray-400 hover:text-red-500 ml-0.5 leading-none">×</button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft.trim()) add(); else setAdding(false) }}
          onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false) }}
          placeholder="nøgleord…"
          className="border border-blue-300 rounded px-2 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-blue-500 hover:text-blue-700 px-1">+ tilføj</button>
      )}
    </div>
  )
}

// ── Subcategory editor ────────────────────────────────────────────────────────
function SubcatEditor({
  subcategories, onChange,
}: {
  subcategories: Subcategory[]; onChange: (s: Subcategory[]) => void
}) {
  function update(i: number, patch: Partial<Subcategory>) {
    const next = [...subcategories]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function toggleBoatType(i: number, bt: string) {
    const current = subcategories[i].boat_types ?? []
    const next = current.includes(bt) ? current.filter(t => t !== bt) : [...current, bt]
    update(i, { boat_types: next })
  }
  function remove(i: number) {
    onChange(subcategories.filter((_, j) => j !== i))
  }
  function add() {
    onChange([...subcategories, { name: 'Ny underkategori', keywords: [], boat_types: ['sejlbåd', 'motorbåd'] }])
  }

  return (
    <div className="space-y-2">
      {subcategories.map((sub, i) => {
        const boatTypes = sub.boat_types ?? ['sejlbåd', 'motorbåd']
        return (
          <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2">
            <div className="w-5 text-xs text-gray-400 pt-1 shrink-0">{i + 1}</div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <InlineText
                value={sub.name}
                onSave={name => update(i, { name })}
                placeholder="Navn på underkategori"
                className="font-medium text-sm text-gray-800 w-full"
              />
              {/* Boat types per subcategory */}
              <div className="flex gap-1.5 flex-wrap">
                {BOAT_TYPE_OPTIONS.map(bt => (
                  <button
                    key={bt}
                    onClick={() => toggleBoatType(i, bt)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      boatTypes.includes(bt)
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {bt}
                  </button>
                ))}
              </div>
              <KeywordTags
                keywords={sub.keywords}
                onChange={kw => update(i, { keywords: kw })}
              />
            </div>
            <button
              onClick={() => remove(i)}
              className="text-gray-300 hover:text-red-500 text-sm shrink-0 mt-0.5"
              title="Slet underkategori"
            >✕</button>
          </div>
        )
      })}
      <button
        onClick={add}
        className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-dashed border-blue-200 rounded-lg w-full hover:bg-blue-50 transition-colors"
      >
        + Tilføj underkategori
      </button>
    </div>
  )
}

// ── Category row ──────────────────────────────────────────────────────────────
function CategoryCard({
  cat, onUpdate, onDelete,
}: {
  cat: CategoryRow
  onUpdate: (id: string, patch: Partial<CategoryRow>) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localSubcats, setLocalSubcats] = useState(cat.subcategories)
  const [localKeywords, setLocalKeywords] = useState(cat.keywords)
  const [localBoatTypes, setLocalBoatTypes] = useState(cat.boat_types)
  const [dirty, setDirty] = useState(false)

  async function patch(fields: Partial<CategoryRow>) {
    setSaving(true)
    await fetch(`/api/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    onUpdate(cat.id, fields)
    setSaving(false)
  }

  async function saveExpanded() {
    await patch({ subcategories: localSubcats, keywords: localKeywords, boat_types: localBoatTypes })
    setDirty(false)
  }

  function toggleBoatType(bt: string) {
    const next = localBoatTypes.includes(bt)
      ? localBoatTypes.filter(t => t !== bt)
      : [...localBoatTypes, bt]
    setLocalBoatTypes(next)
    setDirty(true)
  }

  const boatLabel = localBoatTypes.length === 2
    ? 'Begge båttyper'
    : localBoatTypes[0] === 'sejlbåd' ? 'Kun sejlbåde' : localBoatTypes[0] === 'motorbåd' ? 'Kun motorbåde' : 'Ingen båttype'

  return (
    <div className={`border rounded-xl overflow-hidden transition-shadow ${expanded ? 'shadow-md' : 'shadow-sm hover:shadow'} ${!cat.active ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <span className="text-xs text-gray-300 w-6 text-right shrink-0">{cat.sort_order}</span>

        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          {/* Category image thumbnail */}
          {cat.image_url
            ? <img src={cat.image_url} alt={cat.name} className="w-8 h-8 rounded-md object-cover shrink-0 border border-gray-100" />
            : <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center shrink-0 text-gray-300 text-xs">📂</div>
          }
          <InlineText
            value={cat.name}
            onSave={name => patch({ name })}
            className="font-semibold text-gray-900 text-base"
          />
          <span className="text-xs text-gray-400 shrink-0">
            {cat.subcategories.length} underkategorier
            {(cat.product_type_count ?? 0) > 0 && ` · ${cat.product_type_count} produkttyper`}
          </span>
        </button>

        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
          localBoatTypes.length === 2 ? 'bg-blue-50 text-blue-600' :
          localBoatTypes[0] === 'sejlbåd' ? 'bg-sky-50 text-sky-600' :
          'bg-orange-50 text-orange-600'
        }`}>
          {boatLabel}
        </span>

        <button
          onClick={() => patch({ active: !cat.active })}
          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${cat.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}
          title={cat.active ? 'Aktiv — klik for at deaktivere' : 'Inaktiv — klik for at aktivere'}
        >
          {cat.active ? 'Aktiv' : 'Inaktiv'}
        </button>

        <button
          onClick={() => onDelete(cat.id)}
          className="text-gray-300 hover:text-red-500 text-sm shrink-0"
          title="Slet kategori"
        >✕</button>

        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 text-sm shrink-0">
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t bg-gray-50 px-4 py-4 space-y-5">

          {/* Image + Description row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Kategori-billede (URL)</div>
              <input
                type="url"
                defaultValue={cat.image_url ?? ''}
                placeholder="https://…"
                onBlur={e => {
                  const v = e.target.value.trim() || null
                  if (v !== (cat.image_url ?? null)) patch({ image_url: v })
                }}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
              {cat.image_url && (
                <img src={cat.image_url} alt={cat.name} className="mt-2 w-full max-h-32 object-cover rounded-lg border border-gray-100" />
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Beskrivelse</div>
              <InlineTextarea
                value={cat.description}
                onSave={v => patch({ description: v })}
                placeholder="Klik for at tilføje beskrivelse…"
                className="min-h-[80px]"
              />
            </div>
          </div>

          {/* Boat types */}
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Båttype (kategori-niveau)</div>
            <div className="flex gap-2">
              {BOAT_TYPE_OPTIONS.map(bt => (
                <button
                  key={bt}
                  onClick={() => toggleBoatType(bt)}
                  className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                    localBoatTypes.includes(bt)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {bt}
                </button>
              ))}
            </div>
          </div>

          {/* Top-level keywords */}
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Nøgleord (kategori-niveau)</div>
            <KeywordTags
              keywords={localKeywords}
              onChange={kw => { setLocalKeywords(kw); setDirty(true) }}
            />
          </div>

          {/* Subcategories */}
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Underkategorier</div>
            <SubcatEditor
              subcategories={localSubcats}
              onChange={s => { setLocalSubcats(s); setDirty(true) }}
            />
          </div>

          {/* Save */}
          {dirty && (
            <div className="flex justify-end">
              <button
                onClick={saveExpanded}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Gemmer…' : 'Gem ændringer'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add category form ─────────────────────────────────────────────────────────
function AddCategoryForm({ onAdded }: { onAdded: (cat: CategoryRow) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [boatTypes, setBoatTypes] = useState<string[]>(['sejlbåd', 'motorbåd'])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) { setErr('Navn er påkrævet'); return }
    setSaving(true)
    setErr(null)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), boat_types: boatTypes }),
    })
    if (!res.ok) { const j = await res.json() as { error: string }; setErr(j.error); setSaving(false); return }
    const cat = await res.json() as CategoryRow
    onAdded(cat)
    setName('')
    setBoatTypes(['sejlbåd', 'motorbåd'])
    setOpen(false)
    setSaving(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
      >
        + Opret ny kategori
      </button>
    )
  }

  return (
    <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
      <div className="text-sm font-semibold text-blue-800">Ny kategori</div>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="Kategori navn…"
        className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      />
      <div className="flex gap-2">
        {BOAT_TYPE_OPTIONS.map(bt => (
          <button
            key={bt}
            onClick={() => setBoatTypes(prev => prev.includes(bt) ? prev.filter(t => t !== bt) : [...prev, bt])}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              boatTypes.includes(bt) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {bt}
          </button>
        ))}
      </div>
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="text-sm text-gray-500 px-3 py-1.5 hover:text-gray-700">Annuller</button>
        <button
          onClick={submit}
          disabled={saving}
          className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Opretter…' : 'Opret'}
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/categories')
    const data = await res.json() as CategoryRow[]
    setCategories(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleUpdate(id: string, patch: Partial<CategoryRow>) {
    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  async function handleDelete(id: string) {
    const cat = categories.find(c => c.id === id)
    if (!confirm(`Slet kategorien "${cat?.name}"? Dette kan ikke fortrydes.`)) return
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    setCategories(cats => cats.filter(c => c.id !== id))
  }

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kategorier</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {categories.length} kategorier · bruges til automatisk klassificering af produkter
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Søg kategori…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">{categories.filter(c => c.active).length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Aktive kategorier</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">
            {categories.reduce((n, c) => n + c.subcategories.length, 0)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Underkategorier i alt</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">
            {categories.filter(c => c.description).length}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Med beskrivelse</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Henter kategorier…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cat => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
          <AddCategoryForm onAdded={cat => setCategories(prev => [...prev, cat])} />
        </div>
      )}
    </div>
  )
}
