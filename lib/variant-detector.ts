export type VariantAttribute = { unit: string; name: string }
export type ProductType = {
  id: string
  name: string
  keywords: string[]
  variant_attributes: VariantAttribute[]
  our_category: string | null
  our_subcategory: string | null
}

// Find which product type (if any) matches a product name
export function matchProductType(
  normalizedName: string,
  productTypes: ProductType[]
): ProductType | null {
  const lower = normalizedName.toLowerCase()
  for (const pt of productTypes) {
    if (pt.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return pt
    }
  }
  return null
}

// Extract variant attribute values from a product name
// e.g. name="Ankerkæde 10mm 30m", attrs=[{unit:"mm",name:"Godstyklelse"},{unit:"m",name:"Længde"}]
// returns { "Godstyklelse": "10mm", "Længde": "30m" }
export function extractVariantValues(
  name: string,
  attrs: VariantAttribute[]
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const attr of attrs) {
    const regex = new RegExp(`(\\d+(?:[.,]\\d+)?\\s*${escapeRegex(attr.unit)})\\b`, 'i')
    const match = name.match(regex)
    if (match) result[attr.name] = match[1].replace(/\s+/g, '').toLowerCase()
  }
  return result
}

// Strip variant values from name to get the "base name"
// e.g. "Ankerkæde galvaniseret 10mm 30m" → "Ankerkæde galvaniseret"
export function getBaseName(name: string, attrs: VariantAttribute[]): string {
  let base = name
  for (const attr of attrs) {
    const regex = new RegExp(`\\s*\\d+(?:[.,]\\d+)?\\s*${escapeRegex(attr.unit)}\\b`, 'gi')
    base = base.replace(regex, '')
  }
  return base.replace(/\s+/g, ' ').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
