'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { ProductDetail } from '../products/_ProductDetail'

type SupplierStock = {
  id: string; name: string; qty: number; reserved: number
}

type InventoryProduct = {
  id:                 string
  name:               string
  internal_sku:       string
  ean:                string | null
  status:             string
  sales_price:        number | null
  primary_image_url:  string | null
  own_stock_quantity: number
  own_stock_reserved: number
  supplier_total:     number
  supplier_reserved:  number
  total_stock:        number
  total_available:    number
  suppliers:          SupplierStock[]
}

type InventoryResponse = { data: InventoryProduct[]; total: number; total_pages: number; page: number }

type Adjustment = {
  id:         string
  product_id: string
  delta:      number
  field:      'own_stock_quantity' | 'own_stock_reserved'
  reason:     string
  note:       string | null
  created_by: string
  created_at: string
}

const REASON_LABELS: Record<string, string> = {
  physical_count:      'Fysisk optælling',
  received:            'Varer modtaget',
  sold:                'Solgt (manuel)',
  damaged:             'Beskadiget / kasseret',
  returned:            'Returneret',
  correction:          'Korrektion',
  reservation:         'Manuel reservation',
  reservation_release: 'Frigivelse af reservation',
}

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  validated: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
}

function StockBadge({ qty, warn = 5 }: { qty: number; warn?: number }) {
  const color = qty === 0 ? 'bg-red-100 text-red-700'
    : qty < warn ? 'bg-orange-100 text-orange-700'
    : 'bg-green-100 text-green-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {qty}
    </span>
  )
}

