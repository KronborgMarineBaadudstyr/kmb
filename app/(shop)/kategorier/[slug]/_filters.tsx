'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

type FiltersProps = {
  brands:   string[]
  minPrice: number
  maxPrice: number
  current: {
    sort:     string
    brand:    string
    inStock:  boolean
    minPrice: string
    maxPrice: string
  }
}

export function CategoryFilters({ brands, minPrice, maxPrice, current }: FiltersProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const push = useCallback((updates: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString())
    p.set('page', '1')
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    router.push(`${pathname}?${p.toString()}`)
  }, [params, pathname, router])

  return (
    <div className="ls-cat-filters">
      {/* Sortering */}
      <div className="ls-cat-filters-group">
        <span className="ls-cat-filters-label">Sorter</span>
        <select
          className="ls-sort-select"
          value={current.sort}
          onChange={e => push({ sort: e.target.value })}
        >
          <option value="name_asc">Navn A–Å</option>
          <option value="name_desc">Navn Å–A</option>
          <option value="price_asc">Pris lav–høj</option>
          <option value="price_desc">Pris høj–lav</option>
        </select>
      </div>

      {/* På lager */}
      <div className="ls-cat-filters-group">
        <label className="ls-cat-filter-toggle">
          <input
            type="checkbox"
            checked={current.inStock}
            onChange={e => push({ in_stock: e.target.checked ? '1' : null })}
          />
          <span>Kun på lager</span>
        </label>
      </div>

      {/* Brand */}
      {brands.length > 0 && (
        <div className="ls-cat-filters-group ls-cat-filters-brands">
          <span className="ls-cat-filters-label">Brand</span>
          <div className="ls-cat-brand-chips">
            <button
              className={`ls-cat-brand-chip${!current.brand ? ' active' : ''}`}
              onClick={() => push({ brand: null })}
            >
              Alle
            </button>
            {brands.map(b => (
              <button
                key={b}
                className={`ls-cat-brand-chip${current.brand === b ? ' active' : ''}`}
                onClick={() => push({ brand: current.brand === b ? null : b })}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pris */}
      {maxPrice > 0 && (
        <div className="ls-cat-filters-group">
          <span className="ls-cat-filters-label">Pris (kr)</span>
          <div className="ls-cat-price-inputs">
            <input
              type="number"
              min={0}
              placeholder={String(Math.floor(minPrice))}
              value={current.minPrice}
              onChange={e => push({ min_price: e.target.value || null })}
              className="ls-cat-price-input"
            />
            <span className="ls-cat-price-sep">–</span>
            <input
              type="number"
              min={0}
              placeholder={String(Math.ceil(maxPrice))}
              value={current.maxPrice}
              onChange={e => push({ max_price: e.target.value || null })}
              className="ls-cat-price-input"
            />
          </div>
        </div>
      )}

      {/* Nulstil */}
      {(current.brand || current.inStock || current.minPrice || current.maxPrice) && (
        <button
          className="ls-cat-filter-reset"
          onClick={() => push({ brand: null, in_stock: null, min_price: null, max_price: null })}
        >
          ✕ Nulstil filtre
        </button>
      )}
    </div>
  )
}
