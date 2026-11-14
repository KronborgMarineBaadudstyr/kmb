'use client'

import { useState } from 'react'
import { useCart } from '../../_cart'
import Link from 'next/link'
import { compareAttrValues, orderAttributeNames, type AttrOrder } from '@/lib/variant-attributes'
import { attrLabel } from '@/lib/shop/variant-pricing'

type Variant = {
  id:                 string
  internal_variant_sku: string
  attributes:         { name: string; value: string }[]
  sales_price:        number | null
  own_stock_quantity: number
  own_stock_reserved?: number
}

// Ledigt = beholdning minus det, der er reserveret til andre ordrer
const available = (v: Variant) => Math.max(0, v.own_stock_quantity - (v.own_stock_reserved ?? 0))

type Props = {
  variants:    Variant[]
  productId:   string
  productName: string
  basePrice:   number | null
  image?:      string | null
  attrOrder?:  AttrOrder      // rækkefølge fra Sortiment → Variant-egenskaber
  outlet?:     Variant[]      // varianter med afvigende pris — vises som selvstændige outlet-varer
}

function fmtPrice(n: number) {
  return n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr'
}

export function VariantPicker({ variants, productId, productName, basePrice, image, attrOrder = [], outlet = [] }: Props) {
  const { add } = useCart()
  const [selected, setSelected] = useState<string | null>(null)
  const [toasted, setToasted]   = useState(false)

  // Build selection map: attrName → chosen value (første variant i rækkefølgen er valgt fra start)
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries((variants[0]?.attributes ?? []).map(a => [a.name, a.value])))

  // Hooks skal kaldes før en tidlig return
  if (variants.length === 0 && outlet.length === 0) return null

  // Group attribute names
  const attrNames = orderAttributeNames([...new Set(variants.flatMap(v => v.attributes.map(a => a.name)))], attrOrder)

  // Find variant that matches all current selections
  const matched = variants.find(v =>
    attrNames.every(name => {
      const sel = selections[name]
      return !sel || v.attributes.some(a => a.name === name && a.value === sel)
    })
  ) ?? null

  const price     = matched?.sales_price ?? basePrice
  const inStock   = matched ? available(matched) > 0 : true

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
        const values = ([...new Set(variants.map(v => v.attributes.find(a => a.name === attrName)?.value).filter(Boolean))] as string[])
          .sort((a, b) => compareAttrValues(attrName, a, b, attrOrder))
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
                  available(v) > 0
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
            {inStock ? `${available(matched)} på lager` : 'Ikke på lager'}
          </span>
        </div>
      )}

      {variants.length > 0 && (
        <button
          className={`ls-prodcard-btn ls-varpicker-add${toasted ? ' toasted' : ''}`}
          onClick={handleAdd}
          disabled={!matched || !inStock}
        >
          {toasted ? '✓ Lagt i kurv' : matched ? 'Læg i kurv' : 'Vælg variant'}
        </button>
      )}

      {outlet.length > 0 && (
        <div className="ls-varpicker-outlet">
          <div className="ls-varpicker-label">Outlet <span className="ls-varpicker-chosen">— udgaver til særpris</span></div>
          <ul>
            {outlet.map(v => (
              <li key={v.id}>
                <Link href={`/produkt/${productId}?variant=${v.id}`} className="ls-outlet-link">
                  <span>{attrLabel(v.attributes, v.internal_variant_sku)}</span>
                  <span className="ls-outlet-price">{v.sales_price != null ? fmtPrice(v.sales_price) : ''}</span>
                  <span className={`ls-varpicker-stock ${available(v) > 0 ? 'in' : 'out'}`}>{available(v) > 0 ? `${available(v)} på lager` : 'Ikke på lager'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
