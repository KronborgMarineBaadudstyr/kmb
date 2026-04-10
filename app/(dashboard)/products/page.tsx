'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  primary_image_url: string | null
  image_count: number
  created_at: string
  updated_at: string
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
  const [categories,  setCategories]  = useState<string[]>([])
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(loadVisibleCols)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

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
    const res  = await fetch(`/api/products?${params}`)
    const json: ApiResponse = await res.json()
    setProducts(json.data ?? [])
    setTotal(json.total ?? 0)
    setTotalPages(json.total_pages ?? 1)
    setLoading(false)
  }, [search, status, category, page, sort, order])

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
            <Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600 line-clamp-2 leading-tight">
              {p.name}
            </Link>
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
        </div>
      </div>

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
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
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
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
                  <Link href={`/products/${p.id}`} className="text-gray-400 hover:text-blue-500 text-base">→</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
