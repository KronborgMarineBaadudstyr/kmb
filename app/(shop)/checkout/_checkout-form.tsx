'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCart, fmtPrice } from '../_cart'
import { SHIPPING_METHODS, shippingCost, type ShippingMethod } from '@/lib/shop/shipping'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/shop/payment'
import type { ContactDefaults } from '@/lib/shop/customers'

type Form = ContactDefaults & { note: string }
type Account = { label: string; defaults: ContactDefaults; payAtPickup: boolean } | null

const EMPTY: Form = { name: '', email: '', phone: '', address: '', postcode: '', city: '', note: '' }
const LOGIN_HREF = '/konto?next=/checkout'

export function CheckoutForm({ account, onlineAvailable }: { account: Account; onlineAvailable: boolean }) {
  const { items, total, count, ready, remove, setPrice } = useCart()
  const canPickupPay = !!account?.payAtPickup
  const [form,      setForm]      = useState<Form>({ ...EMPTY, ...account?.defaults })
  const [payment,   setPayment]   = useState<PaymentMethod | null>(
    onlineAvailable ? 'online' : canPickupPay ? 'pickup' : null)
  const [method,    setMethod]    = useState<ShippingMethod>(canPickupPay && !onlineAvailable ? 'pickup' : 'delivery')
  const [marketing, setMarketing] = useState(false)
  const [terms,     setTerms]     = useState(false)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')

  const shipping   = shippingCost(total, method)
  const orderTotal = total + shipping
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function choosePayment(p: PaymentMethod) {
    setPayment(p)
    if (p === 'pickup') setMethod('pickup')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!payment) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ id: i.id, qty: i.qty, price: i.price })),
          customer: form, note: form.note, shipping_method: method, payment_method: payment,
          marketing, accept_terms: terms,
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
  const pickupHint = !account
    ? <>For kunder der har handlet hos os før — <Link href={LOGIN_HREF}>log ind</Link></>
    : canPickupPay
      ? PAYMENT_METHODS.pickup.description
      : 'For kunder der har handlet hos os før'

  return (
    <>
      <div className="ls-listing-header">
        <h1>Kasse</h1>
        <Link href="/kurv" className="ls-checkout-back">← Tilbage til kurv</Link>
      </div>

      {!account && (
        <div className="ls-checkout-login">
          <span>Har du handlet hos os før? Log ind, så udfylder vi dine oplysninger, og du kan betale ved afhentning.</span>
          <Link href={LOGIN_HREF} className="ls-checkout-login-btn">Log ind</Link>
        </div>
      )}

      <form className="ls-cart-layout" onSubmit={submit}>
        <div className="ls-checkout-form">
          <fieldset className="ls-checkout-section">
            <legend>Kontaktoplysninger</legend>
            {account && <p className="ls-checkout-account">Logget ind som {account.label}</p>}
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
            <legend>Betaling</legend>
            {(['online', 'pickup'] as PaymentMethod[]).map(p => {
              const enabled = p === 'online' ? onlineAvailable : canPickupPay
              return (
                <label key={p} className={`ls-ship-option${payment === p ? ' active' : ''}${enabled ? '' : ' disabled'}`}>
                  <input type="radio" name="payment" checked={payment === p} disabled={!enabled}
                    onChange={() => choosePayment(p)} />
                  <span className="ls-ship-option-text">
                    <strong>{PAYMENT_METHODS[p].label}</strong>
                    <small>{p === 'online'
                      ? (onlineAvailable ? PAYMENT_METHODS.online.description : 'Kommer snart')
                      : pickupHint}</small>
                  </span>
                </label>
              )
            })}
          </fieldset>

          <fieldset className="ls-checkout-section">
            <legend>Levering</legend>
            {(Object.keys(SHIPPING_METHODS) as ShippingMethod[]).map(m => {
              const locked = payment === 'pickup' && m === 'delivery'
              return (
                <label key={m} className={`ls-ship-option${method === m ? ' active' : ''}${locked ? ' disabled' : ''}`}>
                  <input type="radio" name="shipping" checked={method === m} disabled={locked}
                    onChange={() => setMethod(m)} />
                  <span className="ls-ship-option-text">
                    <strong>{SHIPPING_METHODS[m].label}</strong>
                    <small>{locked ? 'Ikke muligt ved betaling ved afhentning' : SHIPPING_METHODS[m].description}</small>
                  </span>
                  <span className="ls-ship-option-price">
                    {shippingCost(total, m) === 0 ? 'Gratis' : fmtPrice(shippingCost(total, m))}
                  </span>
                </label>
              )
            })}

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
            <span>Jeg accepterer <a href="/handelsbetingelser" target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>handelsbetingelserne</a></span>
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

          <button type="submit" className="ls-checkout-btn" disabled={busy || !payment}>
            {busy ? 'Opretter ordre…'
              : payment === 'pickup' ? 'Bestil til afhentning →'
              : payment === 'online' ? 'Gå til betaling →'
              : 'Vælg betaling'}
          </button>
          {!payment && (
            <p className="ls-checkout-paynote">
              Online betaling åbner snart.{' '}
              {!account
                ? <>Har du handlet hos os før, kan du <Link href={LOGIN_HREF}>logge ind</Link> og betale ved afhentning.</>
                : 'Kontakt butikken, hvis du vil bestille nu.'}
            </p>
          )}
          {payment === 'pickup' && (
            <p className="ls-checkout-paynote">Du betaler i butikken, når du henter varerne. Vi sender en mail, når de er klar.</p>
          )}
        </aside>
      </form>

      <div style={{ height: 48 }} />
    </>
  )
}
