'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'

type PricingProduct = {
  id:               string
  name:             string
  internal_sku:     string
  status:           string
  primary_image_url: string | null
  sales_price:      number | null
  vejl_price:       number | null
  purchase_price:   number | null
  supplier_count:   number
  primary_supplier: {
    name:                    string
    purchase_price:          number | null
    recommended_sales_price: number | null
    supplier_sku:            string
  } | null
}

type PricingResponse = {
  has_vejl:     PricingProduct[]
  needs_manual: PricingProduct[]
  total:        number
}

// ── Inline editable price field ───────────────────────────────────────────────
function PriceInput({
  value,
  onSave,
  placeholder = '—',
}: {
  value: number | null
  onSave: (v: number | null) => Promise<void>
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value == null ? '' : String(value))
  const [saving,  setSaving]  = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  function open() {
    setDraft(value == null ? '' : String(value))
    setEditing(true)
    setTimeout(() => ref.current?.focus(), 0)
  }

  async function commit() {
    setEditing(false)
    const parsed = draft === '' ? null : Number(draft)
    if (parsed !== value) {
      setSaving(true)
      await onSave(parsed)
      setSaving(false)
    }
  }

  if (editing) return (
    <input ref={ref} type="number" step="0.01" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-28 px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium text-right"
      placeholder="0"
    />
  )

  return (
    <button onClick={open}
      className={`w-28 text-right px-2 py-1 text-sm rounded hover:bg-blue-50 transition-colors font-medium ${
        saving   ? 'text-blue-400' :
        value != null ? 'text-gray-900' : 'text-gray-300'
      }`}
      title="Klik for at redigere">
      {saving ? 'Gemmer…' : value != null ? `${value.toLocaleString('da-DK')} kr` : placeholder}
    </button>
  )
}

// ── Markup calculator ─────────────────────────────────────────────────────────
function suggestPrice(purchasePrice: number | null, markup: number): number | null {
  if (purchasePrice == null || purchasePrice <= 0) return null
  return Math.ceil(purchasePrice * (1 + markup / 100))
}

