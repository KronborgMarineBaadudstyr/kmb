'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type ChangeType = 'price_changed' | 'new_product' | 'discontinued'

type ChangeRow = {
  id:                   string
  change_type:          ChangeType
  supplier_sku:         string
  product_name:         string | null
  seen_at:              string
  old_purchase_price:   number | null
  new_purchase_price:   number | null
  old_recommended_price: number | null
  new_recommended_price: number | null
  notes:                string | null
  product_id:           string | null
  staging_id:           string | null
  suppliers:            { id: string; name: string } | null
}

type Supplier = { id: string; name: string }

const CHANGE_LABELS: Record<ChangeType, { label: string; color: string; icon: string }> = {
  price_changed: { label: 'Prisændring',    color: 'bg-yellow-50 text-yellow-800 border-yellow-200',  icon: '💰' },
  new_product:   { label: 'Nyt produkt',    color: 'bg-green-50 text-green-800 border-green-200',     icon: '✨' },
  discontinued:  { label: 'Udgået',         color: 'bg-red-50 text-red-800 border-red-200',           icon: '🚫' },
}

function PriceDiff({ oldVal, newVal }: { oldVal: number | null; newVal: number | null }) {
  if (oldVal == null && newVal == null) return <span className="text-gray-300">—</span>
  if (oldVal == null) return <span className="text-green-600 font-medium">{newVal!.toLocaleString('da-DK')} kr</span>
  if (newVal == null) return <span className="text-gray-500">{oldVal.toLocaleString('da-DK')} kr</span>

  const pct = ((newVal - oldVal) / oldVal) * 100
  const up  = newVal > oldVal
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400 line-through text-xs">{oldVal.toLocaleString('da-DK')}</span>
      <span className="text-gray-300">→</span>
      <span className={`font-medium ${up ? 'text-red-600' : 'text-green-600'}`}>
        {newVal.toLocaleString('da-DK')} kr
      </span>
      <span className={`text-xs px-1 py-0.5 rounded ${up ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
        {up ? '+' : ''}{pct.toFixed(1)}%
      </span>
    </div>
  )
}

export default function ChangesPage() {
  const [rows,        setRows]        = useState<ChangeRow[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [suppliers,   setSuppliers]   = useState<Supplier[]>([])
  const [supplierId,  setSupplierId]  = useState('')
  const [changeType,  setChangeType]  = useState<ChangeType | ''>('')
  const [days,        setDays]        = useState(7)
  const [page,        setPage]        = useState(1)
  const [detecting,   setDetecting]   = useState(false)
  const [detectMsg,   setDetectMsg]   = useState<string | null>(null)

  // Summary counts
  const [summary, setSummary] = useState<{ price_changed: number; new_product: number; discontinued: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ days: String(days), page: String(page), per_page: '50' })
    if (supplierId) params.set('supplier_id', supplierId)
    if (changeType) params.set('change_type', changeType)
    const res  = await fetch(`/api/import-changes?${params}`)
    const json = await res.json()
    setRows(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    setLoading(false)
  }, [supplierId, changeType, days, page])

  // Load summary counts (all types)
  async function loadSummary() {
    const base = new URLSearchParams({ days: String(days), per_page: '1' })
    if (supplierId) base.set('supplier_id', supplierId)
    const [p, n, d] = await Promise.all([
      fetch(`/api/import-changes?${base}&change_type=price_changed`).then(r => r.json()),
      fetch(`/api/import-changes?${base}&change_type=new_product`).then(r => r.json()),
      fetch(`/api/import-changes?${base}&change_type=discontinued`).then(r => r.json()),
    ])
    setSummary({ price_changed: p.total ?? 0, new_product: n.total ?? 0, discontinued: d.total ?? 0 })
  }

  useEffect(() => {
    fetch('/api/suppliers').then(r => r.json())
      .then(j => setSuppliers((j.data ?? []).map((s: Supplier) => ({ id: s.id, name: s.name }))))
  }, [])

  useEffect(() => { load(); loadSummary() }, [load])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSummary() }, [supplierId, days])

  async function detectDiscontinued(sid: string) {
    setDetecting(true); setDetectMsg(null)
    const res = await fetch('/api/import-changes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id: sid }),
    })
    const json = await res.json()
    setDetectMsg(json.message ?? json.error)
    setDetecting(false)
    if (!json.error) { load(); loadSummary() }
  }

  const TABS: [ChangeType | '', string][] = [
    ['',              'Alle'],
    ['price_changed', 'Prisændringer'],
    ['new_product',   'Nye produkter'],
    ['discontinued',  'Udgåede'],
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Import-ændringer</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Prisændringer, nye og udgåede produkter fra leverandørfeeds
            </p>
          </div>

          {/* Summary badges */}
          {summary && (
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                <span>💰</span>
                <span className="text-xs font-semibold text-yellow-800">{summary.price_changed}</span>
                <span className="text-xs text-yellow-600">prisændringer</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                <span>✨</span>
                <span className="text-xs font-semibold text-green-800">{summary.new_product}</span>
                <span className="text-xs text-green-600">nye</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                <span>🚫</span>
                <span className="text-xs font-semibold text-red-800">{summary.discontinued}</span>
                <span className="text-xs text-red-600">udgåede</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 -mb-px">
          {TABS.map(([v, label]) => (
            <button key={v} onClick={() => { setChangeType(v); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${changeType === v ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
              {v !== '' && summary && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  v === 'price_changed' ? 'bg-yellow-100 text-yellow-700' :
                  v === 'new_product'   ? 'bg-green-100 text-green-700'   :
                  'bg-red-100 text-red-700'
                }`}>{summary[v as ChangeType]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center gap-3 shrink-0 flex-wrap">
        <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1) }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Alle leverandører</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select value={days} onChange={e => { setDays(Number(e.target.value)); setPage(1) }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value={1}>Sidste 24 timer</option>
          <option value={7}>Sidste 7 dage</option>
          <option value={14}>Sidste 14 dage</option>
          <option value={30}>Sidste 30 dage</option>
          <option value={90}>Sidste 90 dage</option>
        </select>

        <span className="text-xs text-gray-400">{total.toLocaleString('da-DK')} ændringer</span>

        <div className="flex-1" />

        {/* Detect discontinued */}
        <div className="flex items-center gap-2">
          <select
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none"
            id="detect-supplier-select"
            defaultValue="">
            <option value="">Vælg leverandør…</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            onClick={() => {
              const sel = (document.getElementById('detect-supplier-select') as HTMLSelectElement)?.value
              if (sel) detectDiscontinued(sel)
            }}
            disabled={detecting}
            title="Find produkter der ikke længere er i leverandørens seneste feed"
            className="px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 transition-colors">
            {detecting ? '⏳ Registrerer…' : '🚫 Registrer udgåede'}
          </button>
        </div>

        {detectMsg && (
          <span className={`text-xs px-3 py-1 rounded-full ${detectMsg.startsWith('Fejl') || detectMsg.includes('ikke fundet') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {detectMsg}
          </span>
        )}
      </div>

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Henter ændringer…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <span className="text-3xl">📋</span>
            <span>Ingen ændringer i den valgte periode</span>
            <span className="text-xs">Ændringer registreres automatisk ved næste import</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-28">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Produkt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Leverandør</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Indkøbspris</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Vejl. pris</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-32">Tidspunkt</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => {
                const meta = CHANGE_LABELS[row.change_type]
                return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${meta.color}`}>
                        <span>{meta.icon}</span>
                        {meta.label}
                      </span>
                    </td>

                    {/* Produkt */}
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-gray-900 line-clamp-1">{row.product_name ?? '—'}</div>
                      <div className="font-mono text-xs text-gray-400 mt-0.5">{row.supplier_sku}</div>
                      {row.notes && <div className="text-xs text-gray-400 mt-0.5 italic">{row.notes}</div>}
                    </td>

                    {/* Leverandør */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{row.suppliers?.name ?? '—'}</span>
                    </td>

                    {/* Indkøbspris */}
                    <td className="px-4 py-3 text-right">
                      {row.change_type === 'price_changed' ? (
                        <PriceDiff oldVal={row.old_purchase_price} newVal={row.new_purchase_price} />
                      ) : row.new_purchase_price != null ? (
                        <span className="text-sm text-gray-700">{row.new_purchase_price.toLocaleString('da-DK')} kr</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Vejl. pris */}
                    <td className="px-4 py-3 text-right">
                      {row.change_type === 'price_changed' ? (
                        <PriceDiff oldVal={row.old_recommended_price} newVal={row.new_recommended_price} />
                      ) : row.new_recommended_price != null ? (
                        <span className="text-sm text-gray-700">{row.new_recommended_price.toLocaleString('da-DK')} kr</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Tidspunkt */}
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-600">{new Date(row.seen_at).toLocaleDateString('da-DK')}</div>
                      <div className="text-xs text-gray-400">{new Date(row.seen_at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>

                    {/* Links */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {row.product_id && (
                          <Link href={`/products/${row.product_id}`}
                            className="text-xs text-blue-500 hover:underline" title="Se produkt">
                            Produkt ↗
                          </Link>
                        )}
                        {!row.product_id && row.staging_id && (
                          <Link href="/admin/staging"
                            className="text-xs text-gray-400 hover:text-blue-500 hover:underline" title="Se i staging">
                            Staging →
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-6 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">
            Viser {((page-1)*50)+1}–{Math.min(page*50, total)} af {total.toLocaleString('da-DK')}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)}      disabled={page===1}            className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">«</button>
            <button onClick={() => setPage(p=>p-1)} disabled={page===1}            className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Forrige</button>
            <span className="px-3 py-1 text-sm text-gray-600">Side {page} / {totalPages}</span>
            <button onClick={() => setPage(p=>p+1)} disabled={page===totalPages}   className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Næste</button>
            <button onClick={() => setPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
