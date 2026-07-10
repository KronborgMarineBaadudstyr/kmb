'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type BoatType = 'sail' | 'motor' | 'both'

type BoatProfile = {
  type: BoatType
  length: number
  name: string
}

const DEFAULT: BoatProfile = { type: 'both', length: 30, name: '' }

export function MinBaadView() {
  const [profile, setProfile] = useState<BoatProfile>(DEFAULT)
  const [saved, setSaved]     = useState(false)
  const [loaded, setLoaded]   = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ls_boat_profile')
      if (stored) setProfile(JSON.parse(stored))
    } catch {}
    setLoaded(true)
  }, [])

  function save() {
    localStorage.setItem('ls_boat_profile', JSON.stringify(profile))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
                style={{ color: profile.type === t ? 'var(--navy)' : undefined }}
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
          style={{ justifyContent: 'center', background: saved ? 'var(--stock)' : undefined }}
        >
          {saved ? '✓ Gemt' : 'Gem bådprofil'}
        </button>
      </div>

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
        <Link href="/kategorier" style={{ fontSize: 13, color: 'var(--navy-700)' }}>
          Se produkter til din {boatLabel.toLowerCase()} →
        </Link>
      </div>
    </div>
  )
}
