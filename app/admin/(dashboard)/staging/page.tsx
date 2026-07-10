'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type StagingRow = {
  id:              string
  supplier_id:     string
  normalized_name: string
  normalized_ean:  string | null
  normalized_sku:  string
  status:          string
  created_at:      string
  suppliers:       { name: string }
  raw_data:        Record<string, unknown>
}

type ProductMatch = {
  id:           string
  name:         string
  internal_sku: string
  score:        number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(val: unknown) {
  const n = Number(val)
  return isNaN(n) || !val ? '—' : `${n.toLocaleString('da-DK', { minimumFractionDigits: 0 })} kr`
}

// ── Variant guide ─────────────────────────────────────────────────────────────

function VariantGuide() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        <span>ℹ️</span> Hvornår er noget en variant?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-40 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 text-sm">
            <h4 className="font-semibold text-gray-900 mb-2">Hvornår opretter du som variant?</h4>
            <p className="text-gray-600 mb-3 text-xs leading-relaxed">
              En variant er det samme produkt i en anden udførelse. Typiske variant-akser:
            </p>
            <div className="space-y-1.5 mb-3">
              {[
                ['📐 Størrelse / mål', 'Ankerkæde 8mm vs 10mm vs 12mm'],
                ['🎨 Farve', 'Fender hvid vs sort vs rød'],
                ['🔩 Materiale', 'Beslag i krom vs messing vs sort'],
                ['⭕ Diameter / tykkelse', 'Tov 12mm vs 16mm'],
                ['🏷 Brand + attribut', 'Roca krom vs no-name messing'],
              ].map(([icon, ex]) => (
                <div key={icon} className="flex gap-2 text-xs">
                  <span className="shrink-0 w-36 text-gray-700 font-medium">{icon}</span>
                  <span className="text-gray-500">{ex}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-2 mt-2">
              <p className="text-xs text-gray-500 leading-relaxed">
                <strong className="text-gray-700">Brand alene er IKKE en variant.</strong> "Musto redningsvest" og "Helly Hansen redningsvest" er to separate produkter.<br /><br />
                <strong className="text-gray-700">Tilknyt som ekstra leverandør</strong> når det er præcis samme fysiske produkt — bare indkøbt fra en anden leverandør (typisk samme EAN).
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Product search + action panel ─────────────────────────────────────────────

function ActionPanel({
  row,
  onDone,
}: {
  row:    StagingRow
  onDone: () => void
}) {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<ProductMatch[]>([])
  const [searching,   setSearching]   = useState(false)
  const [selected,    setSelected]    = useState<ProductMatch | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState<{ text: string; ok: boolean } | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(q: string) {
    setQuery(q)
    setSelected(null)
    if (!q.trim()) { setResults([]); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setSearching(true)
      const res  = await fetch(`/api/shop/products?search=${encodeURIComponent(q)}&limit=8`)
      const json = await res.json()
      setResults((json.products ?? []).map((p: { id: string; name: string; internal_sku: string }) => ({
        id: p.id, name: p.name, internal_sku: p.internal_sku, score: 1,
      })))
      setSearching(false)
    }, 300)
  }

  async function doAction(actionType: 'match' | 'new_product' | 'variant') {
    setSaving(true)
    setMsg(null)

    const body: Record<string, unknown> = { action: actionType }
    if (actionType === 'match' || actionType === 'variant') {
      if (!selected) { setMsg({ text: 'Vælg et produkt først', ok: false }); setSaving(false); return }
      body.product_id   = selected.id
      body.product_name = selected.name
      if (actionType === 'variant') body.as_variant = true
    }

    const res = await fetch(`/api/staging/${row.id}/action`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    setSaving(false)
    if (res.ok) {
      setMsg({ text: actionType === 'new_product' ? 'Oprettet som nyt produkt ✓' : actionType === 'variant' ? 'Tilknyttet som variant ✓' : 'Tilknyttet som leverandør ✓', ok: true })
      setTimeout(onDone, 800)
    } else {
      const j = await res.json()
      setMsg({ text: j.error ?? 'Fejl', ok: false })
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      {/* Search existing */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Søg i eksisterende produkter</label>
        <input
          type="search"
          placeholder="Produktnavn, varenr. eller EAN…"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searching && <p className="text-xs text-gray-400 mt-1">Søger…</p>}
        {results.length > 0 && !selected && (
          <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto bg-white shadow-sm">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => { setSelected(r); setQuery(r.name); setResults([]) }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
              >
                <span className="font-medium text-gray-800">{r.name}</span>
                <span className="text-xs text-gray-400 ml-2">{r.internal_sku}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {msg ? (
        <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          {selected ? (
            <>
              <div className="w-full text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-800">
                Valgt: <strong>{selected.name}</strong>
                <button onClick={() => { setSelected(null); setQuery('') }} className="ml-2 text-blue-400 hover:text-blue-600">× Fjern</button>
              </div>
              <button
                onClick={() => doAction('match')}
                disabled={saving}
                className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                Tilknyt som ekstra leverandør
              </button>
              <button
                onClick={() => doAction('variant')}
                disabled={saving}
                className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40"
              >
                Tilknyt som variant
              </button>
              <VariantGuide />
            </>
          ) : (
            <button
              onClick={() => doAction('new_product')}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40"
            >
              {saving ? 'Opretter…' : 'Opret som nyt produkt'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Row card ─────────────────────────────────────────────────────────────────

function StagingCard({
  row,
  selected,
  onSelect,
  onDone,
}: {
  row:      StagingRow
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  onDone:   () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const rd  = row.raw_data
  const qty = Number(rd.supplier_stock_quantity ?? 0)

  return (
    <div className={`border rounded-xl bg-white transition-colors ${selected ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200'}`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onSelect(row.id, e.target.checked)}
          className="mt-1 rounded border-gray-300 cursor-pointer shrink-0"
        />
        <div className="flex-1 min-w-0">
          {/* Name + supplier */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">{row.suppliers?.name ?? '—'}</span>
              <h3 className="text-sm font-semibold text-gray-900 leading-snug mt-0.5">{row.normalized_name}</h3>
            </div>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
            >
              {expanded ? '▲ Mindre' : '▼ Detaljer'}
            </button>
          </div>

          {/* Key facts */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {row.normalized_ean && <span>EAN: <span className="font-mono text-gray-700">{row.normalized_ean}</span></span>}
            <span>Varenr: <span className="font-mono text-gray-700">{row.normalized_sku}</span></span>
            {rd.purchase_price != null && <span>Indkøb: <span className="text-gray-700">{fmtPrice(rd.purchase_price)}</span></span>}
            {rd.recommended_sales_price != null && <span>Vejl: <span className="text-gray-700">{fmtPrice(rd.recommended_sales_price)}</span></span>}
            <span className={qty > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>Lager: {qty}</span>
            {rd.brand != null && <span>Brand: <span className="text-gray-700">{String(rd.brand as string)}</span></span>}
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-1">
              {rd.description && (
                <p className="text-gray-500 leading-relaxed line-clamp-4">{String(rd.description).replace(/\\n/g, ' ').replace(/\*\*/g, '')}</p>
              )}
              {(rd.weight || rd.length || rd.width || rd.height) && (
                <p>Mål: {[rd.weight && `${rd.weight} kg`, rd.length && `${rd.length}×${rd.width}×${rd.height} cm`].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          )}

          <ActionPanel row={row} onDone={onDone} />
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'single' | 'multi'

export default function OpretProdukterPage() {
  const [rows,        setRows]        = useState<StagingRow[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(false)
  const [filter,      setFilter]      = useState<FilterType>('all')
  const [search,      setSearch]      = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSaving,  setBulkSaving]  = useState(false)
  const [bulkMsg,     setBulkMsg]     = useState<string | null>(null)
  const [counts,      setCounts]      = useState({ all: 0, single: 0, multi: 0 })

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setSelectedIds(new Set())
    const params = new URLSearchParams({
      status:   'pending_review',
      page:     String(page),
      per_page: '30',
      ...(search ? { search } : {}),
    })
    const res  = await fetch(`/api/staging?${params}`)
    const json = await res.json()

    let data: StagingRow[] = json.data ?? []

    // Client-side filter for single/multi (supplier_count not in staging API, use raw heuristic)
    // Single = only one staging row with this EAN or name in the set — approximate via no match_group
    // For now, filter is informational: single = no normalized_ean duplicate in this batch
    if (filter === 'single') {
      const eanCount = new Map<string, number>()
      data.forEach(r => { if (r.normalized_ean) eanCount.set(r.normalized_ean, (eanCount.get(r.normalized_ean) ?? 0) + 1) })
      data = data.filter(r => !r.normalized_ean || (eanCount.get(r.normalized_ean) ?? 1) === 1)
    }

    setRows(data)
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    setCounts({ all: json.total ?? 0, single: json.single_count ?? 0, multi: json.multi_count ?? 0 })
    setLoading(false)
  }, [page, search, filter])

  useEffect(() => { fetchRows() }, [fetchRows])

  async function handleBulkCreate() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!confirm(`Opret ${ids.length} produkter som nye selvstændige produkter?`)) return
    setBulkSaving(true)
    setBulkMsg(null)

    let created = 0
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20)
      await Promise.allSettled(batch.map(id =>
        fetch(`/api/staging/${id}/action`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'new_product' }),
        }).then(r => r.ok && created++)
      ))
    }

    setBulkMsg(`${created} produkter oprettet`)
    setBulkSaving(false)
    fetchRows()
  }

  const FILTER_TABS: { key: FilterType; label: string }[] = [
    { key: 'all',    label: `Alle (${total.toLocaleString('da-DK')})` },
    { key: 'single', label: 'Enkelt-leverandør' },
    { key: 'multi',  label: 'Flere leverandører' },
  ]

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Opret produkter</h1>
        <p className="text-sm text-gray-500 mt-0.5 mb-3">
          Produkter fra leverandørerne der endnu ikke er oprettet i kataloget
        </p>

        {/* Workflow explanation */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800 leading-relaxed">
          <p className="font-medium mb-1">Hvad gør du her?</p>
          <p className="text-blue-700 text-xs">
            Disse produkter matchede hverken på EAN eller fuzzy navn mod eksisterende produkter. For hvert produkt kan du:
          </p>
          <ul className="text-xs text-blue-700 mt-2 space-y-1 list-none">
            <li>✚ <strong>Opret som nyt produkt</strong> — produktet er unikt og skal have sin egen side i kataloget</li>
            <li>🔗 <strong>Tilknyt som ekstra leverandør</strong> — præcis samme vare findes allerede, søg og link til det eksisterende produkt</li>
            <li>🔀 <strong>Tilknyt som variant</strong> — produktet er en variant (anden størrelse, farve eller materiale) af et eksisterende produkt</li>
          </ul>
        </div>
      </div>

      {/* Filters + bulk */}
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-3 shrink-0">
        {/* Filter tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {FILTER_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setFilter(t.key); setPage(1) }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filter === t.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="Søg navn, EAN, varenr…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Bulk */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            {bulkMsg ? (
              <span className="text-xs text-green-600">{bulkMsg}</span>
            ) : (
              <>
                <span className="text-xs text-gray-500">{selectedIds.size} valgt</span>
                <button
                  onClick={handleBulkCreate}
                  disabled={bulkSaving}
                  className="px-4 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40"
                >
                  {bulkSaving ? 'Opretter…' : `Opret ${selectedIds.size} som nye produkter`}
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Ryd valg
                </button>
              </>
            )}
          </div>
        )}

        {selectedIds.size === 0 && rows.length > 0 && (
          <button
            onClick={() => setSelectedIds(new Set(rows.map(r => r.id)))}
            className="ml-auto text-xs text-blue-600 hover:underline"
          >
            Vælg alle på siden
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Indlæser…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-gray-400">
            <span className="text-5xl">✅</span>
            <p className="text-base font-medium text-gray-600">Ingen produkter afventer</p>
            <p className="text-sm">Alle staging-produkter er behandlet</p>
          </div>
        ) : (
          rows.map(row => (
            <StagingCard
              key={row.id}
              row={row}
              selected={selectedIds.has(row.id)}
              onSelect={(id, checked) => setSelectedIds(prev => {
                const next = new Set(prev)
                checked ? next.add(id) : next.delete(id)
                return next
              })}
              onDone={fetchRows}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
          <span className="text-xs text-gray-400">Side {page} af {totalPages} — {total.toLocaleString('da-DK')} produkter i alt</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">← Forrige</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">Næste →</button>
          </div>
        </div>
      )}
    </div>
  )
}
