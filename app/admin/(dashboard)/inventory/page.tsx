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

type Response = { data: InventoryProduct[]; total: number; total_pages: number; page: number }

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

function EditQtyInline({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(String(value))
  const [saving,  setSaving]  = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  function open() { setDraft(String(value)); setEditing(true); setTimeout(() => ref.current?.select(), 0) }
  async function commit() {
    setEditing(false)
    const n = Math.max(0, Math.round(Number(draft)))
    if (n !== value && !isNaN(n)) { setSaving(true); await onSave(n); setSaving(false) }
  }

  if (editing) return (
    <input ref={ref} type="number" min={0} step={1} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-16 px-1.5 py-0.5 text-xs border border-blue-400 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
  )

  return (
    <button onClick={open} title="Klik for at redigere eget lager"
      className={`text-xs font-mono tabular-nums px-2 py-0.5 rounded border border-transparent hover:border-gray-300 hover:bg-gray-50 transition-colors ${saving ? 'text-blue-400' : 'text-gray-700'}`}>
      {saving ? '…' : value}
    </button>
  )
}

export default function InventoryPage() {
  const [products,    setProducts]    = useState<InventoryProduct[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search,      setSearch]      = useState('')
  const [statusFilter, setStatus]     = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [sort,        setSort]        = useState('own_stock_quantity')
  const [order,       setOrder]       = useState<'asc' | 'desc'>('asc')
  const [detailId,    setDetailId]    = useState<string | null>(null)
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page), per_page: '50', sort, order,
      ...(search      ? { search }              : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(stockFilter  ? { stock_filter: stockFilter } : {}),
    })
    const res  = await fetch(`/api/inventory?${params}`)
    const json: Response = await res.json()
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

  async function saveOwnStock(productId: string, field: 'own_stock_quantity' | 'own_stock_reserved', value: number) {
    await fetch(`/api/products/${productId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p
      const updated = { ...p, [field]: value }
      updated.total_stock = updated.own_stock_quantity + updated.supplier_total
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

  // Summary stats from current page
  const totalOwn      = products.reduce((n, p) => n + p.own_stock_quantity, 0)
  const totalSupplier = products.reduce((n, p) => n + p.supplier_total, 0)
  const zeroStock     = products.filter(p => p.total_stock === 0).length
  const lowStock      = products.filter(p => p.total_stock > 0 && p.total_stock < 5).length

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {detailId && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDetailId(null)} />
          <div className="fixed right-0 top-0 h-full w-[680px] bg-white shadow-xl z-50 flex flex-col">
            <ProductDetail productId={detailId} mode="panel" onClose={() => setDetailId(null)} />
          </div>
        </>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Lagerbeholdning</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {total.toLocaleString('da-DK')} produkter · eget lager kan redigeres direkte
            </p>
          </div>

          {/* Summaryblokke */}
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
              ['',        'Alle'],
              ['in_stock','På lager'],
              ['low',     'Lavt lager'],
              ['zero',    'Udsolgt'],
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

          <button onClick={load} className="ml-auto px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            ↻ Opdater
          </button>
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
                <th className="w-8 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map(p => (
                <>
                  <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${expanded.has(p.id) ? 'bg-blue-50/30' : ''}`}>
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

                    {/* Eget lager — redigerbar */}
                    <td className="px-4 py-2 text-right">
                      <EditQtyInline value={p.own_stock_quantity} onSave={v => saveOwnStock(p.id, 'own_stock_quantity', v)} />
                    </td>

                    {/* Reserveret eget */}
                    <td className="px-4 py-2 text-right">
                      <EditQtyInline value={p.own_stock_reserved} onSave={v => saveOwnStock(p.id, 'own_stock_reserved', v)} />
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

                    {/* Expand */}
                    <td className="px-3 py-2">
                      {p.suppliers.length > 0 && (
                        <button onClick={() => toggleExpand(p.id)}
                          className="text-gray-300 hover:text-gray-600 transition-colors text-xs px-1">
                          {expanded.has(p.id) ? '▲' : '▼'}
                        </button>
                      )}
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
