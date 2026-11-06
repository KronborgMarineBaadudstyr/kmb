'use client'

import { useState } from 'react'
import { useCart } from '../../_cart'

type Variant = {
  id:                 string
  internal_variant_sku: string
  attributes:         { name: string; value: string }[]
  sales_price:        number | null
  own_stock_quantity: number
}

type Props = {
  variants:    Variant[]
  productId:   string
  productName: string
  basePrice:   number | null
  image?:      string | null
}

function fmtPrice(n: number) {
  return n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr'
}

export function VariantPicker({ variants, productId, productName, basePrice, image }: Props) {
  const { add } = useCart()
  const [selected, setSelected] = useState<string | null>(null)
  const [toasted, setToasted]   = useState(false)

  if (variants.length === 0) return null

  // Group attribute names
  const attrNames = [...new Set(variants.flatMap(v => v.attributes.map(a => a.name)))]

  // Build selection map: attrName → chosen value
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const first = variants[0]
    return Object.fromEntries(first.attributes.map(a => [a.name, a.value]))
  })

  // Find variant that matches all current selections
  const matched = variants.find(v =>
    attrNames.every(name => {
      const sel = selections[name]
      return !sel || v.attributes.some(a => a.name === name && a.value === sel)
    })
  ) ?? null

  const price     = matched?.sales_price ?? basePrice
  const inStock   = matched ? matched.own_stock_quantity > 0 : true

  function handleAdd() {
    if (!matched) return
    add({
      id:    `${productId}__${matched.id}`,
      name:  `${productName} (${matched.attributes.map(a => a.value).join(', ')})`,
      price: price ?? 0,
      image: image ?? undefined,
      sku:   matched.internal_variant_sku,
    })
    setToasted(true)
    setTimeout(() => setToasted(false), 1800)
  }

  return (
    <div className="ls-varpicker">
      {attrNames.map(attrName => {
        const values = [...new Set(variants.map(v => v.attributes.find(a => a.name === attrName)?.value).filter(Boolean))] as string[]
        return (
          <div key={attrName} className="ls-varpicker-group">
            <div className="ls-varpicker-label">
              {attrName}
              {selections[attrName] && (
                <span className="ls-varpicker-chosen">{selections[attrName]}</span>
              )}
            </div>
            <div className="ls-varpicker-chips">
              {values.map(val => {
                // Check if this value leads to an in-stock variant
                const hasStock = variants.some(v =>
                  v.attributes.some(a => a.name === attrName && a.value === val) &&
                  v.own_stock_quantity > 0
                )
                return (
                  <button
                    key={val}
                    className={[
                      'ls-varpicker-chip',
                      selections[attrName] === val ? 'active' : '',
                      !hasStock ? 'out' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelections(s => ({ ...s, [attrName]: val }))}
                  >
                    {val}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {matched && (
        <div className="ls-varpicker-summary">
          {price && <span className="ls-varpicker-price">{fmtPrice(price)}</span>}
          <span className={`ls-varpicker-stock ${inStock ? 'in' : 'out'}`}>
            {inStock ? `${matched.own_stock_quantity} på lager` : 'Ikke på lager'}
          </span>
        </div>
      )}

      <button
        className={`ls-prodcard-btn ls-varpicker-add${toasted ? ' toasted' : ''}`}
        onClick={handleAdd}
        disabled={!matched || !inStock}
      >
        {toasted ? '✓ Lagt i kurv' : matched ? 'Læg i kurv' : 'Vælg variant'}
      </button>
    </div>
  )
}
