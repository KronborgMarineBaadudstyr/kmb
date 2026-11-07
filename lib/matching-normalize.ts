// Samme regler som normalize_for_matching() / matching_numbers() / numbers_compatible() i SQL
// (migration 062). Ret begge steder.

const NOISE = [
  // farver
  'rød', 'røde', 'rødt', 'blå', 'blåt', 'blåe', 'grøn', 'grønne', 'grønt', 'sort', 'sorte', 'hvid', 'hvide', 'hvidt',
  'gul', 'gule', 'gult', 'grå', 'brun', 'brune', 'brunt',
  'orange', 'lilla', 'pink', 'rosa', 'beige', 'creme', 'turkis', 'navy', 'bordeaux', 'sølv', 'guld',
  'marineblå', 'mørkeblå', 'lyseblå', 'mørkegrå', 'lysegrå', 'mørkegrøn', 'lysegrøn',
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'grey', 'gray', 'brown', 'purple', 'turquoise', 'silver', 'gold',
  // retning/side
  'venstre', 'højre', 'left', 'right', 'øverste', 'nederste', 'top', 'bottom', 'bagbord', 'styrbord', 'port', 'starboard',
  // størrelsesord
  'lille', 'små', 'stor', 'store', 'mellem', 'medium', 'mini', 'maxi', 'ekstra', 'extra', 'super', 'small', 'large',
  'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl',
  // ny/original, emballage, fyldord
  'ny', 'nye', 'nyt', 'new', 'original', 'orig', 'stk', 'pk', 'pak', 'pakke', 'pcs', 'pc',
  'og', 'med', 'til', 'for', 'fra', 'af', 'i', 'på', 'den', 'det', 'en', 'et', 'and', 'with', 'the', 'of', 'to', 'inkl', 'incl', 'ca',
]
const UNITS = 'mm|cm|m|km|kg|g|l|ml|ltr|liter|v|w|a|ah|bar|hk|hp|kn|tommer|inch|m2|m3'

// \b i JavaScript kender ikke æ/ø/å — derfor Unicode-grænser
const NOT_ALNUM_BEFORE = '(?<![\\p{L}\\p{N}])'
const NOT_ALNUM_AFTER  = '(?![\\p{L}\\p{N}])'
const NOISE_RE = new RegExp(`${NOT_ALNUM_BEFORE}(${NOISE.join('|')})${NOT_ALNUM_AFTER}`, 'gu')
const UNIT_RE  = new RegExp(`(\\d)\\s+(${UNITS})${NOT_ALNUM_AFTER}`, 'gu')

export function normalizeForMatching(t: string | null | undefined): string {
  return (t ?? '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')                              // decimalkomma
    .replace(/ø\s*(?=\d)/g, ' ')                                 // Ø10 → 10
    .replace(/[^\p{L}\p{N}.]+|\.(?!\d)|(?<!\d)\./gu, ' ')        // tegnsætning
    .replace(/(\d)\s*x\s*(?=\d)/g, '$1x')                        // 10 x 20 → 10x20
    .replace(UNIT_RE, '$1$2')                                    // 10 mm → 10mm
    .replace(NOISE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Tal i et normaliseret navn, sorteret og uden dubletter ("2.50" → "2.5")
export function matchingNumbers(norm: string): string[] {
  const nums = new Set<string>()
  for (const m of norm.matchAll(/\d+(?:\.\d+)?/g)) {
    nums.add(m[0].includes('.') ? m[0].replace(/^0+(?=\d)/, '').replace(/\.?0+$/, '') : m[0].replace(/^0+(?=\d)/, ''))
  }
  return [...nums].sort()
}

// Tallene må ikke modsige hinanden: det ene sæt skal være indeholdt i det andet
export function numbersCompatible(a: string[], b: string[]): boolean {
  const sa = new Set(a), sb = new Set(b)
  return a.every(n => sb.has(n)) || b.every(n => sa.has(n))
}
