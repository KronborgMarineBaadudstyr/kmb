'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DEFAULT_BOAT, typeToKind, type BoatKind, type LocalBoatProfile, type ServerBoat } from '@/lib/shop/boat-profile'
import { readBoat, writeBoat } from '@/lib/shop/boat-storage'

type BoatType = BoatKind
type BoatProfile = LocalBoatProfile

async function saveToAccount(p: BoatProfile): Promise<string | null> {
  const res = await fetch('/api/shop/boat', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: p.name, type: p.type, length: p.length }),
  })
  return res.ok ? null : ((await res.json().catch(() => ({}))).error ?? 'Kunne ikke gemme båden')
}

// Bådprofilen: i browseren for alle, på kontoen når kunden er logget ind (kun e-mail kræves for at oprette en)
export function MinBaadView({ loggedIn, email: accountEmail, serverBoat, fromConfirm }: {
  loggedIn: boolean; email: string | null; serverBoat: ServerBoat | null; fromConfirm: boolean
}) {
  const [profile, setProfile] = useState<BoatProfile>(DEFAULT_BOAT)
  const [saved, setSaved]     = useState(false)
  const [loaded, setLoaded]   = useState(false)
  const [notice, setNotice]   = useState<string | null>(null)
  const [email, setEmail]     = useState('')
  const [linkSent, setLinkSent] = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    const local = readBoat()
    if (loggedIn && serverBoat) {
      // Kontoen er sandheden — browseren følger med
      const p: BoatProfile = {
        ...DEFAULT_BOAT, ...(local ?? {}), type: typeToKind(serverBoat.boat_type),
        name: serverBoat.name ?? '', length: serverBoat.length_ft ?? local?.length ?? DEFAULT_BOAT.length,
        inferred: false, synced: true,
      }
      writeBoat(p); setProfile(p)
      if (fromConfirm) setNotice('✓ Din e-mail er bekræftet, og din båd er gemt på din profil.')
    } else if (loggedIn && local && (fromConfirm || !local.synced) && (local.type !== 'both' || local.name)) {
      // Kommer fra "Gem min båd"-mailen: gem båden fra browseren på kontoen
      setProfile(local)
      saveToAccount(local).then(err => {
        if (err) { setNotice(err); return }
        writeBoat({ ...local, inferred: false, synced: true })
        setNotice('✓ Din e-mail er bekræftet, og din båd er gemt på din profil.')
      })
    } else if (local) {
      setProfile(local)
    }
    setLoaded(true)
  }, [loggedIn, serverBoat, fromConfirm])

  async function save() {
    const p = { ...profile, inferred: false }
    writeBoat(p)
    if (loggedIn) {
      setBusy(true)
      const err = await saveToAccount(p)
      setBusy(false)
      if (err) { setNotice(err); return }
      writeBoat({ ...p, synced: true })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Ikke logget ind: gem lokalt og send bekræftelseslink — så gemmes båden på en ny eller eksisterende profil
  async function saveWithEmail(e: React.FormEvent) {
    e.preventDefault()
    writeBoat({ ...profile, inferred: false })
    setBusy(true)
    const res = await fetch('/api/shop/auth/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, next: '/min-baad?gem=1', purpose: 'boat' }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setNotice(j.error ?? 'Kunne ikke sende e-mail'); return }
    if (j.dev_link) console.info('[dev] login-link:', j.dev_link)
    setLinkSent(j.message ?? 'Tjek din e-mail og klik på linket.')
  }

  if (!loaded) return null

  const boatLabel = profile.type === 'sail' ? 'Sejlbåd' : profile.type === 'motor' ? 'Motorbåd' : 'Båd'

  return (
    <div className="ls-minbaad">
      {/* Båd-kort */}
      <div className="ls-minbaad-card">
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          {profile.type === 'sail' ? '⛵' : profile.type === 'motor' ? '🚤' : '🛥️'}
        </div>
        <h2 style={{ margin: 0 }}>{profile.name || boatLabel}</h2>
        <div className="sub">
          {profile.type !== 'both' ? boatLabel : 'Alle bådtyper'} · {profile.length} fod
        </div>
      </div>

      {notice && (
        <p role="status" style={{ background: 'var(--stock-bg)', color: 'var(--stock)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 14, margin: 0 }}>
          {notice}
        </p>
      )}

      <Link href="/konto" className="ls-account-promo">
        <span>⏳</span>
        <span>
          <strong>Min konto</strong>
          <small>Se dine ordrer og hvornår dit udstyr bør efterses eller udskiftes</small>
        </span>
        <span aria-hidden>→</span>
      </Link>

      {/* Redigér */}
      <div style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Om din båd</h3>

        <div className="ls-form-group">
          <label className="ls-label">Bådnavn (valgfrit)</label>
          <input
            type="text"
            className="ls-input"
            placeholder="f.eks. M/S Havfruen"
            value={profile.name}
            onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
          />
        </div>

        <div className="ls-form-group">
          <label className="ls-label">Bådtype</label>
          <div className="ls-segment" style={{ marginTop: 4 }}>
            {(['sail', 'motor', 'both'] as BoatType[]).map(t => (
              <button
                key={t}
                className={profile.type === t ? 'active' : ''}
                onClick={() => setProfile(p => ({ ...p, type: t }))}
                style={{ color: profile.type === t ? 'var(--navy)' : 'var(--ink-2)' }}
              >
                {t === 'sail' ? '⛵ Sejl' : t === 'motor' ? '🚤 Motor' : '🛥️ Begge'}
              </button>
            ))}
          </div>
        </div>

        <div className="ls-form-group">
          <label className="ls-label">Bådlængde: {profile.length} fod</label>
          <input
            type="range"
            min={16} max={80} step={1}
            value={profile.length}
            onChange={e => setProfile(p => ({ ...p, length: +e.target.value }))}
            style={{ width: '100%', accentColor: 'var(--navy)', marginTop: 6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
            <span>16 fod</span><span>80 fod</span>
          </div>
        </div>

        <button
          className="ls-btn-primary"
          onClick={save}
          disabled={busy}
          style={{ justifyContent: 'center', background: saved ? 'var(--stock)' : undefined }}
        >
          {saved ? '✓ Gemt' : busy ? 'Gemmer…' : loggedIn ? 'Gem på min profil' : 'Gem i denne browser'}
        </button>
        {loggedIn && profile.synced && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>Gemt på din profil{accountEmail ? ` (${accountEmail})` : ''}</p>
        )}
      </div>

      {/* Ikke logget ind: opret profil med kun e-mail */}
      {!loggedIn && (
        linkSent ? (
          <p role="status" style={{ marginTop: 16, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 16, fontSize: 14 }}>
            📬 {linkSent}
          </p>
        ) : (
          <form onSubmit={saveWithEmail} style={{ marginTop: 16, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 15 }}>Gem båden på din profil</strong>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Så husker vi den på alle dine enheder og kan minde dig om service og udskiftning. Det kræver kun din e-mail — vi sender et link, du klikker på.
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="ls-input" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Din e-mail" autoComplete="email" style={{ flex: '1 1 200px' }} aria-label="E-mail" />
              <button className="ls-btn-primary" disabled={busy}>{busy ? 'Sender…' : 'Send link'}</button>
            </div>
          </form>
        )
      )}

      {/* Placeholder til fremtidig funktion */}
      <div style={{ marginTop: 24, background: 'var(--paper)', borderRadius: 'var(--r-lg)', padding: '20px 20px', border: '1px dashed var(--line)' }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>🔧</div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Vedligeholdelsesplan</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          Baseret på din båd og tidligere køb vil vi her vise hvilke serviceintervaller der nærmer sig —
          redningsveste, bundmaling, impeller m.m. Kommer snart.
        </div>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Link href={profile.type === 'sail' ? '/sejlbaad' : profile.type === 'motor' ? '/motorbaad' : '/kategorier'} style={{ fontSize: 13, color: 'var(--navy-700)' }}>
          Se produkter til din {boatLabel.toLowerCase()} →
        </Link>
      </div>
    </div>
  )
}
