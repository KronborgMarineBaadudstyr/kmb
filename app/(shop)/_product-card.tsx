'use client'

import Link from 'next/link'
import Image from 'next/image'
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

export function ProductCard({ product: p }: { product: Product }) {
  const { add } = useCart()
  const [toasted, setToasted] = useState(false)

  const img = p.product_images?.find(i => i.is_primary)?.url
    ?? p.product_images?.[0]?.url

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
          <Image src={img} alt={p.name} width={200} height={200} style={{ objectFit: 'contain', padding: 12 }} />
        ) : (
          <span className="placeholder">⚓</span>
        )}
      </div>
      <div className="ls-prodcard-body">
        {p.brand && <div className="ls-prodcard-brand">{p.brand}</div>}
        <div className="ls-prodcard-name">{p.name}</div>
        <div className="ls-prodcard-price">
          {p.sales_price ? fmtPrice(p.sales_price) : <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>Pris ukendt</span>}
        </div>
        <button
          onClick={handleAdd}
          style={{
            marginTop: 8,
            padding: '7px 12px',
            background: toasted ? 'var(--stock)' : 'var(--navy)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
            transition: 'background .2s',
            width: '100%',
          }}
        >
          {toasted ? '✓ Lagt i kurv' : 'Læg i kurv'}
        </button>
      </div>
    </Link>
  )
}