// ── Adjustment panel (slide-in from right) ───────────────────────────────────
function AdjustmentPanel({
  product,
  onClose,
  onSaved,
}: {
  product: InventoryProduct
  onClose: () => void
  onSaved: (productId: string, field: 'own_stock_quantity' | 'own_stock_reserved', newValue: number) => void
}) {
  const [tab,     setTab]     = useState<'adjust' | 'history'>('adjust')
  const [field,   setField]   = useState<'own_stock_quantity' | 'own_stock_reserved'>('own_stock_quantity')
  const [mode,    setMode]    = useState<'delta' | 'absolute'>('delta')
  const [input,   setInput]   = useState('')
  const [reason,  setReason]  = useState('received')
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [history, setHistory] = useState<Adjustment[]>([])
  const [loadHist,setLoadHist]= useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentValue = field === 'own_stock_quantity' ? product.own_stock_quantity : product.own_stock_reserved

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  useEffect(() => {
    if (tab === 'history') {
      setLoadHist(true)
      fetch(`/api/inventory/adjustments?product_id=${product.id}&limit=50`)
        .then(r => r.json())
        .then(j => setHistory(j.data ?? []))
        .finally(() => setLoadHist(false))
    }
  }, [tab, product.id])

  // Auto-pick reason based on field
  useEffect(() => {
    if (field === 'own_stock_reserved') setReason('reservation')
    else if (reason === 'reservation' || reason === 'reservation_release') setReason('received')
  }, [field]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const num = parseFloat(input)
    if (isNaN(num)) { setError('Angiv et tal'); return }

    let delta: number
    if (mode === 'absolute') {
      const abs = Math.max(0, Math.round(num))
      delta = abs - currentValue
      if (delta === 0) { setError('Ny værdi er den samme som nuværende'); return }
    } else {
      delta = Math.round(num)
      if (delta === 0) { setError('Delta må ikke være 0'); return }
    }

    setSaving(true); setError('')
    const res = await fetch('/api/inventory/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, field, delta, reason, note: note || null }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Fejl'); return }
    onSaved(product.id, field, json.new_value)
    setInput(''); setNote('')
  }

  const reasonOptions = field === 'own_stock_reserved'
    ? ['reservation', 'reservation_release', 'correction']
    : ['received', 'physical_count', 'sold', 'damaged', 'returned', 'correction']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{product.name}</h3>
          <span className="font-mono text-xs text-gray-400">{product.internal_sku}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5 text-lg leading-none">✕</button>
      </div>

      {/* Current stock summary */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Eget lager</div>
          <div className="text-xl font-bold text-gray-900">{product.own_stock_quantity}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Reserveret</div>
          <div className="text-xl font-bold text-gray-700">{product.own_stock_reserved}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Lev.lager</div>
          <div className="text-xl font-bold text-blue-700">{product.supplier_total}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Tilgængeligt</div>
          <div className={`text-xl font-bold ${product.total_available === 0 ? 'text-red-600' : 'text-green-700'}`}>
            {product.total_available}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-5">
        {(['adjust', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'adjust' ? 'Juster lager' : 'Historik'}
          </button>
        ))}
      </div>

      {/* ── Adjust tab ── */}
      {tab === 'adjust' && (
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* Field selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Felt</label>
            <div className="flex gap-2">
              {(['own_stock_quantity', 'own_stock_reserved'] as const).map(f => (
                <button key={f} onClick={() => setField(f)}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                    field === f ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {f === 'own_stock_quantity' ? 'Eget lager' : 'Reserveret'}
                </button>
              ))}
            </div>
          </div>

          {/* Mode selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Metode</label>
            <div className="flex gap-2">
              <button onClick={() => setMode('delta')}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  mode === 'delta' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                Delta (± antal)
              </button>
              <button onClick={() => setMode('absolute')}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  mode === 'absolute' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                Absolut (sæt til)
              </button>
            </div>
          </div>

          {/* Input */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              {mode === 'delta'
                ? `Antal (nuværende: ${currentValue})`
                : `Ny værdi (nuværende: ${currentValue})`}
            </label>
            <div className="flex items-center gap-2">
              {mode === 'delta' && (
                <div className="flex gap-1">
                  {[-10, -5, -1, +1, +5, +10].map(v => (
                    <button key={v} onClick={() => setInput(String((parseFloat(input) || 0) + v))}
                      className={`px-2 py-1 text-xs rounded border font-mono transition-colors ${
                        v < 0 ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'
                      }`}>
                      {v > 0 ? `+${v}` : v}
                    </button>
                  ))}
                </div>
              )}
              <input ref={inputRef} type="number" step={1} value={input}
                onChange={e => { setInput(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder={mode === 'delta' ? '+5 eller -3' : String(currentValue)}
                className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              {mode === 'delta' && input && !isNaN(parseFloat(input)) && (
                <span className="text-xs text-gray-500">
                  → <span className="font-semibold text-gray-800">{Math.max(0, currentValue + Math.round(parseFloat(input)))}</span>
                </span>
              )}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Årsag</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              {reasonOptions.map(r => (
                <option key={r} value={r}>{REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Note (valgfri)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Optalt ved... / Ordre nr. ..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button onClick={submit} disabled={saving || !input}
            className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {saving ? 'Gemmer…' : 'Gem justering'}
          </button>
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div className="flex-1 overflow-auto">
          {loadHist ? (
            <div className="p-6 text-sm text-gray-400 text-center">Henter historik…</div>
          ) : history.length === 0 ? (
            <div className="p-6 text-sm text-gray-400 text-center">Ingen justeringer endnu</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map(a => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mr-2 ${
                        a.delta > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {a.delta > 0 ? `+${a.delta}` : a.delta}
                      </span>
                      <span className="text-xs text-gray-700">{REASON_LABELS[a.reason] ?? a.reason}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        ({a.field === 'own_stock_quantity' ? 'lager' : 'reserveret'})
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(a.created_at).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {a.note && <p className="text-xs text-gray-500 mt-0.5 ml-0.5">{a.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [products,     setProducts]     = useState<InventoryProduct[]>([])
  const [total,        setTotal]        = useState(0)
  const [totalPages,   setTotalPages]   = useState(1)
  const [page,         setPage]         = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [searchInput,  setSearchInput]  = useState('')
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatus]       = useState('')
  const [stockFilter,  setStockFilter]  = useState('')
  const [sort,         setSort]         = useState('own_stock_quantity')
  const [order,        setOrder]        = useState<'asc' | 'desc'>('asc')
  const [detailId,     setDetailId]     = useState<string | null>(null)
  const [adjustId,     setAdjustId]     = useState<string | null>(null)
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [lastSynced,   setLastSynced]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/suppliers')
      .then(r => r.json())
      .then((suppliers: { last_synced_at: string | null }[]) => {
        const dates = suppliers.map(s => s.last_synced_at).filter(Boolean) as string[]
        if (dates.length > 0) setLastSynced(dates.sort().at(-1)!)
      })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page), per_page: '50', sort, order,
      ...(search       ? { search }              : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(stockFilter  ? { stock_filter: stockFilter } : {}),
    })
    const res  = await fetch(`/api/inventory?${params}`)
    const json: InventoryResponse = await res.json()
    setProducts(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    setLoading(false)
  }, [page, search, statusFilter, stockFilter, sort, order])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  function handleAdjustmentSaved(
    productId: string,
    field: 'own_stock_quantity' | 'own_stock_reserved',
    newValue: number
  ) {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p
      const updated = { ...p, [field]: newValue }
      updated.total_stock     = updated.own_stock_quantity + updated.supplier_total
      updated.total_available = Math.max(0, updated.own_stock_quantity - updated.own_stock_reserved)
        + Math.max(0, updated.supplier_total - updated.supplier_reserved)
      return updated
    }))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSort(col: string) {
    if (sort === col) setOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setOrder('asc') }
    setPage(1)
  }

  const SortIcon = ({ col }: { col: string }) => sort !== col ? null : (
    <span className="ml-1 text-blue-500">{order === 'asc' ? '↑' : '↓'}</span>
  )

  const totalOwn      = products.reduce((n, p) => n + p.own_stock_quantity, 0)
  const totalSupplier = products.reduce((n, p) => n + p.supplier_total, 0)
  const zeroStock     = products.filter(p => p.total_stock === 0).length
  const lowStock      = products.filter(p => p.total_stock > 0 && p.total_stock < 5).length

  const adjustProduct = adjustId ? products.find(p => p.id === adjustId) ?? null : null

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Product detail panel */}
      {detailId && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDetailId(null)} />
          <div className="fixed right-0 top-0 h-full w-[680px] bg-white shadow-xl z-50 flex flex-col">
            <ProductDetail productId={detailId} mode="panel" onClose={() => setDetailId(null)} />
          </div>
        </>
      )}

      {/* Adjustment panel */}
      {adjustProduct && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setAdjustId(null)} />
          <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-xl z-50 flex flex-col">
            <AdjustmentPanel
              product={adjustProduct}
              onClose={() => setAdjustId(null)}
              onSaved={(id, field, val) => { handleAdjustmentSaved(id, field, val) }}
            />
          </div>
        </>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Lagerbeholdning</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {total.toLocaleString('da-DK')} produkter · klik <strong>Juster</strong> for at logge en lagerændring
            </p>
          </div>

          <div className="flex gap-3">
            {[
              { label: 'Eget lager (side)',      value: totalOwn.toLocaleString('da-DK'),      color: 'text-gray-900' },
              { label: 'Leverandørlager (side)', value: totalSupplier.toLocaleString('da-DK'), color: 'text-blue-700' },
              { label: 'Udsolgt',                value: zeroStock,                              color: 'text-red-700' },
              { label: 'Lavt lager',             value: lowStock,                               color: 'text-orange-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg min-w-[90px]">
                <div className={`text-lg font-bold ${color}`}>{value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <input type="search" placeholder="Søg navn, varenr., EAN…" value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-60 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />

          <select value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Alle statuser</option>
            <option value="draft">Draft</option>
            <option value="validated">Valideret</option>
            <option value="published">Publiceret</option>
          </select>

          <div className="flex gap-1">
            {([
              ['',         'Alle'],
              ['in_stock', 'På lager'],
              ['low',      'Lavt lager'],
              ['zero',     'Udsolgt'],
            ] as const).map(([v, l]) => (
              <button key={v} onClick={() => { setStockFilter(v); setPage(1) }}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${stockFilter === v
                  ? v === 'zero' ? 'border-red-400 bg-red-50 text-red-700'
                    : v === 'low' ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-col items-end gap-0.5">
            <button onClick={load} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
              ↻ Opdater
            </button>
            {lastSynced && (
              <span className="text-xs text-gray-400 cursor-default"
                title={`Senest importeret: ${new Date(lastSynced).toLocaleString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}>
                Senest importeret {new Date(lastSynced).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Henter lager…</div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Ingen produkter fundet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="w-12 px-3 py-3" />
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort('name')} className="text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700">
                    Produkt <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button onClick={() => toggleSort('own_stock_quantity')} className="text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700">
                    Eget lager <SortIcon col="own_stock_quantity" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Reserveret</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Leverandørlager</th>
                <th className="px-4 py-3 text-right">
                  <button onClick={() => toggleSort('total_stock')} className="text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700">
                    Total <SortIcon col="total_stock" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Tilgængeligt</th>
                <th className="w-20 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map(p => (
                <>
                  <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${expanded.has(p.id) ? 'bg-blue-50/30' : ''} ${adjustId === p.id ? 'bg-blue-50' : ''}`}>
                    {/* Billede */}
                    <td className="px-3 py-2">
                      {p.primary_image_url ? (
                        <div className="w-10 h-10 rounded border border-gray-200 overflow-hidden bg-gray-50 relative">
                          <Image src={p.primary_image_url} alt={p.name} fill className="object-contain" unoptimized />
                        </div>
                      ) : <div className="w-10 h-10 rounded bg-gray-100 border border-gray-100" />}
                    </td>

                    {/* Produkt */}
                    <td className="px-4 py-2 max-w-xs">
                      <button className="text-left hover:text-blue-700 transition-colors group" onClick={() => setDetailId(p.id)}>
                        <div className="font-medium text-gray-900 group-hover:text-blue-700 line-clamp-1 text-sm leading-tight">{p.name}</div>
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-gray-400">{p.internal_sku}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                        {p.ean && <span className="font-mono text-xs text-gray-300">{p.ean}</span>}
                      </div>
                    </td>

                    {/* Eget lager */}
                    <td className="px-4 py-2 text-right">
                      <span className="text-sm font-mono tabular-nums text-gray-800">{p.own_stock_quantity}</span>
                    </td>

                    {/* Reserveret */}
                    <td className="px-4 py-2 text-right">
                      <span className="text-sm font-mono tabular-nums text-gray-600">{p.own_stock_reserved}</span>
                    </td>

                    {/* Leverandørlager */}
                    <td className="px-4 py-2 text-right">
                      <span className="text-sm text-gray-700 font-mono tabular-nums">{p.supplier_total.toLocaleString('da-DK')}</span>
                      {p.suppliers.length > 1 && (
                        <span className="ml-1 text-xs text-gray-400">({p.suppliers.length} lev.)</span>
                      )}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-2 text-right">
                      <StockBadge qty={p.total_stock} />
                    </td>

                    {/* Tilgængeligt */}
                    <td className="px-4 py-2 text-right">
                      <span className={`text-sm font-semibold tabular-nums ${p.total_available === 0 ? 'text-red-600' : p.total_available < 5 ? 'text-orange-600' : 'text-gray-800'}`}>
                        {p.total_available}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setAdjustId(adjustId === p.id ? null : p.id)}
                          title="Juster lager"
                          className={`px-2 py-1 text-xs rounded border transition-colors font-medium ${
                            adjustId === p.id
                              ? 'border-blue-400 bg-blue-100 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                          }`}>
                          Juster
                        </button>
                        {p.suppliers.length > 0 && (
                          <button onClick={() => toggleExpand(p.id)}
                            className="text-gray-300 hover:text-gray-600 transition-colors text-xs px-1">
                            {expanded.has(p.id) ? '▲' : '▼'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Leverandør-detaljer */}
                  {expanded.has(p.id) && p.suppliers.map(s => (
                    <tr key={s.id} className="bg-blue-50/20 border-l-2 border-blue-200">
                      <td className="px-3 py-1.5" />
                      <td className="px-4 py-1.5 pl-10">
                        <span className="text-xs text-gray-500">↳ {s.name}</span>
                      </td>
                      <td className="px-4 py-1.5 text-right text-xs text-gray-400">—</td>
                      <td className="px-4 py-1.5 text-right text-xs text-gray-400">—</td>
                      <td className="px-4 py-1.5 text-right">
                        <span className="text-xs font-mono text-gray-700 tabular-nums">{s.qty.toLocaleString('da-DK')}</span>
                        {s.reserved > 0 && <span className="text-xs text-gray-400 ml-1">(res: {s.reserved})</span>}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <span className="text-xs font-mono text-blue-700">{(s.qty - s.reserved).toLocaleString('da-DK')}</span>
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <span className="text-xs font-mono text-blue-700">{Math.max(0, s.qty - s.reserved).toLocaleString('da-DK')}</span>
                      </td>
                      <td />
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-6 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">
            Viser {((page-1)*50)+1}–{Math.min(page*50, total)} af {total.toLocaleString('da-DK')} produkter
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)}      disabled={page===1}          className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">«</button>
            <button onClick={() => setPage(p=>p-1)} disabled={page===1}          className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Forrige</button>
            <span className="px-3 py-1 text-sm text-gray-600">Side {page} / {totalPages}</span>
            <button onClick={() => setPage(p=>p+1)} disabled={page===totalPages} className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Næste</button>
            <button onClick={() => setPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
