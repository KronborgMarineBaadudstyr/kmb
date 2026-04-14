// ============================================================
// Unit normalisering
// Ensretter enhedsbetegnelser på tværs af leverandører
// ============================================================

// Kanonisk enhedsnavn → alle aliasser der mapper til det
const UNIT_MAP: Record<string, string[]> = {
  meter:   ['m', 'mtr', 'meter', 'metre', 'lm', 'lbm', 'laufmeter'],
  styk:    ['stk', 'styk', 'stk.', 'pcs', 'pc', 'piece', 'pieces', 'stück', 'st', 'ea', 'each', 'enhed'],
  pose:    ['pose', 'poser', 'pose(r)', 'bag', 'beutel', 'pk', 'paket'],
  pakke:   ['pakke', 'pakker', 'pak', 'pack', 'pkt', 'pkt.', 'package'],
  rulle:   ['rulle', 'ruller', 'rolle', 'rull', 'roll', 'rouleau', 'spole', 'spoler', 'spool'],
  liter:   ['l', 'ltr', 'liter', 'litre', 'lt'],
  kg:      ['kg', 'kilo', 'kilogram'],
  gram:    ['g', 'gr', 'gram'],
  sæt:     ['sæt', 'set', 'satz', 'kit', 'garniture'],
  par:     ['par', 'pair', 'paar'],
  flaske:  ['flaske', 'flasker', 'bottle', 'flakon'],
  dunk:    ['dunk', 'kande', 'kanne', 'jerry can', 'jerrycan'],
  box:     ['box', 'boks', 'kasse', 'karton'],
}

// Byg omvendt opslag: alias → kanonisk navn
const ALIAS_TO_UNIT: Record<string, string> = {}
for (const [canonical, aliases] of Object.entries(UNIT_MAP)) {
  for (const alias of aliases) {
    ALIAS_TO_UNIT[alias.toLowerCase()] = canonical
  }
}

/**
 * Normaliserer en enhedsbetegnelse til kanonisk form.
 * Returnerer null hvis ukendt.
 * Eksempler:
 *   "mtr"      → "meter"
 *   "Stk."     → "styk"
 *   "Pose(r)"  → "pose"
 *   "Spoler"   → "rulle"
 */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.trim().toLowerCase().replace(/[()]/g, '').trim()
  return ALIAS_TO_UNIT[cleaned] ?? ALIAS_TO_UNIT[cleaned.replace(/s$/, '')] ?? null
}

// ── Unit size parsing fra details-felter ──
// Eksempler på mønstre:
//   "Spoler à: 120 m"     → { unit: "rulle", unit_size: 120 }
//   "Pose(r) à: 10 stk"   → { unit: "pose",  unit_size: 10  }
//   "Spole af: 200 m"     → { unit: "rulle", unit_size: 200 }
//   "Ruller à 50 m"       → { unit: "rulle", unit_size: 50  }
//   "100 m"               → { unit: "meter", unit_size: 100 }
//   "Pakke med 5 stk"     → { unit: "pakke", unit_size: 5   }

// Nøgleord der indikerer at værdien er en unit_size
// (Ingen named capture groups — kompatibel med ES2017)
const UNIT_SIZE_PATTERNS: RegExp[] = [
  // "Spoler à: 120 m" / "Pose(r) à 10 stk" / "Ruller af: 50 m"
  /^(.+?)\s*(?:à|af|a:|af:|med)\s*:?\s*([\d,.]+)\s*(\w+)?$/i,
  // "120 m" / "50 stk" — bare et tal + enhed
  /^([\d,.]+)\s*([a-zæøå.]+)$/i,
]

type UnitSizeResult = {
  unit:      string | null
  unit_size: number | null
  source_key: string  // hvilket details-felt det kom fra
}

/**
 * Parser unit og unit_size fra leverandørens details-objekt.
 * Leder efter felter der hedder noget med "spole", "pose", "rulle", "pakke" osv.
 *
 * Eksempel input:
 *   { "Spoler à": "120 m", "Brudstyrke": "817 kg", "Ø": "3 mm" }
 * Eksempel output:
 *   { unit: "rulle", unit_size: 120, source_key: "Spoler à" }
 */
export function parseUnitSizeFromDetails(
  details: Record<string, string>,
  supplierUnit?: string | null
): UnitSizeResult {
  // Nøgleord i details-nøgler der indikerer unit_size
  const containerKeywords = [
    'spole', 'spoler', 'rulle', 'ruller', 'pose', 'poser', 'pakke', 'pakker',
    'sæt', 'par', 'box', 'kasse', 'flaske', 'dunk', 'stk', 'pack', 'bag',
  ]

  for (const [key, value] of Object.entries(details)) {
    const keyLower = key.toLowerCase()

    // Er nøglen selv en container-type?
    const containerUnit = containerKeywords.find(kw => keyLower.includes(kw))

    if (containerUnit || keyLower.includes('à') || keyLower.includes(' a ') || keyLower.includes(' af ')) {
      // Prøv at parse størrelsen fra værdien
      const parsed = parseSize(value)
      if (parsed.size !== null) {
        // Forsøg at bestemme enheden
        // 1. Fra selve details-nøglen (fx "Spoler" → "rulle")
        // 2. Fra værdiens enhed (fx "120 m" → "meter" — men det er unit_size-enheden, ikke container-enheden)
        // 3. Fra leverandørens unit-felt

        const containerNormalized = containerUnit
          ? normalizeUnit(containerUnit)
          : (supplierUnit ? normalizeUnit(supplierUnit) : null)

        return {
          unit:       containerNormalized,
          unit_size:  parsed.size,
          source_key: key,
        }
      }
    }
  }

  // Ingen unit_size fundet i details — brug leverandørens unit-felt
  return {
    unit:       supplierUnit ? normalizeUnit(supplierUnit) : null,
    unit_size:  null,
    source_key: '',
  }
}

// Hjælper: træk et tal ud af en streng ("120 m" → 120, "10 stk" → 10)
function parseSize(value: string): { size: number | null; unitStr: string | null } {
  const match = value.trim().match(/^([\d,.]+)\s*([a-zæøå.]*)/i)
  if (!match) return { size: null, unitStr: null }
  const size = parseFloat(match[1].replace(',', '.'))
  return { size: isNaN(size) ? null : size, unitStr: match[2] || null }
}

/**
 * Kombiner unit fra leverandørens unit-felt og details.
 * Details-unit vinder (er mere specifik).
 */
export function resolveUnit(
  supplierUnit: string | null | undefined,
  details: Record<string, string>,
): { unit: string | null; unit_size: number | null } {
  const fromDetails = parseUnitSizeFromDetails(details, supplierUnit)

  if (fromDetails.unit || fromDetails.unit_size) {
    return { unit: fromDetails.unit, unit_size: fromDetails.unit_size }
  }

  return { unit: normalizeUnit(supplierUnit), unit_size: null }
}
