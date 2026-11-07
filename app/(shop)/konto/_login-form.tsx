'use client'

import { useState } from 'react'

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const [identifier, setIdentifier] = useState('')
  const [busy,       setBusy]       = useState(false)
  const [message,    setMessage]    = useState('')
  const [error,      setError]      = useState(notice ?? '')
  const [devLink,    setDevLink]    = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const res  = await fetch('/api/shop/auth/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, next }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error ?? 'Noget gik galt')
      else { setMessage(json.message); setDevLink(json.dev_link ?? '') }
    } catch {
      setError('Netværksfejl — prøv igen')
    }
    setBusy(false)
  }

  return (
    <div className="ls-account-login">
      <h1>Log ind</h1>
      <p>Skriv din e-mail eller dit telefonnummer, så sender vi dig et login-link. Ingen adgangskode.</p>

      {message ? (
        <div className="ls-account-sent" role="status">
          <strong>Tjek din indbakke</strong>
          <p>{message}</p>
          {devLink && <p className="ls-account-dev">Udvikling (ingen e-mail sat op): <a href={devLink}>åbn login-link</a></p>}
          <button type="button" className="ls-account-linkbtn" onClick={() => { setMessage(''); setDevLink('') }}>
            Prøv med en anden e-mail eller nummer
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="ls-field">
            <span>E-mail eller telefonnummer</span>
            <input required autoComplete="username" inputMode="email" placeholder="navn@eksempel.dk eller 12 34 56 78"
              value={identifier} onChange={e => setIdentifier(e.target.value)} disabled={busy} />
          </label>
          {error && <p className="ls-checkout-error" role="alert">{error}</p>}
          <button type="submit" className="ls-checkout-btn" disabled={busy || !identifier.trim()}>
            {busy ? 'Sender…' : 'Send login-link'}
          </button>
        </form>
      )}
      <p className="ls-account-fine">
        Har du handlet hos os før, finder vi dine tidligere køb ud fra den e-mail eller det telefonnummer du brugte.
      </p>
    </div>
  )
}
