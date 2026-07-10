'use client'

import { useState } from 'react'
import { useCart, fmtPrice } from '../../_cart'

type Props = {
  product: { id: string; name: string; price: number; image?: string }
}

export function AddToCartBtn({ product }: Props) {
  const { add } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  function handleAdd() {
    for (let i = 0; i < qty; i++) {
      add({ id: product.id, name: product.name, price: product.price, image: product.image, sku: product.id })
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="ls-add-to-cart">
      <div className="ls-qty">
        <button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
        <span>{qty}</span>
        <button onClick={() => setQty(q => q + 1)}>+</button>
      </div>
      <button
        onClick={handleAdd}
        className="ls-btn-primary"
        style={{ flex: 1, justifyContent: 'center', background: added ? 'var(--stock)' : undefined }}
      >
        {added ? '✓ Lagt i kurv' : product.price > 0 ? `Læg i kurv · ${fmtPrice(product.price * qty)}` : 'Læg i kurv'}
      </button>
    </div>
  )
}
