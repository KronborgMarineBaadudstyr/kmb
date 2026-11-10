import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/server'

// Butikkens oplysninger — redigeres i admin under Indstillinger → Butiksoplysninger (/admin/butik),
// gemmes i store_settings (migration 067). Bruges af handelsbetingelser, sidefod, kvittering og mails.
// Tomme felter vises ikke.

export type ReturnShipping = 'customer' | 'shop'

export type StoreInfo = {
  name:           string          // butikkens navn, fx "Kronborg Marine Bådudstyr"
  legalName:      string | null   // juridisk navn, hvis det er et andet (fx "Kronborg Marine ApS")
  cvr:            string | null
  address:        string | null   // fx "Havnevej 1, 3000 Helsingør"
  email:          string | null
  phone:          string | null
  openingHours:   string | null   // fx "Man–fre 9–17, lør 9–13"
  deliveryTime:   string | null   // fx "1–3 hverdage"
  returnShipping: ReturnShipping  // hvem betaler returfragt ved fortrydelse
}

export const STORE_DEFAULTS: StoreInfo = {
  name:           'Kronborg Marine Bådudstyr',
  legalName:      null,
  cvr:            null,
  address:        null,
  email:          null,
  phone:          null,
  openingHours:   null,
  deliveryTime:   null,
  returnShipping: 'customer',
}

// Felter handelsbetingelserne skal have for at opfylde oplysningspligten
export const REQUIRED_FIELDS: { key: keyof StoreInfo; label: string }[] = [
  { key: 'cvr',     label: 'CVR-nummer' },
  { key: 'address', label: 'Adresse' },
  { key: 'email',   label: 'E-mail' },
]

export function missingStoreFields(s: StoreInfo): string[] {
  return REQUIRED_FIELDS.filter(f => !s[f.key]).map(f => f.label)
}

const text = (v: unknown, max: number) => {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : ''
  return t || null
}

// Validerer input fra admin-formularen. Returnerer en fejltekst eller de rensede felter.
export function cleanStoreInput(raw: Record<string, unknown>): StoreInfo | string {
  const name = text(raw.name, 100)
  if (!name) return 'Butikkens navn er påkrævet'
  const cvr = text(raw.cvr, 20)?.replace(/\s+/g, '') ?? null
  if (cvr && !/^(DK)?\d{8}$/i.test(cvr)) return 'CVR-nummeret skal være 8 cifre'
  const email = text(raw.email, 120)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mailadressen ser forkert ud'
  return {
    name,
    legalName:      text(raw.legalName, 120),
    cvr:            cvr ? cvr.replace(/^DK/i, '') : null,
    address:        text(raw.address, 200),
    email,
    phone:          text(raw.phone, 30),
    openingHours:   text(raw.openingHours, 200),
    deliveryTime:   text(raw.deliveryTime, 60),
    returnShipping: raw.returnShipping === 'shop' ? 'shop' : 'customer',
  }
}

// Ét opslag pr. request (cache). Falder tilbage til standardværdierne, hvis migration 067 ikke er kørt.
export const getStoreSettings = cache(async (): Promise<{ store: StoreInfo; updatedAt: string | null }> => {
  const { data, error } = await createServiceClient().from('store_settings').select('data, updated_at').eq('id', 'store').maybeSingle()
  if (error || !data) return { store: STORE_DEFAULTS, updatedAt: null }
  const saved = cleanStoreInput({ ...STORE_DEFAULTS, ...(data.data as Record<string, unknown>) })
  return { store: typeof saved === 'string' ? STORE_DEFAULTS : saved, updatedAt: data.updated_at as string }
})

export async function getStore(): Promise<StoreInfo> {
  return (await getStoreSettings()).store
}

export function pickupPlaceHtml(s: StoreInfo): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return [s.name, s.address, s.openingHours && `Åbent: ${s.openingHours}`].filter((x): x is string => !!x).map(esc).join('<br>')
}
