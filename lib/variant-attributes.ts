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

// ── Rækkefølge (shoppens variantvælger) ─────────────────────────────────────
// Egenskaber vises i listens rækkefølge (Størrelse før Farve …), værdier i den rækkefølge de står
// under egenskaben (S før M før L). Ukendte værdier kommer bagefter i "naturlig" orden (8mm før 10mm).

export type AttrOrder = { name: string; values: string[] }[]

export const toAttrOrder = (defs: Pick<VariantAttributeDef, 'name' | 'values'>[]): AttrOrder =>
  defs.map(d => ({ name: d.name, values: d.values.map(v => v.value) }))

const natural = (a: string, b: string) => a.localeCompare(b, 'da', { numeric: true, sensitivity: 'base' })
const findAttr = (order: AttrOrder, name: string) => order.find(o => o.name.toLowerCase() === name.toLowerCase())

export function orderAttributeNames(names: string[], order: AttrOrder): string[] {
  const idx = (n: string) => { const i = order.findIndex(o => o.name.toLowerCase() === n.toLowerCase()); return i < 0 ? Infinity : i }
  return [...names].sort((a, b) => idx(a) - idx(b) || natural(a, b))
}

export function compareAttrValues(attrName: string, a: string, b: string, order: AttrOrder): number {
  const vals = (findAttr(order, attrName)?.values ?? []).map(v => v.toLowerCase())
  const ia = vals.indexOf(a.toLowerCase()), ib = vals.indexOf(b.toLowerCase())
  if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || natural(a, b)
  return natural(a, b)
}

export function sortVariantsByAttributes<T extends { attributes: { name: string; value: string }[] }>(variants: T[], order: AttrOrder): T[] {
  const names = orderAttributeNames([...new Set(variants.flatMap(v => v.attributes.map(a => a.name)))], order)
  const valueOf = (v: T, n: string) => v.attributes.find(a => a.name === n)?.value
  return [...variants].sort((x, y) => {
    for (const n of names) {
      const a = valueOf(x, n), b = valueOf(y, n)
      if (a === b) continue
      if (a === undefined) return 1
      if (b === undefined) return -1
      const c = compareAttrValues(n, a, b, order)
      if (c !== 0) return c
    }
    return 0
  })
}
