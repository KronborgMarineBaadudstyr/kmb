'use client'

import Link from 'next/link'
import { useCart, fmtPrice } from './_cart'
import { useState } from 'react'

type Product = {
  id: string
  name: string
  brand?: string | null
  sales_price?: number | null
  categories?: string[]
  product_images?: { url: string; is_primary: boolean }[]
}

function PriceDisplay({ price }: { price: number }) {
  const whole = Math.floor(price)
  const cents = Math.round((price - whole) * 100)
  return (
    <span className="ls-prodcard-price-wrap">
      <span className="ls-prodcard-price-kr">kr</span>
      <span className="ls-prodcard-price-whole">{whole.toLocaleString('da-DK')}</span>
      {cents > 0 && <span className="ls-prodcard-price-cents">,{String(cents).padStart(2, '0')}</span>}
    </span>
  )
}

export function ProductCard({ product: p }: { product: Product }) {
  const { add } = useCart()
  const [toasted, setToasted] = useState(false)

  const img = p.product_images?.find(i => i.is_primary)?.url
    ?? p.product_images?.[0]?.url

  const firstCat = p.categories?.[0]

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    add({
      id:    p.id,
      name:  p.name,
      price: p.sales_price ?? 0,
      image: img,
      sku:   p.id,
    })
    setToasted(true)
    setTimeout(() => setToasted(false), 1800)
  }

  return (
    <Link href={`/produkt/${p.id}`} className="ls-prodcard">
      <div className="ls-prodcard-thumb">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }} />
        ) : (
          <span className="placeholder">⚓</span>
        )}
      </div>
      <div className="ls-prodcard-body">
        <div className="ls-prodcard-meta">
          {p.brand && <span className="ls-prodcard-brand">{p.brand}</span>}
          {firstCat && <span className="ls-prodcard-cat">{firstCat}</span>}
        </div>
        <div className="ls-prodcard-name">{p.name}</div>
        <div className="ls-prodcard-price">
          {p.sales_price
            ? <PriceDisplay price={p.sales_price} />
            : <span className="ls-prodcard-price-unknown">Pris ukendt</span>}
        </div>
        <button
          onClick={handleAdd}
          className={`ls-prodcard-btn${toasted ? ' toasted' : ''}`}
        >
          {toasted ? '✓ Lagt i kurv' : 'Læg i kurv'}
        </button>
      </div>
    </Link>
  )
}
