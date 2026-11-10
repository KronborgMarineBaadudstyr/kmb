// Bådprofilen (Min båd). I browseren: localStorage 'ls_boat_profile' — også for besøgende uden konto.
// På kontoen: tabellen shop_user_boats (migration 069), når e-mailen er bekræftet via login-linket.
// Rene funktioner — bruges både i browseren og på serveren.

export type BoatKind = 'sail' | 'motor' | 'both'

export type LocalBoatProfile = {
  type:      BoatKind
  length:    number          // fod
  name:      string
  inferred?: boolean         // kun gættet ud fra, at besøgende valgte Sejlbåd/Motorbåd
  synced?:   boolean         // gemt på kundens konto
  promptDismissedAt?: string // "Ikke nu" på opfordringen
}

export type ServerBoat = { name: string | null; boat_type: 'sejlbåd' | 'motorbåd' | null; length_ft: number | null }

export const BOAT_STORAGE_KEY = 'ls_boat_profile'
export const DEFAULT_BOAT: LocalBoatProfile = { type: 'both', length: 30, name: '' }

export const kindToType = (k: BoatKind): ServerBoat['boat_type'] => (k === 'sail' ? 'sejlbåd' : k === 'motor' ? 'motorbåd' : null)
export const typeToKind = (t: ServerBoat['boat_type']): BoatKind => (t === 'sejlbåd' ? 'sail' : t === 'motorbåd' ? 'motor' : 'both')

// Validerer input til kontoen. Fejltekst eller rensede felter.
export function cleanBoatInput(b: unknown): ServerBoat | string {
  if (!b || typeof b !== 'object') return 'Ugyldigt input'
  const r = b as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 60) : ''
  const kind = r.type === 'sail' || r.type === 'motor' || r.type === 'both' ? r.type : 'both'
  const length = typeof r.length === 'number' ? r.length : Number(r.length)
  if (r.length != null && r.length !== '' && !(length >= 5 && length <= 200)) return 'Længden skal være mellem 5 og 200 fod'
  return { name: name || null, boat_type: kindToType(kind), length_ft: Number.isFinite(length) && length > 0 ? Math.round(length * 10) / 10 : null }
}
