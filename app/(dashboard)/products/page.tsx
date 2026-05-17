'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ProductDetail } from './_ProductDetail'

type Product = {
  id: string
  internal_sku: string
  name: string
  sales_price: number | null
  sale_price: number | null
  own_stock_quantity: number
  own_stock_reserved: number
  categories: string[]
  brand: string | null
  status: 'draft' | 'validated' | 'published'
  woo_sync_status: string | null
  woo_product_id: number | null
  woo_bestillingsnummer: string | null
  ean: string | null
  manufacturer_sku: string | null
  weight: number | null
  variant_count: number
  primary_image_url: string | null
  image_count: number
  created_at: string
  updated_at: string
}

// ── Hjælper: udtræk størrelseshint fra produktnavn ────────────────────────────
function extractSizeHint(productName: string, parentName: string): string {
  const base      = parentName.trim().toLowerCase()
  const full      = productName.trim()
  const lower     = full.toLowerCase()
  const remainder = lower.startsWith(base) ? full.slice(base.length).trim() : full

  const mmMatch  = remainder.match(/\b(\d+(?:[,\.]\d+)?)\s*(mm|cm|m|l|ml|kg|g)\b/i)
  if (mmMatch) return `${mmMatch[1]} ${mmMatch[2].toLowerCase()}`

  const stkMatch = remainder.match(/\b(\d+)\s*stk\.?/i)
  if (stkMatch) return `${stkMatch[1]} stk`

  if (remainder.length > 0 && remainder.length <= 30) return remainder
  return ''
}

// Longest common prefix for a list of strings
function commonPrefix(strs: string[]): string {
  if (!strs.length) return ''
  let prefix = strs[0]
  for (const s of strs.slice(1)) {
    while (!s.toLowerCase().startsWith(prefix.toLowerCase()) && prefix.length > 0) {
      prefix = prefix.slice(0, prefix.lastIndexOf(' ') > 0 ? prefix.lastIndexOf(' ') : prefix.length - 1)
    }
  }
  return prefix.trim()
}

type VariantRow = { productId: string; attrs: { key: string; val: string }[] }

