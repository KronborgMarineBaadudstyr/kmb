'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

function str(val: unknown, fallback = '—'): string {
  if (val == null) return fallback
  return String(val) || fallback
}

type StagingRow = {
  id:                   string
  supplier_id:          string
  normalized_name:      string
  normalized_ean:       string | null
  normalized_sku:       string
  normalized_unit:      string | null
  normalized_unit_size: number | null
  status:               'pending_review' | 'matched' | 'new_product' | 'rejected'
  matched_product_id:   string | null
  created_at:           string
  updated_at:           string
  suppliers:            { name: string }
  raw_data:             Record<string, unknown>
}

type Suggestion = {
  id:           string
  name:         string
  internal_sku: string
  score:        number
  match_field:  'ean' | 'name'
}

type SuggestionsResult = {
  suggestions: Suggestion[]
  ean_match:   boolean
  rpc_error?:  string
}

type Supplier = { id: string; name: string }

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: 'Afventer',   color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  matched:        { label: 'Matchet',    color: 'bg-green-50 text-green-700 border-green-200'   },
  new_product:    { label: 'Nyt produkt',color: 'bg-blue-50 text-blue-700 border-blue-200'      },
  rejected:       { label: 'Afvist',     color: 'bg-gray-100 text-gray-500 border-gray-200'     },
}

