'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'

// ── Types ─────────────────────────────────────────────────────────────────────
type PricingProduct = {
  id:               string
  name:             string
  internal_sku:     string
  status:           string
  primary_image_url: string | null
  sales_price:      number | null
  sale_price:       number | null
  vejl_price:       number | null
  purchase_price:   number | null
  supplier_count:   number
  categories:       string[]
  primary_supplier: {
    name: string; purchase_price: number | null
    recommended_sales_price: number | null; supplier_sku: string
  } | null
}

type ListProduct = {
  id: string; name: string; internal_sku: string; status: string
  primary_image_url: string | null
  sales_price: number | null; sale_price: number | null
  categories: string[]
}

type Tab = 'needs_manual' | 'has_vejl' | 'adjust'

// ── Inline price input ────────────────────────────────────────────────────────
function PriceInput({ value, onSave, placeholder = '—' }: {
  value: number | null; onSave: (v: number | null) => Promise<void>; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value == null ? '' : String(value))
  const [saving,  setSaving]  = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  function open() { setDraft(value == null ? '' : String(value)); setEditing(true); setTimeout(() => ref.current?.focus(), 0) }
  async function commit() {
    setEditing(false)
    const parsed = draft === '' ? null : Number(draft)
    if (parsed !== value) { setSaving(true); await onSave(parsed); setSaving(false) }
  }

  if (editing) return (
    <input ref={ref} type="number" step="0.01" value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-28 px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium text-right" />
  )
  return (
    <button onClick={open} className={`w-28 text-right px-2 py-1 text-sm rounded hover:bg-blue-50 transition-colors font-medium ${saving ? 'text-blue-400' : value != null ? 'text-gray-900' : 'text-gray-300'}`} title="Klik for at redigere">
      {saving ? 'Gemmer…' : value != null ? `${value.toLocaleString('da-DK')} kr` : placeholder}
    </button>
  )
}

function suggestPrice(purchasePrice: number | null, markup: number): number | null {
  if (purchasePrice == null || purchasePrice <= 0) return null
  return Math.ceil(purchasePrice * (1 + markup / 100))
}

// ── Juster priser panel ───────────────────────────────────────────────────────
type AdjustMode = 'percentage' | 'fixed' | 'amount'
type AdjustField = 'sales_price' | 'sale_price'

