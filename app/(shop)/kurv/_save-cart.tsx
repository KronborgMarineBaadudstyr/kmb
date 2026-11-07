'use client'

import { useState } from 'react'
import { CartItem } from '../_cart'

export function SaveCart({ items }: { items: CartItem[] }) {
  const [open,      setOpen]      = useState(false)
  const [email,     setEmail]     = useState('')
  const [marketing, setMarketing] = useState(false)
  const [status,    setStatus]    = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [link,      setLink]      = useState('')
  const [err,       setErr]       = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErr('')
    try {
      const res = await fetch('/api/shop/save-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, marketing, cart: items }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? 'Noget gik galt'); setStatus('error'); return }
      setLink(json.link)
      setStatus('done')
    } catch {
      setErr('Netværksfejl — prøv igen')
      setStatus('error')
    }
  }

  if (!open) {
    return (
      <button className="ls-save-cart-trigger" onClick={() => setOpen(true)}>
        💾 Gem kurv
      </button>
    )
  }

  return (
    <div className="ls-save-cart-panel">
      {status === 'done' ? (
        <div className="ls-save-cart-success">
          <span className="ls-save-cart-success-icon">✓</span>
          <div>
            <strong>Kurv gemt!</strong>
            <p>Vi har sendt et link til <em>{email}</em> — du kan også kopiere det her:</p>
            <a href={link} className="ls-save-cart-link" target="_blank" rel="noopener">
              {link}
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="ls-save-cart-form">
          <div className="ls-save-cart-header">
            <strong>Gem din kurv</strong>
            <button type="button" className="ls-save-cart-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <p className="ls-save-cart-desc">
            Angiv din e-mail, så sender vi dig et link du kan bruge til at hente kurven igen.
          </p>

          <input
            type="email"
            required
            placeholder="din@email.dk"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="ls-save-cart-email"
            disabled={status === 'loading'}
          />

          <label className="ls-save-cart-marketing">
            <input
              type="checkbox"
              checked={marketing}
              onChange={e => setMarketing(e.target.checked)}
              disabled={status === 'loading'}
            />
            <span>Ja tak til nyheder og tilbud fra LoveSailing</span>
          </label>

          {err && <p className="ls-save-cart-error">{err}</p>}

          <button
            type="submit"
            className="ls-save-cart-submit"
            disabled={status === 'loading' || !email}
          >
            {status === 'loading' ? 'Gemmer…' : 'Send kurv-link →'}
          </button>
        </form>
      )}
    </div>
  )
}