export default function StagingPage() {
  const [rows,        setRows]        = useState<StagingRow[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [page,        setPage]        = useState(1)
  const [statusFilter,setStatusFilter]= useState('pending_review')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [search,      setSearch]      = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [suppliers,   setSuppliers]   = useState<Supplier[]>([])

  // Panel state
  const [selected,    setSelected]    = useState<StagingRow | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [sugLoading,  setSugLoading]  = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMsg,   setActionMsg]   = useState<string | null>(null)

  // Search input til fuzzy-søgning i match-panel
  const [matchSearch, setMatchSearch] = useState('')
  const [matchResults, setMatchResults] = useState<Suggestion[]>([])
  const [matchSearchLoading, setMatchSearchLoading] = useState(false)
  const matchSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hent leverandører
  useEffect(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then(j => setSuppliers(j.data ?? []))
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      status:   statusFilter,
      page:     String(page),
      per_page: '40',
    })
    if (supplierFilter) params.set('supplier_id', supplierFilter)
    if (search)         params.set('search', search)

    const res  = await fetch(`/api/staging?${params}`)
    const json = await res.json()
    setRows(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    setLoading(false)
  }, [statusFilter, supplierFilter, search, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  // Debounce søgning
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Hent match-forslag når panel åbnes
  async function openPanel(row: StagingRow) {
    setSelected(row)
    setSuggestions(null)
    setActionMsg(null)
    setMatchSearch('')
    setMatchResults([])
    setSugLoading(true)

    const res  = await fetch(`/api/staging/${row.id}/suggestions`)
    const json: SuggestionsResult = await res.json()
    setSuggestions(json.suggestions)
    setSugLoading(false)
  }

  // Live match-søgning i panel
  function onMatchSearchChange(val: string) {
    setMatchSearch(val)
    if (matchSearchTimer.current) clearTimeout(matchSearchTimer.current)
    if (!val.trim()) { setMatchResults([]); return }

    matchSearchTimer.current = setTimeout(async () => {
      setMatchSearchLoading(true)
      const res  = await fetch(`/api/products?search=${encodeURIComponent(val)}&per_page=8`)
      const json = await res.json()
      setMatchResults((json.data ?? []).map((p: { id: string; name: string; internal_sku: string }) => ({
        id:           p.id,
        name:         p.name,
        internal_sku: p.internal_sku,
        score:        0,
        match_field:  'name' as const,
      })))
      setMatchSearchLoading(false)
    }, 300)
  }

  async function doAction(action: 'match' | 'new_product' | 'reject' | 'reopen', productId?: string) {
    if (!selected) return
    setActionLoading(true)
    setActionMsg(null)

    const res  = await fetch(`/api/staging/${selected.id}/action`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, product_id: productId }),
    })
    const json = await res.json()

    if (json.ok) {
      setActionMsg(
        action === 'match'       ? '✓ Matchet til produkt' :
        action === 'new_product' ? '✓ Oprettet som nyt produkt (kladde)' :
        action === 'reject'      ? '✓ Afvist' : '✓ Genåbnet'
      )
      // Opdater rækken lokalt + genindlæs listen
      setSelected(null)
      fetchRows()
    } else {
      setActionMsg(`Fejl: ${json.error}`)
    }
    setActionLoading(false)
  }

  const displaySuggestions = matchSearch.trim() ? matchResults : (suggestions ?? [])

  return (
    <div className="flex h-full">
      {/* ── Venstre: liste ── */}
      <div className={`flex flex-col ${selected ? 'w-1/2' : 'w-full'} border-r border-gray-200 transition-all`}>

        {/* Topbar */}
        <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Til gennemgang</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Leverandørprodukter der ikke er matchet automatisk
              </p>
            </div>
            <span className="text-sm text-gray-400">{total.toLocaleString('da-DK')} rækker</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status filter */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {(['pending_review', 'matched', 'new_product', 'rejected', 'all'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1) }}
                  className={`px-3 py-1.5 transition-colors ${
                    statusFilter === s
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'pending_review' ? 'Afventer' :
                   s === 'matched'        ? 'Matchet'  :
                   s === 'new_product'    ? 'Nye'      :
                   s === 'rejected'       ? 'Afvist'   : 'Alle'}
                </button>
              ))}
            </div>

            {/* Leverandør filter */}
            <select
              value={supplierFilter}
              onChange={e => { setSupplierFilter(e.target.value); setPage(1) }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Alle leverandører</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Søg */}
            <input
              type="search"
              placeholder="Søg produktnavn..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
          </div>
        </div>

        {/* Tabel */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Henter...</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              {statusFilter === 'pending_review'
                ? 'Ingen produkter afventer gennemgang'
                : 'Ingen rækker'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Produktnavn</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Leverandør</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">SKU / EAN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Lager</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="w-8 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => {
                  const qty = Number(row.raw_data?.supplier_stock_quantity ?? 0)
                  const brand = row.raw_data?.brand ? String(row.raw_data.brand) : null
                  const isSelected = selected?.id === row.id

                  return (
                    <tr
                      key={row.id}
                      onClick={() => openPanel(row)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-gray-900 line-clamp-1">{row.normalized_name}</div>
                        {brand && (
                          <div className="text-xs text-gray-400">{brand}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {row.suppliers?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-gray-600">{row.normalized_sku}</div>
                        {row.normalized_ean && (
                          <div className="font-mono text-xs text-gray-400">{row.normalized_ean}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium tabular-nums ${
                          qty > 0 ? 'text-green-700' : 'text-gray-400'
                        }`}>{qty}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_LABELS[row.status]?.color}`}>
                          {STATUS_LABELS[row.status]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-base">›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between shrink-0">
            <p className="text-sm text-gray-500">
              Side {page} / {totalPages} — {total.toLocaleString('da-DK')} rækker
            </p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Forrige</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
                className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Næste</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Højre: detalje-panel ── */}
      {selected && (
        <div className="w-1/2 flex flex-col bg-white overflow-auto">
          {/* Panel header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-start justify-between shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              <h3 className="font-semibold text-gray-900 text-base leading-snug">{selected.normalized_name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {selected.suppliers?.name} · SKU: {selected.normalized_sku}
                {selected.normalized_ean && ` · EAN: ${selected.normalized_ean}`}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-5 space-y-6">

            {/* Rådata fra leverandør */}
            <section>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Leverandørdata</h4>
              {(() => {
                const rd = selected.raw_data
                const purchasePrice = rd?.purchase_price != null
                  ? `${Number(rd.purchase_price).toLocaleString('da-DK')} kr` : '—'
                const salesPrice = rd?.recommended_sales_price != null
                  ? `${Number(rd.recommended_sales_price).toLocaleString('da-DK')} kr` : '—'
                const fields: [string, string][] = [
                  ['Produktnavn',     str(rd?.supplier_product_name)],
                  ['SKU',             selected.normalized_sku],
                  ['EAN',             selected.normalized_ean ?? '—'],
                  ['Indkøbspris',     purchasePrice],
                  ['Vejl. pris',      salesPrice],
                  ['Lager',           String(Number(rd?.supplier_stock_quantity ?? 0))],
                  ['Enhed',           selected.normalized_unit ?? '—'],
                  ['Enhedsstørrelse', selected.normalized_unit_size != null ? String(selected.normalized_unit_size) : '—'],
                  ['Brand',           str(rd?.brand)],
                  ['Opdateret',       new Date(selected.updated_at).toLocaleDateString('da-DK')],
                ]
                return (
                  <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {fields.map(([label, value]) => (
                      <div key={label}>
                        <span className="text-gray-400 block text-xs">{label}</span>
                        <span className="text-gray-900 font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Beskrivelse */}
              {(() => {
                const short = str(selected.raw_data?.short_description, '')
                const long  = str(selected.raw_data?.description, '')
                if (!short && !long) return null
                return (
                  <div className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-4 space-y-1">
                    {short && <p className="font-medium text-gray-700">{short}</p>}
                    {long  && <p className="text-gray-500 line-clamp-4">{long}</p>}
                  </div>
                )
              })()}

              {/* Billede */}
              {Array.isArray(selected.raw_data?.supplier_images) && (selected.raw_data.supplier_images as Array<{url:string}>).length > 0 && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={(selected.raw_data.supplier_images as Array<{url:string}>)[0].url}
                    alt={selected.normalized_name}
                    className="h-32 w-auto object-contain rounded border border-gray-200 bg-gray-50"
                  />
                </div>
              )}
            </section>

            {/* Match-sektion */}
            {(selected.status === 'pending_review' || selected.status === 'matched') && (
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Match til eksisterende produkt
                </h4>

                {/* Fuzzy-forslag */}
                {sugLoading && (
                  <div className="text-sm text-gray-400">Søger efter match-forslag...</div>
                )}

                {/* Manuel søgning */}
                <input
                  type="search"
                  placeholder="Søg i vores produkter..."
                  value={matchSearch}
                  onChange={e => onMatchSearchChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {matchSearchLoading && (
                  <div className="text-xs text-gray-400 mb-2">Søger...</div>
                )}

                {displaySuggestions.length > 0 ? (
                  <div className="space-y-2">
                    {displaySuggestions.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm line-clamp-1">{s.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-xs text-gray-400">{s.internal_sku}</span>
                            {s.score > 0 && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                s.score >= 0.9 ? 'bg-green-100 text-green-700' :
                                s.score >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                                                 'bg-gray-100 text-gray-500'
                              }`}>
                                {s.match_field === 'ean' ? 'EAN match' : `${Math.round(s.score * 100)}% lighed`}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => doAction('match', s.id)}
                          disabled={actionLoading}
                          className="ml-3 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 shrink-0"
                        >
                          Match
                        </button>
                      </div>
                    ))}
                  </div>
                ) : !sugLoading && !matchSearchLoading && (
                  <p className="text-sm text-gray-400">
                    {matchSearch ? 'Ingen produkter fundet' : 'Ingen automatiske forslag — søg manuelt ovenfor'}
                  </p>
                )}
              </section>
            )}

            {/* Handlinger */}
            <section>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Handling</h4>

              {actionMsg && (
                <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${
                  actionMsg.startsWith('Fejl') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  {actionMsg}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {selected.status === 'pending_review' && (
                  <>
                    <button
                      onClick={() => doAction('new_product')}
                      disabled={actionLoading}
                      className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40"
                    >
                      Opret som nyt produkt
                    </button>
                    <button
                      onClick={() => doAction('reject')}
                      disabled={actionLoading}
                      className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                    >
                      Afvis
                    </button>
                  </>
                )}
                {(selected.status === 'matched' || selected.status === 'new_product' || selected.status === 'rejected') && (
                  <button
                    onClick={() => doAction('reopen')}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                  >
                    Genåbn til gennemgang
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