function AdjustPricesPanel({
  products,
  onClose,
  onDone,
}: {
  products: ListProduct[]
  onClose: () => void
  onDone: (updatedIds: string[]) => void
}) {
  const [field,   setField]   = useState<AdjustField>('sales_price')
  const [mode,    setMode]    = useState<AdjustMode>('percentage')
  const [value,   setValue]   = useState<string>('')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<string | null>(null)

  const numVal = value === '' ? null : Number(value)

  function previewPrice(current: number | null): number | null {
    if (numVal == null) return null
    if (mode === 'fixed') return numVal
    if (current == null) return null
    if (mode === 'percentage') return Math.round(current * (1 + numVal / 100) * 100) / 100
    return Math.round((current + numVal) * 100) / 100
  }

  async function apply() {
    if (numVal == null) { setMsg('Angiv en værdi'); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/products/bulk-price', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: products.map(p => p.id), field, mode, value: numVal }),
    })
    const json = await res.json()
    if (json.error) { setMsg('Fejl: ' + json.error); setSaving(false); return }
    setMsg(`✓ ${json.message}`)
    setTimeout(() => { onDone(products.map(p => p.id)); onClose() }, 800)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[460px] bg-white shadow-xl z-50 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Juster priser</h3>
            <p className="text-xs text-gray-400 mt-0.5">{products.length} {products.length === 1 ? 'produkt' : 'produkter'} valgt</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* Prisfelt */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Juster</label>
            <div className="flex gap-2">
              {([['sales_price', 'Salgspris'], ['sale_price', 'Tilbudspris']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setField(v)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${field === v ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Justeringsmetode */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Metode</label>
            <div className="flex gap-2">
              {([['percentage', '% ændring'], ['amount', 'Beløb ±'], ['fixed', 'Fast pris']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setMode(v)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${mode === v ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Værdifelt */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              {mode === 'percentage' ? 'Procent (brug - for rabat, + for forhøjelse)' : mode === 'amount' ? 'Beløb i kr (brug - for rabat)' : 'Fast pris i kr'}
            </label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder={mode === 'percentage' ? '-10' : mode === 'amount' ? '-50' : '299'}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-sm text-gray-500">{mode === 'percentage' ? '%' : 'kr'}</span>
            </div>
            {mode === 'percentage' && numVal != null && (
              <p className="text-xs text-gray-400 mt-1">
                {numVal > 0 ? `+${numVal}%` : `${numVal}%`} — f.eks. 299 kr → {Math.round(299 * (1 + numVal / 100))} kr
              </p>
            )}
          </div>

          {/* Preview — viser de 5 første produkter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Forhåndsvisning ({products.length} produkter)
            </label>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {products.slice(0, 8).map(p => {
                const current  = p[field] as number | null
                const preview  = previewPrice(current)
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{p.name}</div>
                      <div className="font-mono text-xs text-gray-400">{p.internal_sku}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <span className="text-gray-500">{current != null ? `${current.toLocaleString('da-DK')} kr` : '—'}</span>
                      {preview != null && (
                        <>
                          <span className="text-gray-300">→</span>
                          <span className={`font-medium ${preview < (current ?? 0) ? 'text-red-600' : preview > (current ?? 0) ? 'text-green-600' : 'text-gray-700'}`}>
                            {preview.toLocaleString('da-DK')} kr
                          </span>
                        </>
                      )}
                      {current == null && mode !== 'fixed' && <span className="text-gray-300 italic">springes over</span>}
                    </div>
                  </div>
                )
              })}
              {products.length > 8 && (
                <p className="text-xs text-gray-400 text-center py-1">+ {products.length - 8} mere</p>
              )}
            </div>
          </div>

          {msg && <div className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith('Fejl') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 shrink-0">
          <button onClick={apply} disabled={saving || numVal == null}
            className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 font-medium">
            {saving ? 'Opdaterer…' : `Anvend på ${products.length} produkter`}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Annuller</button>
        </div>
      </div>
    </>
  )
}

// ── Kampagne-panel ────────────────────────────────────────────────────────────
type CampaignType = 'individual' | 'bundle_qty' | 'bundle_kit'
type DiscountType = 'percentage' | 'fixed_price' | 'fixed_amount'

function CampaignPanel({
  products,
  onClose,
  onDone,
}: {
  products: ListProduct[]
  onClose: () => void
  onDone: () => void
}) {
  const [name,         setName]         = useState('')
  const [description,  setDescription]  = useState('')
  const [type,         setType]         = useState<CampaignType>('individual')
  const [discountType, setDiscountType] = useState<DiscountType>('percentage')
  const [discountVal,  setDiscountVal]  = useState('')
  const [bundleQty,    setBundleQty]    = useState('2')
  const [kitPrice,     setKitPrice]     = useState('')
  const [startDate,    setStartDate]    = useState('')
  const [endDate,      setEndDate]      = useState('')
  const [applyPrices,  setApplyPrices]  = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState<string | null>(null)

  const dVal = discountVal === '' ? null : Number(discountVal)

  function previewSalePrice(salesPrice: number | null): number | null {
    if (salesPrice == null || dVal == null) return null
    if (discountType === 'percentage')   return Math.round(salesPrice * (1 - dVal / 100) * 100) / 100
    if (discountType === 'fixed_amount') return Math.round((salesPrice - dVal) * 100) / 100
    if (discountType === 'fixed_price')  return dVal
    return null
  }

  async function create() {
    if (!name.trim()) { setMsg('Angiv et kampagnenavn'); return }
    setSaving(true); setMsg(null)

    const productItems = products.map(p => ({
      product_id:  p.id,
      sales_price: p.sales_price ?? 0,
      sale_price:  type === 'individual' ? (previewSalePrice(p.sales_price) ?? undefined) : undefined,
    }))

    const res = await fetch('/api/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), description: description.trim() || undefined,
        type, discount_type: discountType,
        discount_value: dVal ?? undefined,
        bundle_qty:     type === 'bundle_qty'  ? Number(bundleQty)  : undefined,
        kit_price:      type === 'bundle_kit'  ? Number(kitPrice)   : undefined,
        start_date:     startDate || undefined,
        end_date:       endDate   || undefined,
        status: 'draft',
        products: productItems,
        apply_prices: applyPrices && type === 'individual',
      }),
    })
    const json = await res.json()
    if (json.error) { setMsg('Fejl: ' + json.error); setSaving(false); return }
    setMsg(`✓ Kampagne "${name}" oprettet med ${json.products_added} produkter`)
    setTimeout(() => { onDone(); onClose() }, 1000)
  }

  const TYPES: [CampaignType, string, string][] = [
    ['individual',  'Enkeltvis rabat',  'Hvert valgt produkt får sin egen tilbudspris'],
    ['bundle_qty',  'Mængderabat',      'Rabat når kunden køber mindst X af SAMME vare'],
    ['bundle_kit',  'Bundle / Kit',     'Rabat når kunden køber ALLE valgte varer sammen'],
  ]
  const DTYPES: [DiscountType, string][] = [
    ['percentage',   '% rabat af salgspris'],
    ['fixed_amount', 'Fast beløb i rabat'],
    ['fixed_price',  'Fast tilbudspris'],
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-xl z-50 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Opret kampagne</h3>
            <p className="text-xs text-gray-400 mt-0.5">{products.length} {products.length === 1 ? 'produkt' : 'produkter'} i kampagnen</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* Navn */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Kampagnenavn</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="F.eks. Sommersalg 2026"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Beskrivelse (valgfri)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Intern note om kampagnen…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Kampagnetype */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Kampagnetype</label>
            <div className="space-y-2">
              {TYPES.map(([v, label, desc]) => (
                <label key={v} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${type === v ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" checked={type === v} onChange={() => setType(v)} className="mt-0.5 accent-blue-600 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-gray-800">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Rabat-konfiguration — skjul bundle_kit discount for kit (bruger kit_price i stedet) */}
          {type !== 'bundle_kit' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Rabat</label>
              <div className="flex gap-2 mb-2">
                {DTYPES.map(([v, l]) => (
                  <button key={v} onClick={() => setDiscountType(v)}
                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${discountType === v ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="number" step="0.01" value={discountVal} onChange={e => setDiscountVal(e.target.value)}
                  placeholder={discountType === 'percentage' ? '10' : '50'}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-sm text-gray-500">{discountType === 'percentage' ? '%' : 'kr'}</span>
              </div>
            </div>
          )}

          {/* Bundle qty */}
          {type === 'bundle_qty' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Minimumsantal for rabat</label>
              <input type="number" min={2} value={bundleQty} onChange={e => setBundleQty(e.target.value)}
                className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">Kunden skal købe mindst {bundleQty} enheder for at få rabatten</p>
            </div>
          )}

          {/* Kit price */}
          {type === 'bundle_kit' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Samlet kit-pris (alle {products.length} produkter)</label>
              <div className="flex items-center gap-2">
                <input type="number" step="0.01" value={kitPrice} onChange={e => setKitPrice(e.target.value)} placeholder="699"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-sm text-gray-500">kr</span>
              </div>
              {kitPrice && (
                <p className="text-xs text-gray-400 mt-1">
                  Normalpriser tilsammen: {products.reduce((s, p) => s + (p.sales_price ?? 0), 0).toLocaleString('da-DK')} kr
                  {' '}→ Rabat: {(products.reduce((s, p) => s + (p.sales_price ?? 0), 0) - Number(kitPrice)).toLocaleString('da-DK')} kr
                </p>
              )}
            </div>
          )}

          {/* Datoer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Startdato (valgfri)</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Slutdato (valgfri)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Anvend priser */}
          {type === 'individual' && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={applyPrices} onChange={e => setApplyPrices(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <div>
                <span className="text-sm text-gray-800">Anvend tilbudspriser på produkterne nu</span>
                <p className="text-xs text-gray-400">Sætter sale_price på hvert produkt baseret på rabatten</p>
              </div>
            </label>
          )}

          {/* Produkt-liste preview */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Produkter i kampagnen</label>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {products.map(p => {
                const preview = type === 'individual' ? previewSalePrice(p.sales_price) : null
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                    {p.primary_image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.primary_image_url} alt="" className="w-7 h-7 object-contain rounded shrink-0" />
                      : <div className="w-7 h-7 rounded bg-gray-200 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{p.name}</div>
                    </div>
                    <div className="text-xs text-right shrink-0">
                      {p.sales_price != null && <span className="text-gray-500">{p.sales_price.toLocaleString('da-DK')} kr</span>}
                      {preview != null && (
                        <span className="ml-1.5 text-red-600 font-medium">→ {preview.toLocaleString('da-DK')} kr</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {msg && <div className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith('Fejl') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 shrink-0">
          <button onClick={create} disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 font-medium">
            {saving ? 'Opretter…' : 'Opret kampagne'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Annuller</button>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
type PricingResponse = {
  has_vejl:     PricingProduct[]
  needs_manual: PricingProduct[]
  total:        number
}
type AllProductsResponse = {
  data: ListProduct[]
  total: number
  total_pages: number
}

export default function PricingPage() {
  const [pricingData, setPricingData] = useState<PricingResponse | null>(null)
  const [allProducts, setAllProducts] = useState<ListProduct[]>([])
  const [allTotal,    setAllTotal]    = useState(0)
  const [allPages,    setAllPages]    = useState(1)
  const [allPage,     setAllPage]     = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<Tab>('needs_manual')
  const [markup,      setMarkup]      = useState(40)
  const [search,      setSearch]      = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [catFilter,   setCatFilter]   = useState('')
  const [categories,  setCategories]  = useState<string[]>([])
  const [checkedIds,  setCheckedIds]  = useState<Set<string>>(new Set())
  const [panel,       setPanel]       = useState<'adjust' | 'campaign' | null>(null)

  // Load pricing data (missing prices)
  async function loadPricing() {
    const res = await fetch('/api/products/pricing')
    const json = await res.json()
    setPricingData(json)
  }

  // Load all products for adjust tab
  const loadAll = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(allPage), per_page: '50', sort: 'name', order: 'asc' })
    if (search)    params.set('search',   search)
    if (catFilter) params.set('category', catFilter)
    const res  = await fetch(`/api/products?${params}`)
    const json: AllProductsResponse = await res.json()
    setAllProducts(json.data ?? [])
    setAllTotal(json.total ?? 0)
    setAllPages(json.total_pages ?? 1)
    setLoading(false)
  }, [allPage, search, catFilter])

  useEffect(() => {
    loadPricing()
    fetch('/api/products?per_page=200&sort=name')
      .then(r => r.json())
      .then((j: AllProductsResponse) => {
        const cats = new Set<string>()
        j.data.forEach(p => p.categories?.forEach(c => cats.add(c)))
        setCategories([...cats].sort())
      })
  }, [])

  useEffect(() => {
    if (tab === 'adjust') loadAll()
    else setLoading(false)
  }, [tab, loadAll])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setAllPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  async function saveSalesPrice(productId: string, price: number | null) {
    await fetch(`/api/products/${productId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sales_price: price }),
    })
    setPricingData(prev => {
      if (!prev) return prev
      const update = (list: PricingProduct[]) => list.map(p => p.id === productId ? { ...p, sales_price: price } : p)
      return { ...prev, has_vejl: update(prev.has_vejl), needs_manual: update(prev.needs_manual) }
    })
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll(ids: string[]) {
    setCheckedIds(prev => prev.size === ids.length && ids.every(id => prev.has(id)) ? new Set() : new Set(ids))
  }

  // Select whole category
  function selectCategory(cat: string) {
    const catIds = allProducts.filter(p => p.categories?.includes(cat)).map(p => p.id)
    setCheckedIds(new Set(catIds))
    setCatFilter(cat)
  }

  const currentRows = tab === 'adjust' ? allProducts
    : tab === 'needs_manual' ? (pricingData?.needs_manual ?? [])
    : (pricingData?.has_vejl ?? [])

  const searchFiltered = tab !== 'adjust' ? currentRows.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.internal_sku?.toLowerCase().includes(search.toLowerCase())
  ) : currentRows

  const checkedProducts = tab === 'adjust'
    ? allProducts.filter(p => checkedIds.has(p.id))
    : (searchFiltered as ListProduct[]).filter(p => checkedIds.has(p.id))

  const STATUS: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', validated: 'bg-blue-100 text-blue-700', published: 'bg-green-100 text-green-700' }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Panels */}
      {panel === 'adjust' && (
        <AdjustPricesPanel
          products={checkedProducts}
          onClose={() => setPanel(null)}
          onDone={() => { if (tab === 'adjust') loadAll(); else loadPricing(); setCheckedIds(new Set()) }}
        />
      )}
      {panel === 'campaign' && (
        <CampaignPanel
          products={checkedProducts}
          onClose={() => setPanel(null)}
          onDone={() => { loadPricing(); setCheckedIds(new Set()) }}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Prissætning</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {pricingData ? `${pricingData.total} produkter mangler salgspris` : 'Henter…'}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 font-medium">Avance</span>
            <input type="number" min={0} max={500} value={markup} onChange={e => setMarkup(Number(e.target.value))}
              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-right" />
            <span className="text-xs text-gray-500">%</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 -mb-px">
          {([
            ['needs_manual', 'Mangler pris',         pricingData?.needs_manual.length],
            ['has_vejl',     'Har vejl. udsalgspris', pricingData?.has_vejl.length],
            ['adjust',       'Prisjustering',         null],
          ] as const).map(([v, label, count]) => (
            <button key={v} onClick={() => { setTab(v); setCheckedIds(new Set()) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === v ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
              {count != null && <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${v === 'needs_manual' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center gap-3 shrink-0">
        <input type="search" placeholder="Søg navn eller varenr…" value={searchInput} onChange={e => setSearchInput(e.target.value)}
          className="w-60 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />

        {tab === 'adjust' && (
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setAllPage(1); setCheckedIds(new Set()) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Alle kategorier</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {tab === 'adjust' && catFilter && (
          <button onClick={() => selectCategory(catFilter)}
            className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
            Vælg alle i &quot;{catFilter}&quot;
          </button>
        )}

        <div className="flex-1" />

        {tab === 'has_vejl' && pricingData && pricingData.has_vejl.length > 0 && (
          <button onClick={async () => { for (const p of pricingData.has_vejl) if (p.vejl_price != null) await saveSalesPrice(p.id, p.vejl_price) }}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            ✓ Anvend vejl. pris på alle ({pricingData.has_vejl.length})
          </button>
        )}
        {tab === 'needs_manual' && pricingData && (
          <button onClick={async () => { for (const p of pricingData.needs_manual) { const s = suggestPrice(p.purchase_price, markup); if (s) await saveSalesPrice(p.id, s) } }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            Beregn alle med {markup}% avance
          </button>
        )}
      </div>

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        {loading && tab === 'adjust' ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Henter produkter…</div>
        ) : searchFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <span className="text-2xl">✓</span>
            {search ? 'Ingen resultater' : tab === 'adjust' ? 'Ingen produkter' : 'Ingen produkter venter'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input type="checkbox"
                    checked={searchFiltered.length > 0 && searchFiltered.every(p => checkedIds.has(p.id))}
                    onChange={() => toggleAll(searchFiltered.map(p => p.id))}
                    className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" />
                </th>
                <th className="w-12 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Produkt</th>
                {tab !== 'adjust' && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Leverandør</th>}
                {tab !== 'adjust' && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Indkøbspris</th>}
                {tab === 'has_vejl' && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Vejl. pris</th>}
                {tab !== 'adjust' && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Beregnet ({markup}%)</th>}
                {tab === 'adjust' && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Tilbudspris</th>}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Salgspris</th>
                {tab !== 'adjust' && <th className="px-4 py-3 w-40" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {searchFiltered.map(p => {
                const pp        = p as PricingProduct
                const lp        = p as ListProduct
                const isChecked = checkedIds.has(p.id)
                const calc      = tab !== 'adjust' ? suggestPrice(pp.purchase_price, markup) : null

                return (
                  <tr key={p.id} className={`transition-colors cursor-pointer ${isChecked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => toggleCheck(p.id)}>
                    <td className="w-10 px-3 py-2">
                      <input type="checkbox" checked={isChecked} onChange={() => {}} className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" />
                    </td>
                    <td className="px-3 py-2">
                      {p.primary_image_url ? (
                        <div className="w-10 h-10 rounded border border-gray-200 overflow-hidden bg-gray-50 relative">
                          <Image src={p.primary_image_url} alt={p.name} fill className="object-contain" unoptimized />
                        </div>
                      ) : <div className="w-10 h-10 rounded border border-gray-100 bg-gray-100" />}
                    </td>
                    <td className="px-4 py-2 max-w-xs" onClick={e => e.stopPropagation()}>
                      <div className="font-medium text-gray-900 line-clamp-2 leading-tight text-sm">{p.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-gray-400">{p.internal_sku}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS[p.status] ?? 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                      </div>
                    </td>
                    {tab !== 'adjust' && (
                      <td className="px-4 py-2">
                        {pp.primary_supplier ? (
                          <div>
                            <div className="text-sm text-gray-700">{pp.primary_supplier.name}</div>
                            <div className="font-mono text-xs text-gray-400">{pp.primary_supplier.supplier_sku}</div>
                          </div>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    )}
                    {tab !== 'adjust' && (
                      <td className="px-4 py-2 text-right">
                        {pp.purchase_price != null ? <span className="text-sm text-gray-700 font-mono">{pp.purchase_price.toLocaleString('da-DK')} kr</span> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    )}
                    {tab === 'has_vejl' && (
                      <td className="px-4 py-2 text-right">
                        {pp.vejl_price != null ? <span className="text-sm font-medium text-green-700">{pp.vejl_price.toLocaleString('da-DK')} kr</span> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    )}
                    {tab !== 'adjust' && (
                      <td className="px-4 py-2 text-right">
                        {calc != null ? <span className="text-sm text-blue-600 font-mono">{calc.toLocaleString('da-DK')} kr</span> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    )}
                    {tab === 'adjust' && (
                      <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                        {lp.sale_price != null ? <span className="text-sm text-red-600 font-medium">{lp.sale_price.toLocaleString('da-DK')} kr</span> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                      <PriceInput value={p.sales_price} onSave={v => saveSalesPrice(p.id, v)} placeholder="Sæt pris…" />
                    </td>
                    {tab !== 'adjust' && (
                      <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 justify-end">
                          {tab === 'has_vejl' && pp.vejl_price != null && (
                            <button onClick={() => saveSalesPrice(p.id, pp.vejl_price!)}
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors">
                              Vejl.
                            </button>
                          )}
                          {calc != null && (
                            <button onClick={() => saveSalesPrice(p.id, calc)}
                              className="px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors">
                              Beregnet
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination (adjust tab only) */}
      {tab === 'adjust' && allPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-6 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">Viser {((allPage-1)*50)+1}–{Math.min(allPage*50,allTotal)} af {allTotal.toLocaleString('da-DK')}</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setAllPage(1)}      disabled={allPage===1}       className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">«</button>
            <button onClick={() => setAllPage(p=>p-1)} disabled={allPage===1}       className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Forrige</button>
            <span className="px-3 py-1 text-sm text-gray-600">Side {allPage} / {allPages}</span>
            <button onClick={() => setAllPage(p=>p+1)} disabled={allPage===allPages} className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Næste</button>
            <button onClick={() => setAllPage(allPages)} disabled={allPage===allPages} className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">»</button>
          </div>
        </div>
      )}

      {/* Footer hint */}
      {!loading && searchFiltered.length > 0 && checkedIds.size === 0 && (
        <div className="bg-white border-t border-gray-100 px-6 py-2 text-xs text-gray-400 text-center shrink-0">
          Markér produkter for at justere priser eller oprette kampagne · Klik på salgspris for at redigere
        </div>
      )}

      {/* Floating selection bar */}
      {checkedIds.size > 0 && (
        <div className="border-t border-blue-200 bg-blue-50 px-6 py-3 flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-blue-900">{checkedIds.size} produkter valgt</span>
          <div className="flex gap-2">
            <button onClick={() => setPanel('adjust')}
              className="px-4 py-1.5 text-sm bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition-colors">
              ✏️ Juster priser
            </button>
            <button onClick={() => setPanel('campaign')}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
              🎯 Opret kampagne
            </button>
          </div>
          <button onClick={() => setCheckedIds(new Set())} className="ml-auto text-sm text-blue-500 hover:text-blue-700">
            Fravælg alle
          </button>
        </div>
      )}
    </div>
  )
}
