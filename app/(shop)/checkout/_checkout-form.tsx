'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCart, fmtPrice } from '../_cart'
import { SHIPPING_METHODS, shippingCost, type ShippingMethod } from '@/lib/shop/shipping'

type Form = { name: string; email: string; phone: string; address: string; postcode: string; city: string; note: string }
const EMPTY: Form = { name: '', email: '', phone: '', address: '', postcode: '', city: '', note: '' }

export function CheckoutForm() {
  const { items, total, count, ready, remove, setPrice } = useCart()
  const [form,      setForm]      = useState<Form>(EMPTY)
  const [method,    setMethod]    = useState<ShippingMethod>('delivery')
  const [marketing, setMarketing] = useState(false)
  const [terms,     setTerms]     = useState(false)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')

  const shipping   = shippingCost(total, method)
  const orderTotal = total + shipping
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ id: i.id, qty: i.qty, price: i.price })),
          customer: form, note: form.note, shipping_method: method, marketing, accept_terms: terms,
        }),
      })
      const json = await res.json()
      if (res.status === 409) {
        for (const id of json.unavailable ?? []) remove(id)
        for (const c of json.changed ?? []) setPrice(c.id, c.price)
      }
      if (!res.ok) { setError(json.error ?? 'Noget gik galt'); setBusy(false); return }
      window.location.href = json.redirect
    } catch {
      setError('Netværksfejl — prøv igen'); setBusy(false)
    }
  }

  if (!ready) return <div style={{ minHeight: 400 }} />

  if (count === 0) {
    return (
      <div className="ls-empty" style={{ paddingTop: 80 }}>
        <div className="ls-empty-icon">🛒</div>
        <h3>Din kurv er tom</h3>
        <p>Find produkter i <Link href="/kategorier">kategorierne</Link> eller brug <Link href="/soeg">søgning</Link>.</p>
      </div>
    )
  }

  const needsAddress = method === 'delivery'

  return (
    <>
      <div className="ls-listing-header">
        <h1>Kasse</h1>
        <Link href="/kurv" className="ls-checkout-back">← Tilbage til kurv</Link>
      </div>

      <form className="ls-cart-layout" onSubmit={submit}>
        <div className="ls-checkout-form">
          <fieldset className="ls-checkout-section">
            <legend>Kontaktoplysninger</legend>
            <label className="ls-field ls-field--full">
              <span>E-mail</span>
              <input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
            </label>
            <label className="ls-field">
              <span>Fulde navn</span>
              <input required autoComplete="name" value={form.name} onChange={set('name')} />
            </label>
            <label className="ls-field">
              <span>Telefon</span>
              <input type="tel" required autoComplete="tel" value={form.phone} onChange={set('phone')} />
            </label>
          </fieldset>

          <fieldset className="ls-checkout-section">
            <legend>Levering</legend>
            {(Object.keys(SHIPPING_METHODS) as ShippingMethod[]).map(m => (
              <label key={m} className={`ls-ship-option${method === m ? ' active' : ''}`}>
                <input type="radio" name="shipping" checked={method === m} onChange={() => setMethod(m)} />
                <span className="ls-ship-option-text">
                  <strong>{SHIPPING_METHODS[m].label}</strong>
                  <small>{SHIPPING_METHODS[m].description}</small>
                </span>
                <span className="ls-ship-option-price">
                  {shippingCost(total, m) === 0 ? 'Gratis' : fmtPrice(shippingCost(total, m))}
                </span>
              </label>
            ))}

            {needsAddress && (
              <div className="ls-checkout-address">
                <label className="ls-field ls-field--full">
                  <span>Adresse</span>
                  <input required autoComplete="street-address" value={form.address} onChange={set('address')} />
                </label>
                <label className="ls-field ls-field--short">
                  <span>Postnr.</span>
                  <input required inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="postal-code"
                    value={form.postcode} onChange={set('postcode')} />
                </label>
                <label className="ls-field">
                  <span>By</span>
                  <input required autoComplete="address-level2" value={form.city} onChange={set('city')} />
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className="ls-checkout-section">
            <legend>Bemærkning <small>(valgfri)</small></legend>
            <label className="ls-field ls-field--full">
              <textarea rows={3} maxLength={1000} value={form.note} onChange={set('note')}
                placeholder="F.eks. bådnavn, leveringsønsker eller spørgsmål til varerne" />
            </label>
          </fieldset>

          <label className="ls-check">
            <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} />
            <span>Ja tak til nyheder og tilbud fra LoveSailing</span>
          </label>
          <label className="ls-check">
            <input type="checkbox" required checked={terms} onChange={e => setTerms(e.target.checked)} />
            <span>Jeg accepterer handelsbetingelserne</span>
          </label>
        </div>

        <aside className="ls-cart-summary">
          <h2>Din ordre</h2>
          <ul className="ls-checkout-lines">
            {items.map(i => (
              <li key={i.id}>
                <span className="ls-checkout-line-thumb">
                  {i.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.image} alt="" />
                    : '⚓'}
                  <em>{i.qty}</em>
                </span>
                <span className="ls-checkout-line-name">{i.name}</span>
                <span className="ls-checkout-line-price">{fmtPrice(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="ls-cart-summary-row"><span>Subtotal</span><span>{fmtPrice(total)}</span></div>
          <div className="ls-cart-summary-row">
            <span>Fragt</span>
            <span>{shipping === 0 ? <span style={{ color: 'var(--stock)' }}>Gratis</span> : fmtPrice(shipping)}</span>
          </div>
          <div className="ls-cart-summary-row total"><span>I alt</span><span>{fmtPrice(orderTotal)}</span></div>
          <p className="ls-checkout-vat">Inkl. moms</p>

          {error && <p className="ls-checkout-error" role="alert">{error}</p>}

          <button type="submit" className="ls-checkout-btn" disabled={busy}>
            {busy ? 'Opretter ordre…' : 'Afgiv ordre →'}
          </button>
          <p className="ls-checkout-paynote">
            Online betaling tilføjes snart. Din ordre registreres, og du får en ordrebekræftelse.
          </p>
        </aside>
      </form>

      <div style={{ height: 48 }} />
    </>
  )
}
