// Fælles variant-egenskaber (migration 065). Rene funktioner — bruges både på serveren og i browseren.

export type AttrValue = { value: string; synonyms: string[] }
export type VariantAttributeDef = {
  id:         string
  name:       string
  unit:       string | null
  values:     AttrValue[]
  sort_order: number
}

// Validerer input fra admin. Returnerer en fejltekst eller de rensede felter.
export function cleanAttributeInput(body: unknown): { name: string; unit: string | null; values: AttrValue[]; sort_order?: number } | string {
  if (!body || typeof body !== 'object') return 'Ugyldigt input'
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 50) : ''
  if (!name) return 'Navn er påkrævet'
  const unit = typeof b.unit === 'string' && b.unit.trim() ? b.unit.trim().slice(0, 10) : null
  const raw = Array.isArray(b.values) ? b.values : []
  if (raw.length > 200) return 'Højst 200 værdier'
  const seen = new Set<string>()
  const values: AttrValue[] = []
  for (const v of raw) {
    const value = typeof v?.value === 'string' ? v.value.trim().slice(0, 60) : ''
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    const rawSyn: unknown[] = Array.isArray(v?.synonyms) ? v.synonyms : []
    const synonyms = rawSyn
      .filter((s): s is string => typeof s === 'string')
      .map(s => s.trim().slice(0, 60))
      .filter(s => s && s.toLowerCase() !== value.toLowerCase())
      .slice(0, 30)
    values.push({ value, synonyms: [...new Set(synonyms)] })
  }
  const out: { name: string; unit: string | null; values: AttrValue[]; sort_order?: number } = { name, unit, values }
  if (typeof b.sort_order === 'number' && Number.isFinite(b.sort_order)) out.sort_order = Math.round(b.sort_order)
  return out
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Genkender ét ord (eller tal+enhed) ud fra de definerede egenskaber.
// "navy" → { name: 'Farve', value: 'Marineblå' }, "10mm" → { name: 'Godstykkelse', value: '10mm' }
export function classifyWord(word: string, defs: VariantAttributeDef[]): { name: string; value: string } | null {
  const w = word.trim().toLowerCase()
  if (!w) return null
  for (const d of defs) {
    for (const v of d.values) {
      if (v.value.toLowerCase() === w || v.synonyms.some(s => s.toLowerCase() === w)) return { name: d.name, value: v.value }
    }
  }
  for (const d of defs) {
    if (!d.unit) continue
    const m = w.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${escapeRe(d.unit.toLowerCase())}$`))
    if (m) return { name: d.name, value: `${m[1].replace(',', '.')}${d.unit}` }
  }
  return null
}

// Oversætter en værdi til den definerede stavemåde ("navy" → "Marineblå") for en given egenskab
export function canonicalValue(attrName: string, value: string, defs: VariantAttributeDef[]): string {
  const d = defs.find(x => x.name.toLowerCase() === attrName.toLowerCase())
  if (!d) return value
  const w = value.trim().toLowerCase()
  const hit = d.values.find(v => v.value.toLowerCase() === w || v.synonyms.some(s => s.toLowerCase() === w))
  return hit ? hit.value : value
}
