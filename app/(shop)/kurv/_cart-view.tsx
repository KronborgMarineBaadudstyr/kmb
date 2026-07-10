'use client'

import Link from 'next/link'
import { useCart, fmtPrice } from '../_cart'

const SHIPPING_THRESHOLD = 499
const SHIPPING_COST      = 49

export function CartView() {
  const { items, remove, setQty, total, count } = useCart()

  const shipping = total >= SHIPPING_THRESHOLD ? 0 : SHIPPING_COST
  const orderTotal = total + shipping

  if (count === 0) {
    return (
      <div className="ls-empty" style={{ paddingTop: 80 }}>
        <div className="ls-empty-icon">🛒</div>
        <h3>Din kurv er tom</h3>
        <p>Find produkter i <Link href="/kategorier">kategorierne</Link> eller brug <Link href="/soeg">søgning</Link>.</p>
      </div>
    )
  }

  return (
    <>
      <div className="ls-listing-header">
        <h1>Din kurv</h1>
        <span className="ls-listing-count">{count} {count === 1 ? 'vare' : 'varer'}</span>
      </div>

      <div className="ls-cart-layout">
        {/* Line items */}
        <div>
          {items.map(item => (
            <div key={item.id} className="ls-cart-item">
              <div className="ls-cart-item-thumb">
                {item.image ? (
                  <img src={item.image} alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                ) : '⚓'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/produkt/${item.id}`}
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}>
                  {item.name}
                </Link>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
                  {fmtPrice(item.price)} stk.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                  <div className="ls-qty">
                    <button onClick={() => setQty(item.id, item.qty - 1)}>−</button>
                    <span>{item.qty}</span>
                    <button onClick={() => setQty(item.id, item.qty + 1)}>+</button>
                  </div>
                  <button onClick={() => remove(item.id)}
                    style={{ fontSize: 12, color: 'var(--ink-3)', border: 'none', background: 'none', cursor: 'pointer' }}>
                    Fjern
                  </button>
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                {fmtPrice(item.price * item.qty)}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="ls-cart-summary">
          <h2>Ordreoversigt</h2>

          {/* Free shipping progress */}
          {shipping > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>
                <span>Fri fragt fra {fmtPrice(SHIPPING_THRESHOLD)}</span>
                <span>{fmtPrice(SHIPPING_THRESHOLD - total)} mangler</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: 'var(--stock)',
                  width: `${Math.min(100, (total / SHIPPING_THRESHOLD) * 100)}%`,
                  borderRadius: 3,
                  transition: 'width .3s',
                }} />
              </div>
            </div>
          )}

          <div className="ls-cart-summary-row">
            <span>Subtotal</span>
            <span>{fmtPrice(total)}</span>
          </div>
          <div className="ls-cart-summary-row">
            <span>Fragt</span>
            <span>{shipping === 0 ? <span style={{ color: 'var(--stock)' }}>Gratis</span> : fmtPrice(shipping)}</span>
          </div>
          <div className="ls-cart-summary-row total">
            <span>I alt</span>
            <span>{fmtPrice(orderTotal)}</span>
          </div>

          <button className="ls-checkout-btn" onClick={() => alert('Betalingsgateway — kommer snart')}>
            Gå til betaling →
          </button>

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Link href="/" style={{ fontSize: 12, color: 'var(--ink-3)' }}>← Fortsæt med at handle</Link>
          </div>
        </div>
      </div>

      <div style={{ height: 48 }} />
    </>
  )
}