// ── Variantfamilie-panel (erstatter ProductVariantFamilyPanel) ─────────────────────────
function ProductVariantFamilyPanel({
  products,
  onClose,
  onDone,
}: {
  products: Product[]
  onClose: () => void
  onDone: () => void
}) {
  const defaultName = commonPrefix(products.map(p => p.name))

  const initRows = (pName: string): VariantRow[] =>
    products.map(p => {
      const hint = extractSizeHint(p.name, pName)
      return { productId: p.id, attrs: [{ key: 'størrelse', val: hint }] }
    })

  const [parentName,   setParentName]   = useState(defaultName)
  const [variantRows,  setVariantRows]  = useState<VariantRow[]>(() => initRows(defaultName))
  const [expandedIdxs, setExpandedIdxs] = useState<Set<number>>(new Set())
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState<string | null>(null)

  function onParentNameChange(val: string) {
    setParentName(val)
    setVariantRows(prev => prev.map((vr, idx) => {
      const hint    = extractSizeHint(products[idx].name, val)
      const oldHint = extractSizeHint(products[idx].name, parentName)
      return {
        ...vr,
        attrs: vr.attrs.map(a => a.val === oldHint ? { ...a, val: hint } : a),
      }
    }))
  }

  function setAttr(i: number, j: number, field: 'key' | 'val', value: string) {
    setVariantRows(prev => prev.map((r, ri) => {
      if (ri === i) return { ...r, attrs: r.attrs.map((a, ai) => ai !== j ? a : { ...a, [field]: value }) }
      if (field === 'key' && j < r.attrs.length) return { ...r, attrs: r.attrs.map((a, ai) => ai !== j ? a : { ...a, key: value }) }
      return r
    }))
  }
  function addAttr() {
    setVariantRows(prev => prev.map(r => ({ ...r, attrs: [...r.attrs, { key: '', val: '' }] })))
  }
  function removeAttr(j: number) {
    setVariantRows(prev => prev.map(r => ({ ...r, attrs: r.attrs.filter((_, ai) => ai !== j) })))
  }

  async function save() {
    if (!parentName.trim()) { setMsg('Angiv et overprodukt-navn'); return }
    setSaving(true); setMsg(null)

    // 1. Opret nyt overprodukt
    const createRes  = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: parentName.trim(), status: 'draft', categories: products[0]?.categories ?? [], boat_type: [] }),
    })
    const createJson = await createRes.json()
    const parentId   = createJson.data?.id
    if (!parentId) { setMsg('Fejl: ' + (createJson.error ?? 'Kunne ikke oprette overprodukt')); setSaving(false); return }

    // 2. Opret product_variants rækker
    let errors = 0
    for (let i = 0; i < products.length; i++) {
      const p    = products[i]
      const vr   = variantRows[i]
      const attrs = vr.attrs.filter(a => a.key.trim()).map(a => ({ name: a.key.trim(), value: a.val.trim() }))
      const res  = await fetch(`/api/products/${parentId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: attrs, ean: p.ean, sales_price: p.sales_price }),
      })
      const json = await res.json()
      if (json.error) errors++
    }

    if (errors > 0) { setMsg(`Oprettet overprodukt, men ${errors} varianter fejlede`); setSaving(false) }
    else { setMsg(`✓ Oprettet "${parentName.trim()}" med ${products.length} varianter`); setTimeout(() => { onDone(); onClose() }, 1200) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-xl z-50 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Opret variantfamilie</h3>
            <p className="text-xs text-gray-400 mt-0.5">{products.length} produkter → 1 overprodukt + {products.length} varianter</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
          {/* Overprodukt navn */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Overprodukt-navn</label>
            <input value={parentName} onChange={e => onParentNameChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="F.eks. Wirelås rustfri Duplex" />
            <p className="text-xs text-gray-400 mt-1">Det fælles overprodukt. Varianterne grupperes under det.</p>
          </div>

          {/* Per-variant attributter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Hvad adskiller hver variant?</label>
            <p className="text-xs text-gray-400 mb-3">Nøgler synkroniseres på tværs — værdier er per variant. F.eks. størrelse = 3mm, pakke = 2 stk.</p>
            <div className="space-y-3">
              {products.map((p, i) => {
                const vr     = variantRows[i]
                const isOpen = expandedIdxs.has(i)
                return (
                  <div key={p.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Korte header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                      {p.primary_image_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.primary_image_url} alt="" className="w-8 h-8 object-contain rounded border border-gray-200 bg-white shrink-0" />
                        : <div className="w-8 h-8 rounded border border-gray-100 bg-gray-100 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500 shrink-0">{p.internal_sku}</span>
                          <span className="text-xs text-gray-700 truncate font-medium">{p.name}</span>
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                          {p.sales_price != null && <span>Pris: <span className="text-gray-600">{p.sales_price.toLocaleString('da-DK')} kr</span></span>}
                          {p.own_stock_quantity > 0 && <span className="text-green-600">Lager: {p.own_stock_quantity}</span>}
                        </div>
                      </div>
                      <button onClick={() => setExpandedIdxs(prev => { const n = new Set(prev); isOpen ? n.delete(i) : n.add(i); return n })}
                        className="text-xs text-gray-400 hover:text-gray-600 shrink-0 px-1" title={isOpen ? 'Skjul' : 'Vis'}>
                        {isOpen ? '▲' : '▼'}
                      </button>
                    </div>

                    {/* Attribut-felter */}
                    <div className="px-3 py-2.5 space-y-1.5 border-t border-gray-100">
                      {vr?.attrs.map((a, j) => (
                        <div key={j} className="flex gap-1.5 items-center">
                          <input placeholder="størrelse" value={a.key}
                            onChange={e => setAttr(i, j, 'key', e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          <span className="text-gray-300 text-xs">=</span>
                          <input placeholder="3mm" value={a.val}
                            onChange={e => setAttr(i, j, 'val', e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          <button onClick={() => removeAttr(j)} className="text-gray-300 hover:text-red-400 text-sm">×</button>
                        </div>
                      ))}
                      <button onClick={addAttr} className="text-xs text-blue-500 hover:underline">+ Attribut</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {msg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith('Fejl') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 shrink-0">
          <button onClick={save} disabled={saving || !parentName.trim()}
            className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40">
            {saving ? 'Opretter...' : `Opret overprodukt + ${products.length} varianter`}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Annuller</button>
        </div>
      </div>
    </>
  )
}

type ApiResponse = {
  data: Product[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Kladde',     color: 'bg-gray-100 text-gray-600'  },
  validated: { label: 'Valideret',  color: 'bg-blue-100 text-blue-700'  },
  published: { label: 'Publiceret', color: 'bg-green-100 text-green-700' },
}

type ColKey =
  | 'image' | 'name' | 'internal_sku' | 'manufacturer_sku' | 'ean'
  | 'woo_bestillingsnummer' | 'brand' | 'categories' | 'sales_price'
  | 'own_stock_quantity' | 'weight' | 'status' | 'woo_sync_status'
  | 'image_count' | 'created_at' | 'updated_at'

type ColDef = { key: ColKey; label: string; sortable?: string; defaultOn: boolean }

const ALL_COLUMNS: ColDef[] = [
  { key: 'image',               label: 'Billede',          defaultOn: true  },
  { key: 'name',                label: 'Navn',             sortable: 'name',               defaultOn: true  },
  { key: 'internal_sku',        label: 'Varenr.',          sortable: 'internal_sku',       defaultOn: true  },
  { key: 'manufacturer_sku',    label: 'Prod. SKU',        defaultOn: false },
  { key: 'ean',                 label: 'EAN',              defaultOn: false },
  { key: 'woo_bestillingsnummer', label: 'Bestillingsnr.', defaultOn: false },
  { key: 'brand',               label: 'Brand',            defaultOn: false },
  { key: 'categories',          label: 'Kategori',         defaultOn: true  },
  { key: 'sales_price',         label: 'Pris',             sortable: 'sales_price',        defaultOn: true  },
  { key: 'own_stock_quantity',  label: 'Lager',            sortable: 'own_stock_quantity', defaultOn: true  },
  { key: 'weight',              label: 'Vægt',             defaultOn: false },
  { key: 'image_count',         label: 'Billeder',         defaultOn: false },
  { key: 'status',              label: 'Status',           defaultOn: true  },
  { key: 'woo_sync_status',     label: 'Woo sync',         defaultOn: true  },
  { key: 'created_at',          label: 'Oprettet',         sortable: 'created_at',         defaultOn: false },
  { key: 'updated_at',          label: 'Sidst opdateret',  sortable: 'updated_at',         defaultOn: false },
]

const STORAGE_KEY = 'kmb-product-columns'

function loadVisibleCols(): Set<ColKey> {
  if (typeof window === 'undefined') return new Set(ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key))
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return new Set(JSON.parse(saved) as ColKey[])
  } catch { /* ignore */ }
  return new Set(ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key))
}

export default function ProductsPage() {
  const [products,    setProducts]    = useState<Product[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [status,      setStatus]      = useState('')
  const [category,    setCategory]    = useState('')
  const [page,        setPage]        = useState(1)
  const [sort,        setSort]        = useState('name')
  const [order,       setOrder]       = useState<'asc'|'desc'>('asc')
  const [supplierId,  setSupplierId]  = useState('')
  const [suppliers,   setSuppliers]   = useState<{ id: string; name: string }[]>([])
  const [categories,  setCategories]  = useState<string[]>([])
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(loadVisibleCols)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [checkedIds,  setCheckedIds]  = useState<Set<string>>(new Set())
  const [familyPanelOpen, setFamilyPanelOpen] = useState(false)
  const [deduping,    setDeduping]    = useState(false)
  const [dedupeResult, setDedupeResult] = useState<{ message: string; deleted: number } | null>(null)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)

  async function runDeduplicate() {
    if (!confirm('Dette vil finde og slette dublerede produkter (samme navn) og samle leverandørlinks på det bedste produkt. Fortsæt?')) return
    setDeduping(true); setDedupeResult(null)
    try {
      const res  = await fetch('/api/products/deduplicate', { method: 'POST' })
      const json = await res.json()
      setDedupeResult({ message: json.message ?? 'Færdig', deleted: json.deleted ?? 0 })
      if ((json.deleted ?? 0) > 0) fetchProducts()
    } catch (e) { setDedupeResult({ message: String(e), deleted: 0 }) }
    finally { setDeduping(false) }
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ search, status, category, page: String(page), per_page: '50', sort, order })
    if (supplierId) params.set('supplier_id', supplierId)
    const res  = await fetch(`/api/products?${params}`)
    const json: ApiResponse = await res.json()
    setProducts(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    setLoading(false)
    setCheckedIds(new Set())
  }, [search, status, category, supplierId, page, sort, order])

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setCheckedIds(prev => prev.size === products.length ? new Set() : new Set(products.map(p => p.id)))
  }

  useEffect(() => { fetchProducts() }, [fetchProducts])

  useEffect(() => {
    fetch('/api/products?per_page=100&sort=name')
      .then(r => r.json())
      .then((json: ApiResponse) => {
        const cats = new Set<string>()
        json.data.forEach(p => p.categories?.forEach(c => cats.add(c)))
        setCategories([...cats].sort())
      })
  }, [])

  useEffect(() => {
    fetch('/api/suppliers').then(r => r.json())
      .then(j => setSuppliers((j.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  function toggleSort(col: string) {
    if (sort === col) setOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setOrder('asc') }
    setPage(1)
  }

  function toggleCol(key: ColKey) {
    const next = new Set(visibleCols)
    if (next.has(key)) next.delete(key); else next.add(key)
    setVisibleCols(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  }

  const cols     = ALL_COLUMNS.filter(c => visibleCols.has(c.key))
  const colCount = cols.length + 1

  const SortIcon = ({ col }: { col: string }) => {
    if (sort !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-blue-500 ml-1">{order === 'asc' ? '↑' : '↓'}</span>
  }

  function renderCell(col: ColDef, p: Product) {
    switch (col.key) {
      case 'image':
        return p.primary_image_url ? (
          <div className="w-10 h-10 rounded border border-gray-200 overflow-hidden bg-gray-50 relative">
            <Image src={p.primary_image_url} alt={p.name} fill className="object-contain" unoptimized />
          </div>
        ) : (
          <div className="w-10 h-10 rounded border border-gray-200 bg-gray-100 flex items-center justify-center text-gray-300 text-xs">—</div>
        )
      case 'name':
        return (
          <div>
            <div className="flex items-start gap-2">
              <span className="font-medium text-gray-900 line-clamp-2 leading-tight">{p.name}</span>
              {p.variant_count > 0 && (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">🔀 {p.variant_count}</span>
              )}
            </div>
            {p.brand && <span className="text-xs text-gray-400 mt-0.5 block">{p.brand}</span>}
          </div>
        )
      case 'internal_sku':
        return <div className="font-mono text-xs text-gray-600">{p.internal_sku}</div>
      case 'manufacturer_sku':
        return <span className="font-mono text-xs text-gray-500">{p.manufacturer_sku ?? <span className="text-gray-300">—</span>}</span>
      case 'ean':
        return <span className="font-mono text-xs text-gray-500">{p.ean ?? <span className="text-gray-300">—</span>}</span>
      case 'woo_bestillingsnummer':
        return <span className="font-mono text-xs text-gray-500">{p.woo_bestillingsnummer ?? <span className="text-gray-300">—</span>}</span>
      case 'brand':
        return <span className="text-xs text-gray-700">{p.brand ?? <span className="text-gray-300">—</span>}</span>
      case 'categories':
        return (
          <div>
            {p.categories?.slice(0, 2).map(c => (
              <span key={c} className="inline-block text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-1 mb-0.5">{c}</span>
            ))}
            {(p.categories?.length ?? 0) > 2 && <span className="text-xs text-gray-400">+{p.categories.length - 2}</span>}
          </div>
        )
      case 'sales_price':
        return p.sales_price != null ? (
          <div className="text-right whitespace-nowrap">
            {p.sale_price != null && p.sale_price < p.sales_price ? (
              <>
                <span className="text-red-600 font-medium">{p.sale_price.toLocaleString('da-DK')} kr</span>
                <span className="text-gray-400 line-through text-xs ml-1">{p.sales_price.toLocaleString('da-DK')}</span>
              </>
            ) : (
              <span className="text-gray-900 font-medium">{p.sales_price.toLocaleString('da-DK')} kr</span>
            )}
          </div>
        ) : <span className="text-gray-300 float-right">—</span>
      case 'own_stock_quantity':
        return (
          <div className="text-right">
            <span className={`font-medium tabular-nums ${p.own_stock_quantity > 0 ? 'text-green-700' : p.own_stock_quantity === 0 ? 'text-gray-400' : 'text-red-500'}`}>
              {p.own_stock_quantity}
            </span>
            {p.own_stock_reserved > 0 && <span className="text-xs text-orange-500 ml-1">({p.own_stock_reserved} res.)</span>}
          </div>
        )
      case 'weight':
        return <span className="text-xs text-gray-600">{p.weight != null ? `${p.weight} kg` : <span className="text-gray-300">—</span>}</span>
      case 'image_count':
        return <span className="text-xs text-gray-500 tabular-nums">{p.image_count || <span className="text-gray-300">0</span>}</span>
      case 'status':
        return (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[p.status]?.color}`}>
            {STATUS_LABELS[p.status]?.label ?? p.status}
          </span>
        )
      case 'woo_sync_status':
        return p.woo_product_id ? (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            p.woo_sync_status === 'synced' ? 'bg-green-50 text-green-600' :
            p.woo_sync_status === 'error'  ? 'bg-red-50 text-red-600'    :
                                             'bg-yellow-50 text-yellow-600'
          }`}>{p.woo_sync_status ?? 'ukendt'}</span>
        ) : <span className="text-xs text-gray-300">—</span>
      case 'created_at':
        return <span className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString('da-DK')}</span>
      case 'updated_at':
        return <span className="text-xs text-gray-500">{new Date(p.updated_at).toLocaleDateString('da-DK')}</span>
    }
  }

  const panelOpen = selectedId !== null

  return (
    <div className="flex h-full overflow-hidden">
      {/* Bulk variant panel (modal) */}
      {familyPanelOpen && checkedIds.size >= 2 && (
        <ProductVariantFamilyPanel
          products={products.filter(p => checkedIds.has(p.id))}
          onClose={() => setFamilyPanelOpen(false)}
          onDone={() => { fetchProducts(); setCheckedIds(new Set()) }}
        />
      )}

      {/* ── Left: list ──────────────────────────────────────────────────────── */}
      <div className={`flex flex-col min-w-0 transition-all duration-200 ${panelOpen ? 'w-[55%]' : 'flex-1'}`}>
        {/* Topbar */}
        <div className="border-b border-gray-200 bg-white px-5 py-3 flex items-center justify-between shrink-0 gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Produkter</h2>
            <p className="text-xs text-gray-500">{total.toLocaleString('da-DK')} produkter</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="search" placeholder="Søg navn, varenr., EAN..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-52 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Alle statusser</option>
              <option value="draft">Kladde</option>
              <option value="validated">Valideret</option>
              <option value="published">Publiceret</option>
            </select>
            <select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Alle kategorier</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {suppliers.length > 0 && (
              <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1) }}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Alle leverandører</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            {/* Kolonne-vælger */}
            <div className="relative" ref={colMenuRef}>
              <button onClick={() => setColMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded-md transition-colors ${
                  colMenuOpen ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Kolonner
              </button>
              {colMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-52 py-2">
                  <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vis kolonner</span>
                    <button onClick={() => {
                      const defaults = new Set(ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key))
                      setVisibleCols(defaults)
                      localStorage.setItem(STORAGE_KEY, JSON.stringify([...defaults]))
                    }} className="text-xs text-blue-500 hover:text-blue-700">Nulstil</button>
                  </div>
                  <div className="py-1">
                    {ALL_COLUMNS.map(col => (
                      <label key={col.key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)}
                          className="w-3.5 h-3.5 accent-blue-500" />
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={runDeduplicate} disabled={deduping} title="Find og slet dublerede produkter"
              className="flex items-center gap-1 px-2.5 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-40">
              {deduping ? '⏳' : '🧹'}
            </button>
          </div>
        </div>

        {dedupeResult && (
          <div className={`mx-4 mt-2 px-4 py-2 rounded-lg text-sm flex items-center justify-between ${
            dedupeResult.deleted > 0 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            <span>{dedupeResult.message}</span>
            <button onClick={() => setDedupeResult(null)} className="text-gray-400 hover:text-gray-600 ml-4">×</button>
          </div>
        )}

        {/* Tabel */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={products.length > 0 && checkedIds.size === products.length}
                    onChange={toggleAll} className="w-3.5 h-3.5 accent-purple-600 cursor-pointer" />
                </th>
                {cols.map(col => (
                  <th key={col.key} onClick={col.sortable ? () => toggleSort(col.sortable!) : undefined}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide ${
                      col.sortable ? 'cursor-pointer hover:text-gray-700' : ''
                    } ${col.key === 'sales_price' || col.key === 'own_stock_quantity' ? 'text-right' : ''}`}>
                    {col.label}
                    {col.sortable && <SortIcon col={col.sortable} />}
                  </th>
                ))}
                <th className="w-8 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={colCount} className="px-4 py-12 text-center text-gray-400">Henter produkter...</td></tr>
              )}
              {!loading && products.length === 0 && (
                <tr><td colSpan={colCount} className="px-4 py-12 text-center text-gray-400">Ingen produkter fundet</td></tr>
              )}
              {!loading && products.map(p => {
                const isSelected = selectedId === p.id
                const isChecked  = checkedIds.has(p.id)
                return (
                  <tr key={p.id}
                    onClick={() => setSelectedId(prev => prev === p.id ? null : p.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' :
                      isChecked  ? 'bg-purple-50' : 'hover:bg-gray-50'
                    }`}>
                    <td className="w-10 px-3 py-2" onClick={e => toggleCheck(p.id, e)}>
                      <input type="checkbox" checked={isChecked} onChange={() => {}}
                        className="w-3.5 h-3.5 accent-purple-600 cursor-pointer" />
                    </td>
                    {cols.map(col => (
                      <td key={col.key} className={`px-4 py-2 ${col.key === 'name' ? 'max-w-[200px]' : ''} ${
                        col.key === 'sales_price' || col.key === 'own_stock_quantity' ? 'text-right' : ''
                      }`}>
                        {renderCell(col, p)}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Link href={`/products/${p.id}`} onClick={e => e.stopPropagation()}
                        title="Åbn på egen side"
                        className="text-gray-300 hover:text-blue-500 text-base transition-colors">
                        ↗
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Multi-select bar */}
        {checkedIds.size >= 2 && (
          <div className="border-t border-purple-200 bg-purple-50 px-5 py-2.5 flex items-center gap-3 shrink-0">
            <span className="text-sm font-medium text-purple-800">{checkedIds.size} valgt</span>
            <button onClick={() => setFamilyPanelOpen(true)}
              className="px-3 py-1.5 text-sm bg-purple-700 text-white rounded-lg hover:bg-purple-800 font-medium">
              🔀 Sammenkæd som varianter
            </button>
            <button onClick={() => setCheckedIds(new Set())} className="px-2 py-1 text-sm text-purple-500 hover:text-purple-700">
              Fravælg alle
            </button>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 bg-white px-5 py-2.5 flex items-center justify-between shrink-0">
            <p className="text-sm text-gray-500">
              Viser {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} af {total.toLocaleString('da-DK')}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)}           disabled={page === 1}          className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">«</button>
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1}          className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Forrige</button>
              <span className="px-3 py-1 text-sm text-gray-600">Side {page} / {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="px-3 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">Næste</button>
              <button onClick={() => setPage(totalPages)}  disabled={page === totalPages} className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">»</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: detail panel ──────────────────────────────────────────────── */}
      {panelOpen && (
        <div className="w-[45%] border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
          <ProductDetail
            productId={selectedId!}
            mode="panel"
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  )
}
