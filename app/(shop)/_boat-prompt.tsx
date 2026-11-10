'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readBoat, writeBoat, rememberBoatKind } from '@/lib/shop/boat-storage'
import { DEFAULT_BOAT, type LocalBoatProfile } from '@/lib/shop/boat-profile'

// Husk bådtypen, når en besøgende vælger Sejlbåd/Motorbåd (også uden konto)
export function RememberBoat({ kind }: { kind: 'sail' | 'motor' }) {
  useEffect(() => { rememberBoatKind(kind) }, [kind])
  return null
}

const SNOOZE_DAYS = 30
const LABEL = { sail: 'sejlbåd', motor: 'motorbåd', both: 'båd' } as const

// Opfordring: "Har du en sejlbåd? Giv den navn og længde" → kun e-mail kræves.
// Ikke logget ind: login-link sendes (bekræfter e-mailen), og båden gemmes på kontoen efter klik (Min båd synkroniserer).
// Logget ind: gemmes direkte.
export function BoatPrompt({ loggedIn = false, hasBoat = false, kind: forcedKind, compact = false }: {
  loggedIn?: boolean; hasBoat?: boolean; kind?: 'sail' | 'motor'; compact?: boolean
}) {
  const [profile, setProfile] = useState<LocalBoatProfile | null>(null)
  const [show, setShow]       = useState(false)
  const [name, setName]       = useState('')
  const [length, setLength]   = useState('')
  const [email, setEmail]     = useState('')
  const [state, setState]     = useState<'idle' | 'sending' | 'sent' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (forcedKind) rememberBoatKind(forcedKind)
    const p = readBoat()
    setProfile(p)
    const snoozed = p?.promptDismissedAt && Date.now() - new Date(p.promptDismissedAt).getTime() < SNOOZE_DAYS * 86400_000
    setShow(!hasBoat && !!p && p.type !== 'both' && !p.synced && !snoozed)
    if (p?.name) setName(p.name)
    if (p && !p.inferred && p.length) setLength(String(p.length))
  }, [forcedKind, hasBoat])

  if (!show || !profile) return null
  const kind = profile.type
  const label = LABEL[kind]

  function dismiss() {
    writeBoat({ ...(readBoat() ?? DEFAULT_BOAT), promptDismissedAt: new Date().toISOString() })
    setShow(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const len = Number(length.replace(',', '.'))
    const next: LocalBoatProfile = {
      ...(readBoat() ?? DEFAULT_BOAT), type: kind, name: name.trim(),
      length: len >= 5 && len <= 200 ? len : (readBoat()?.length ?? DEFAULT_BOAT.length), inferred: false,
    }
    writeBoat(next)
    setState('sending')
    try {
      if (loggedIn) {
        const res = await fetch('/api/shop/boat', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: next.name, type: next.type, length: len >= 5 ? len : null }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Kunne ikke gemme')
        writeBoat({ ...next, synced: true })
        setState('saved')
      } else {
        const res = await fetch('/api/shop/auth/request', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email, next: '/min-baad?gem=1', purpose: 'boat' }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error ?? 'Kunne ikke sende e-mail')
        setMessage(j.message ?? 'Tjek din e-mail og klik på linket.')
        writeBoat({ ...next, promptDismissedAt: new Date().toISOString() })   // spørg ikke igen, mens kunden finder mailen
        if (j.dev_link) console.info('[dev] login-link:', j.dev_link)
        setState('sent')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Noget gik galt')
      setState('error')
    }
  }

  if (state === 'sent' || state === 'saved') {
    return (
      <div className={`ls-boatprompt ls-boatprompt--done${compact ? ' ls-boatprompt--compact' : ''}`} role="status">
        <span className="ls-boatprompt-icon" aria-hidden>{kind === 'sail' ? '⛵' : '🚤'}</span>
        <div>
          <strong>{state === 'saved' ? 'Din båd er gemt på din profil' : 'Næsten færdig'}</strong>
          <p>{state === 'saved' ? <>Se den under <Link href="/min-baad">Min båd</Link>.</> : message}</p>
        </div>
      </div>
    )
  }

  return (
    <form className={`ls-boatprompt${compact ? ' ls-boatprompt--compact' : ''}`} onSubmit={submit}>
      <span className="ls-boatprompt-icon" aria-hidden>{kind === 'sail' ? '⛵' : '🚤'}</span>
      <div className="ls-boatprompt-body">
        <strong>Har du en {label}?</strong>
        <p>Giv den et navn og en længde, så husker vi den for dig — og kan vise udstyr, der passer{loggedIn ? '' : '. Det kræver kun din e-mail'}.</p>
        <div className="ls-boatprompt-fields">
          <input className="ls-input" value={name} onChange={e => setName(e.target.value)} placeholder="Bådens navn (valgfrit)" maxLength={60} aria-label="Bådens navn" />
          <input className="ls-input ls-boatprompt-len" value={length} onChange={e => setLength(e.target.value)} inputMode="decimal" placeholder="Længde i fod" aria-label="Længde i fod" />
          {!loggedIn && (
            <input className="ls-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Din e-mail" autoComplete="email" aria-label="E-mail" />
          )}
          <button className="ls-btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Gemmer…' : 'Gem min båd'}</button>
        </div>
        {state === 'error' && <p className="ls-boatprompt-error">{message}</p>}
      </div>
      <button type="button" className="ls-boatprompt-close" onClick={dismiss} aria-label="Ikke nu">Ikke nu</button>
    </form>
  )
}