export default function PricingPage() {
  const [data,    setData]    = useState<PricingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'needs_manual' | 'has_vejl'>('needs_manual')
  const [markup,  setMarkup]  = useState(40) // default 40% markup
  const [search,  setSearch]  = useState('')

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/products/pricing')
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveSalesPrice(productId: string, price: number | null) {
    await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sales_price: price }),
    })
    // Update local state
    setData(prev => {
      if (!prev) return prev
      const update = (list: PricingProduct[]) =>
        list.map(p => p.id === productId ? { ...p, sales_price: price } : p)
      return { ...prev, has_vejl: update(prev.has_vejl), needs_manual: update(prev.needs_manual) }
    })
  }

  async function applyVejl(p: PricingProduct) {
    if (p.vejl_price == null) return
    await saveSalesPrice(p.id, p.vejl_price)
  }

  async function applyMarkup(p: PricingProduct) {
    const suggested = suggestPrice(p.purchase_price, markup)
    if (suggested == null) return
    await saveSalesPrice(p.id, suggested)
  }

  async function applyAllVejl() {
    if (!data) return
    const pending = data.has_vejl.filter(p => p.vejl_price != null)
    for (const p of pending) await applyVejl(p)
  }

  async function applyAllMarkup() {
    if (!data) return
    const pending = data.needs_manual.filter(p => p.purchase_price != null)
    for (const p of pending) await applyMarkup(p)
  }

  const rows = data ? (tab === 'needs_manual' ? data.needs_manual : data.has_vejl) : []
  const filtered = rows.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.internal_sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Prissætning</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? 'Henter…' : `${data?.total ?? 0} produkter mangler salgspris`}
            </p>
          </div>

          {/* Markup indstilling */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 font-medium">Avance</span>
            <input type="number" min={0} max={500} value={markup}
              onChange={e => setMarkup(Number(e.target.value))}
              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
            />
            <span className="text-xs text-gray-500">%</span>
            <span className="text-xs text-gray-400 ml-1">af indkøbspris</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 border-b border-gray-200 -mb-px">
          <button
            onClick={() => setTab('needs_manual')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'needs_manual'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Mangler pris
            {data && <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{data.needs_manual.length}</span>}
          </button>
          <button
            onClick={() => setTab('has_vejl')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'has_vejl'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Har vejl. udsalgspris
            {data && <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{data.has_vejl.length}</span>}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center gap-3 shrink-0">
        <input type="search" placeholder="Søg navn eller varenr…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />

        <div className="flex-1" />

        {tab === 'has_vejl' && data && data.has_vejl.length > 0 && (
          <button onClick={applyAllVejl}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            ✓ Anvend vejl. pris på alle ({data.has_vejl.length})
          </button>
        )}
        {tab === 'needs_manual' && data && data.needs_manual.filter(p => p.purchase_price != null).length > 0 && (
          <button onClick={applyAllMarkup}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            Beregn alle med {markup}% avance
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Henter produkter…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <span className="text-2xl">✓</span>
            {search ? 'Ingen resultater' : tab === 'has_vejl' ? 'Ingen produkter med vejl. pris venter' : 'Alle produkter har en salgspris!'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="w-12 px-4 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Produkt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Leverandør</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Indkøbspris</th>
                {tab === 'has_vejl' && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Vejl. udsalgspris</th>
                )}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {tab === 'needs_manual' ? `Beregnet (${markup}% avance)` : 'Beregnet'}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Salgspris</th>
                <th className="px-4 py-3 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => {
                const calculated = suggestPrice(p.purchase_price, markup)
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    {/* Billede */}
                    <td className="px-4 py-2">
                      {p.primary_image_url ? (
                        <div className="w-10 h-10 rounded border border-gray-200 overflow-hidden bg-gray-50 relative">
                          <Image src={p.primary_image_url} alt={p.name} fill className="object-contain" unoptimized />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded border border-gray-100 bg-gray-100" />
                      )}
                    </td>

                    {/* Navn */}
                    <td className="px-4 py-2 max-w-xs">
                      <div className="font-medium text-gray-900 line-clamp-2 leading-tight text-sm">{p.name}</div>
                      <div className="font-mono text-xs text-gray-400 mt-0.5">{p.internal_sku}</div>
                    </td>

                    {/* Leverandør */}
                    <td className="px-4 py-2">
                      {p.primary_supplier ? (
                        <div>
                          <div className="text-sm text-gray-700">{p.primary_supplier.name}</div>
                          <div className="font-mono text-xs text-gray-400">{p.primary_supplier.supplier_sku}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Indkøbspris */}
                    <td className="px-4 py-2 text-right">
                      {p.purchase_price != null ? (
                        <span className="text-sm text-gray-700 font-mono">{p.purchase_price.toLocaleString('da-DK')} kr</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Vejl. pris (kun has_vejl tab) */}
                    {tab === 'has_vejl' && (
                      <td className="px-4 py-2 text-right">
                        {p.vejl_price != null ? (
                          <span className="text-sm font-medium text-green-700">{p.vejl_price.toLocaleString('da-DK')} kr</span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    )}

                    {/* Beregnet */}
                    <td className="px-4 py-2 text-right">
                      {calculated != null ? (
                        <span className="text-sm text-blue-600 font-mono">{calculated.toLocaleString('da-DK')} kr</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Salgspris — inline redigerbar */}
                    <td className="px-4 py-2 text-right">
                      <PriceInput
                        value={p.sales_price}
                        onSave={v => saveSalesPrice(p.id, v)}
                        placeholder="Sæt pris…"
                      />
                    </td>

                    {/* Handlinger */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5 justify-end">
                        {tab === 'has_vejl' && p.vejl_price != null && (
                          <button onClick={() => applyVejl(p)}
                            title={`Anvend vejl. pris: ${p.vejl_price.toLocaleString('da-DK')} kr`}
                            className="px-2.5 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors whitespace-nowrap">
                            Anvend vejl.
                          </button>
                        )}
                        {calculated != null && (
                          <button onClick={() => applyMarkup(p)}
                            title={`Anvend beregnet pris: ${calculated.toLocaleString('da-DK')} kr`}
                            className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors whitespace-nowrap">
                            Beregnet
                          </button>
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

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-6 py-2 text-xs text-gray-400 shrink-0 flex items-center justify-between">
          <span>Viser {filtered.length} produkter</span>
          <span>Klik på salgsprisfeltet for at redigere manuelt — gemmes automatisk</span>
        </div>
      )}
    </div>
  )
}
