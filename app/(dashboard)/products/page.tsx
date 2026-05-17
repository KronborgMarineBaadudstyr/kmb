'use client'

import { useEffect, useState, useCallback, useRef, forwardRef } from 'react'
void forwardRef // suppress unused import
import Link from 'next/link'
import Image from 'next/image'

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
  parent_product_id: string | null
  variant_attributes: Record<string, string> | null
  variant_count: number
  primary_image_url: string | null
  image_count: number
  created_at: string
  updated_at: string
}

// ── Variant Merge Panel ────────────────────────────────────────────────────────
function VariantMergePanel({
  product,
  onClose,
  onDone,
}: {
  product: Product
  onClose: () => void
  onDone: () => void
}) {
  const [search,        setSearch]        = useState('')
  const [results,       setResults]       = useState<Product[]>([])
  const [searching,     setSearching]     = useState(false)
  const [selectedOther, setSelectedOther] = useState<Product | null>(null)
  // who is parent?  'this' = current product is parent, 'other' = other is parent
  const [parentChoice,  setParentChoice]  = useState<'this' | 'other'>('this')
  const [attrs,         setAttrs]         = useState<{ key: string; val: string }[]>([{ key: '', val: '' }])
  const [saving,        setSaving]        = useState(false)
  const [msg,           setMsg]           = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onSearchChange(v: string) {
    setSearch(v)
    if (timer.current) clearTimeout(timer.current)
    if (!v.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const res  = await fetch(`/api/products?search=${encodeURIComponent(v)}&per_page=8`)
      const json = await res.json()
      setResults((json.data ?? []).filter((p: Product) => p.id !== product.id))
      setSearching(false)
    }, 300)
  }

  async function save() {
    if (!selectedOther) return
    setSaving(true)
    setMsg(null)
    const parentId  = parentChoice === 'this' ? product.id : selectedOther.id
    const variantId = parentChoice === 'this' ? selectedOther.id : product.id

    // Set variant_attributes on the variant product
    const variantAttrs = Object.fromEntries(
      attrs.filter(a => a.key.trim()).map(a => [a.key.trim(), a.val.trim()])
    )

    const res = await fetch(`/api/products/${parentId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_product_id: variantId, variant_attributes: variantAttrs }),
    })
    const json = await res.json()
    if (json.error) { setMsg('Fejl: ' + json.error); setSaving(false); return }
    setMsg('✓ Varianter sammenkædet!')
    setTimeout(() => { onDone(); onClose() }, 800)
    setSaving(false)
  }

  const parentProduct  = parentChoice === 'this' ? product : selectedOther
  const variantProduct = parentChoice === 'this' ? selectedOther : product

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Sammenkæd varianter</h3>
            <p className="text-xs text-gray-400 mt-0.5">Angiv at to produkter er varianter af hinanden</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Current product */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <div className="text-xs text-gray-400 mb-1">Dette produkt</div>
            <div className="font-medium text-gray-800">{product.name}</div>
            <div className="font-mono text-xs text-gray-500">{product.internal_sku}</div>
          </div>

          {/* Search for other product */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Søg det andet produkt</label>
            <input
              type="search"
              placeholder="Søg navn eller varenr..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searching && <div className="text-xs text-gray-400 mt-1">Søger...</div>}
            {results.length > 0 && !selectedOther && (
              <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden">
                {results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedOther(r); setSearch(r.name); setResults([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                  >
                    <div className="font-medium text-gray-800">{r.name}</div>
                    <div className="font-mono text-xs text-gray-400">{r.internal_sku}</div>
                  </button>
                ))}
              </div>
            )}
            {selectedOther && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-blue-800">{selectedOther.name}</div>
                  <div className="font-mono text-xs text-blue-500">{selectedOther.internal_sku}</div>
                </div>
                <button onClick={() => { setSelectedOther(null); setSearch('') }} className="text-blue-400 hover:text-blue-600 text-lg">×</button>
              </div>
            )}
          </div>

          {/* Parent choice */}
          {selectedOther && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Hvem er forælderen (det overordnede produkt)?</label>
              <div className="space-y-2">
                {([['this', product], ['other', selectedOther]] as const).map(([val, p]) => (
                  <label key={val} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${parentChoice === val ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" checked={parentChoice === val} onChange={() => setParentChoice(val)} className="mt-0.5 accent-blue-600" />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.internal_sku}</div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Forælder: <span className="font-medium text-gray-600">{parentProduct?.name}</span> →
                Variant: <span className="font-medium text-gray-600">{variantProduct?.name}</span>
              </p>
            </div>
          )}

          {/* Variant attributes for the variant product */}
          {selectedOther && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Variantattributter på <span className="text-gray-800">{variantProduct?.name}</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">F.eks. farve = rød, størrelse = 40cm</p>
              <div className="space-y-2">
                {attrs.map((a, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      placeholder="Attribut (farve)"
                      value={a.key}
                      onChange={e => setAttrs(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <span className="text-gray-400">=</span>
                    <input
                      placeholder="Værdi (rød)"
                      value={a.val}
                      onChange={e => setAttrs(prev => prev.map((x, j) => j === i ? { ...x, val: e.target.value } : x))}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <button onClick={() => setAttrs(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                ))}
                <button onClick={() => setAttrs(prev => [...prev, { key: '', val: '' }])} className="text-xs text-blue-500 hover:underline">+ Tilføj attribut</button>
              </div>
            </div>
          )}

          {msg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith('Fejl') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {msg}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex gap-2 shrink-0">
          <button
            onClick={save}
            disabled={!selectedOther || saving}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? 'Gemmer...' : 'Sammenkæd som varianter'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            Annuller
          </button>
        </div>
      </div>
    </>
  )
}

// ── Bulk variant-panel ────────────────────────────────────────────────────────
function BulkVariantPanel({
  products,
  onClose,
  onDone,
}: {
  products: Product[]
  onClose: () => void
  onDone: () => void
}) {
  const [parentId, setParentId] = useState<string>(products[0]?.id ?? '')
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState<string | null>(null)

  const parentProduct  = products.find(p => p.id === parentId)
  const variantProducts = products.filter(p => p.id !== parentId)

  async function save() {
    setSaving(true)
    setMsg(null)
    let errors = 0
    for (const v of variantProducts) {
      const res = await fetch(`/api/products/${parentId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_product_id: v.id }),
      })
      const json = await res.json()
      if (json.error) errors++
    }
    if (errors > 0) {
      setMsg(`Fejl: ${errors} produkter kunne ikke sammenkædes`)
      setSaving(false)
    } else {
      setMsg(`✓ ${variantProducts.length} varianter sammenkædet under "${parentProduct?.name}"`)
      setTimeout(() => { onDone(); onClose() }, 1200)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-50 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Sammenkæd som varianter</h3>
            <p className="text-xs text-gray-400 mt-0.5">{products.length} produkter → 1 overprodukt + {products.length - 1} varianter</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Hvem er overprodukt (forælderen)?
            </label>
            <p className="text-xs text-gray-400 mb-3">De øvrige produkter bliver varianter under denne.</p>
            <div className="space-y-2">
              {products.map(p => {
                const isParent = p.id === parentId
                const imgs = (p as Product & { product_images?: Array<{url:string;is_primary:boolean}> })
                const imgUrl = p.primary_image_url
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isParent ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="parent"
                      checked={isParent}
                      onChange={() => setParentId(p.id)}
                      className="accent-purple-600"
                    />
                    {imgUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgUrl} alt="" className="w-10 h-10 object-contain rounded border border-gray-200 bg-gray-50 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded border border-gray-100 bg-gray-50 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 leading-tight">{p.name}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">{p.internal_sku}</div>
                      {p.parent_product_id && (
                        <span className="text-xs text-orange-500">⚠ Er allerede en variant</span>
                      )}
                    </div>
                    {isParent && <span className="text-xs text-purple-600 font-medium shrink-0">Overprodukt</span>}
                  </label>
                )
              })}
            </div>
          </div>

          {msg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith('Fejl') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {msg}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 shrink-0">
          <button
            onClick={save}
            disabled={saving || variantProducts.length === 0}
            className="flex-1 px-4 py-2 text-sm bg-purple-700 text-white rounded-lg hover:bg-purple-800 disabled:opacity-40"
          >
            {saving ? 'Sammenkæder...' : `Sæt ${variantProducts.length} som varianter under "${parentProduct?.name?.slice(0, 30)}..."`}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            Annuller
          </button>
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
  draft:     { label: 'Kladde',    color: 'bg-gray-100 text-gray-600' },
  validated: { label: 'Valideret', color: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publiceret',color: 'bg-green-100 text-green-700' },
}

type ColKey =
  | 'image' | 'name' | 'internal_sku' | 'manufacturer_sku' | 'ean'
  | 'woo_bestillingsnummer' | 'brand' | 'categories' | 'sales_price'
  | 'own_stock_quantity' | 'weight' | 'status' | 'woo_sync_status'
  | 'image_count' | 'created_at' | 'updated_at'

type ColDef = { key: ColKey; label: string; sortable?: string; defaultOn: boolean }

const ALL_COLUMNS: ColDef[] = [
  { key: 'image',               label: 'Billede',        defaultOn: true  },
  { key: 'name',                label: 'Navn',           sortable: 'name',               defaultOn: true  },
  { key: 'internal_sku',        label: 'Varenr.',        sortable: 'internal_sku',       defaultOn: true  },
  { key: 'manufacturer_sku',    label: 'Prod. SKU',      defaultOn: false },
  { key: 'ean',                 label: 'EAN',            defaultOn: false },
  { key: 'woo_bestillingsnummer', label: 'Bestillingsnr.', defaultOn: false },
  { key: 'brand',               label: 'Brand',          defaultOn: false },
  { key: 'categories',          label: 'Kategori',       defaultOn: true  },
  { key: 'sales_price',         label: 'Pris',           sortable: 'sales_price',        defaultOn: true  },
  { key: 'own_stock_quantity',  label: 'Lager',          sortable: 'own_stock_quantity', defaultOn: true  },
  { key: 'weight',              label: 'Vægt',           defaultOn: false },
  { key: 'image_count',         label: 'Billeder',       defaultOn: false },
  { key: 'status',              label: 'Status',         defaultOn: true  },
  { key: 'woo_sync_status',     label: 'Woo sync',       defaultOn: true  },
  { key: 'created_at',          label: 'Oprettet',       sortable: 'created_at',         defaultOn: false },
  { key: 'updated_at',          label: 'Sidst opdateret', sortable: 'updated_at',        defaultOn: false },
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

const SORT_COLS = ALL_COLUMNS.filter(c => c.sortable)

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
  const [visibleCols,  setVisibleCols]  = useState<Set<ColKey>>(loadVisibleCols)
  const [colMenuOpen,  setColMenuOpen]  = useState(false)
  const [mergeProduct,   setMergeProduct]   = useState<Product | null>(null)
  const [checkedIds,     setCheckedIds]     = useState<Set<string>>(new Set())
  const [bulkVariantOpen,setBulkVariantOpen]= useState(false)
  const [deduping,       setDeduping]       = useState(false)
  const [dedupeResult,   setDedupeResult]   = useState<{ message: string; deleted: number } | null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)

  async function runDeduplicate() {
    if (!confirm('Dette vil finde og slette dublerede produkter (samme navn) og samle leverandørlinks på det bedste produkt. Fortsæt?')) return
    setDeduping(true)
    setDedupeResult(null)
    try {
      const res  = await fetch('/api/products/deduplicate', { method: 'POST' })
      const json = await res.json()
      setDedupeResult({ message: json.message ?? 'Færdig', deleted: json.deleted ?? 0 })
      if ((json.deleted ?? 0) > 0) fetchProducts()
    } catch (e) {
      setDedupeResult({ message: String(e), deleted: 0 })
    } finally {
      setDeduping(false)
    }
  }

  // Close column menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      search, status, category,
      page: String(page), per_page: '50',
      sort, order,
    })
    if (supplierId) params.set('supplier_id', supplierId)
    const res  = await fetch(`/api/products?${params}`)
    const json: ApiResponse = await res.json()
    setProducts(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    setLoading(false)
    setCheckedIds(new Set())
  }, [search, status, category, supplierId, page, sort, order])

  function toggleCheck(id: string) {
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
    fetch('/api/suppliers')
      .then(r => r.json())
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
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setVisibleCols(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  }

  const cols = ALL_COLUMNS.filter(c => visibleCols.has(c.key))
  // always add the arrow link column at the end
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
              <Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600 line-clamp-2 leading-tight">
                {p.name}
              </Link>
              {p.variant_count > 0 && (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                  🔀 {p.variant_count}
                </span>
              )}
              {p.parent_product_id && (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-500">
                  variant
                </span>
              )}
            </div>
            {p.brand && <span className="text-xs text-gray-400 mt-0.5 block">{p.brand}</span>}
          </div>
        )

      case 'internal_sku':
        return (
          <div className="font-mono text-xs text-gray-600">
            <div>{p.internal_sku}</div>
          </div>
        )

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
            {(p.categories?.length ?? 0) > 2 && (
              <span className="text-xs text-gray-400">+{p.categories.length - 2}</span>
            )}
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
            <span className={`font-medium tabular-nums ${
              p.own_stock_quantity > 0 ? 'text-green-700' :
              p.own_stock_quantity === 0 ? 'text-gray-400' : 'text-red-500'
            }`}>
              {p.own_stock_quantity}
            </span>
            {p.own_stock_reserved > 0 && (
              <span className="text-xs text-orange-500 ml-1">({p.own_stock_reserved} res.)</span>
            )}
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
            p.woo_sync_status === 'error'  ? 'bg-red-50 text-red-600'   :
                                             'bg-yellow-50 text-yellow-600'
          }`}>
            {p.woo_sync_status ?? 'ukendt'}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>

      case 'created_at':
        return <span className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString('da-DK')}</span>

      case 'updated_at':
        return <span className="text-xs text-gray-500">{new Date(p.updated_at).toLocaleDateString('da-DK')}</span>
    }
  }

  return (
    <div className="flex flex-col h-full">
      {mergeProduct && (
        <VariantMergePanel
          product={mergeProduct}
          onClose={() => setMergeProduct(null)}
          onDone={fetchProducts}
        />
      )}
      {bulkVariantOpen && checkedIds.size >= 2 && (
        <BulkVariantPanel
          products={products.filter(p => checkedIds.has(p.id))}
          onClose={() => setBulkVariantOpen(false)}
          onDone={() => { fetchProducts(); setCheckedIds(new Set()) }}
        />
      )}
      {/* Topbar */}
      <div className="border-b border-gray-200 bg-white px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Produkter</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString('da-DK')} produkter i Supabase
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Søg */}
          <input
            type="search"
            placeholder="Søg navn, varenr., EAN..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* Status filter */}
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Alle statusser</option>
            <option value="draft">Kladde</option>
            <option value="validated">Valideret</option>
            <option value="published">Publiceret</option>
          </select>
          {/* Kategori filter */}
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1) }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Alle kategorier</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* Leverandør filter */}
          {suppliers.length > 0 && (
            <select
              value={supplierId}
              onChange={e => { setSupplierId(e.target.value); setPage(1) }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Alle leverandører</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          {/* Kolonne-vælger */}
          <div className="relative" ref={colMenuRef}>
            <button
              onClick={() => setColMenuOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors ${
                colMenuOpen
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Kolonner
              <span className="text-xs text-gray-400">({visibleCols.size})</span>
            </button>

            {colMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-56 py-2">
                <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vis kolonner</span>
                  <button
                    onClick={() => {
                      const defaults = new Set(ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key))
                      setVisibleCols(defaults)
                      localStorage.setItem(STORAGE_KEY, JSON.stringify([...defaults]))
                    }}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Nulstil
                  </button>
                </div>
                <div className="py-1">
                  {ALL_COLUMNS.map(col => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleCols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="w-3.5 h-3.5 accent-blue-500"
                      />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dedupliker */}
          <button
            onClick={runDeduplicate}
            disabled={deduping}
            title="Find og slet dublerede produkter (samme navn)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-40"
          >
            {deduping ? '⏳' : '🧹'} Dedupliker
          </button>
        </div>
      </div>

      {/* Dedupliker resultat */}
      {dedupeResult && (
        <div className={`mx-8 mt-3 px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
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
                <input type="checkbox"
                  checked={products.length > 0 && checkedIds.size === products.length}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 accent-purple-600 cursor-pointer"
                />
              </th>
              {cols.map(col => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => toggleSort(col.sortable!) : undefined}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide ${
                    col.sortable ? 'cursor-pointer hover:text-gray-700' : ''
                  } ${col.key === 'sales_price' || col.key === 'own_stock_quantity' ? 'text-right' : ''}`}
                >
                  {col.label}
                  {col.sortable && <SortIcon col={col.sortable} />}
                </th>
              ))}
              <th className="w-8 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-gray-400">
                  Henter produkter...
                </td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-gray-400">
                  Ingen produkter fundet
                </td>
              </tr>
            )}
            {!loading && products.map(p => (
              <tr key={p.id} className={`transition-colors ${checkedIds.has(p.id) ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                <td className="w-10 px-3 py-2">
                  <input type="checkbox"
                    checked={checkedIds.has(p.id)}
                    onChange={() => toggleCheck(p.id)}
                    className="w-3.5 h-3.5 accent-purple-600 cursor-pointer"
                  />
                </td>
                {cols.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 ${col.key === 'name' ? 'max-w-xs' : ''} ${
                      col.key === 'sales_price' || col.key === 'own_stock_quantity' ? 'text-right' : ''
                    }`}
                  >
                    {renderCell(col, p)}
                  </td>
                ))}
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMergeProduct(p)}
                      title="Sammenkæd som varianter"
                      className="text-gray-300 hover:text-purple-500 transition-colors text-sm"
                    >
                      🔀
                    </button>
                    <Link href={`/products/${p.id}`} className="text-gray-400 hover:text-blue-500 text-base">→</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Flydende multiselect-bar */}
      {checkedIds.size >= 2 && (
        <div className="border-t border-purple-200 bg-purple-50 px-8 py-3 flex items-center gap-3 shrink-0">
          <span className="text-sm font-medium text-purple-800">{checkedIds.size} valgt</span>
          <button
            onClick={() => setBulkVariantOpen(true)}
            className="px-4 py-1.5 text-sm bg-purple-700 text-white rounded-lg hover:bg-purple-800 font-medium"
          >
            🔀 Sammenkæd som varianter
          </button>
          <button onClick={() => setCheckedIds(new Set())} className="px-3 py-1.5 text-sm text-purple-600 hover:text-purple-800">
            Fravælg alle
          </button>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 bg-white px-8 py-3 flex items-center justify-between shrink-0">
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
  )
}
