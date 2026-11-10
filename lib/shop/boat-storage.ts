'use client'

import { BOAT_STORAGE_KEY, DEFAULT_BOAT, type BoatKind, type LocalBoatProfile } from './boat-profile'

// localStorage kan være slået fra (privat vindue) — alt fejler stille
export function readBoat(): LocalBoatProfile | null {
  try {
    const raw = localStorage.getItem(BOAT_STORAGE_KEY)
    return raw ? { ...DEFAULT_BOAT, ...(JSON.parse(raw) as Partial<LocalBoatProfile>) } : null
  } catch { return null }
}

export function writeBoat(p: LocalBoatProfile) {
  try { localStorage.setItem(BOAT_STORAGE_KEY, JSON.stringify(p)) } catch {}
}

// Besøgende valgte Sejlbåd/Motorbåd: husk det som et gæt — men overskriv aldrig noget, de selv har angivet
export function rememberBoatKind(kind: Exclude<BoatKind, 'both'>) {
  const cur = readBoat()
  if (cur && !cur.inferred && cur.type !== 'both') return
  if (cur && !cur.inferred && cur.type === 'both' && (cur.name || cur.synced)) return
  writeBoat({ ...(cur ?? DEFAULT_BOAT), type: kind, inferred: true })
}
