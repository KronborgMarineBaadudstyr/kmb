/**
 * extract-brand.ts
 *
 * Detects the brand from a product name using a list of known brands.
 * Checks canonical name and all aliases (case-insensitive, word-boundary aware).
 *
 * Usage:
 *   import { extractBrand } from '@/lib/extract-brand'
 *   const brand = extractBrand('LIROS Polyester Braid 10mm', brands)
 *   // → 'LIROS'
 */

export interface KnownBrand {
  id: string
  name: string
  aliases: string[]
}

/**
 * Returns the canonical brand name if found in the product name, or null.
 * Tries the canonical name first, then all aliases — longest match wins to
 * avoid "Honda" matching before "Honda Marine" etc.
 */
export function extractBrand(
  productName: string,
  brands: KnownBrand[]
): string | null {
  if (!productName || brands.length === 0) return null

  const haystack = productName.toLowerCase()

  // Collect all candidates (canonical + aliases) with their canonical name
  type Candidate = { term: string; canonical: string }
  const candidates: Candidate[] = []

  for (const b of brands) {
    candidates.push({ term: b.name.toLowerCase(), canonical: b.name })
    for (const alias of b.aliases) {
      candidates.push({ term: alias.toLowerCase(), canonical: b.name })
    }
  }

  // Sort longest-first so multi-word brands beat single-word sub-strings
  candidates.sort((a, b) => b.term.length - a.term.length)

  for (const { term, canonical } of candidates) {
    // Word-boundary check: character before and after must be non-word (or start/end)
    const idx = haystack.indexOf(term)
    if (idx === -1) continue

    const before = idx === 0 ? '' : haystack[idx - 1]
    const after  = idx + term.length >= haystack.length ? '' : haystack[idx + term.length]

    const beforeOk = before === '' || /\W/.test(before)
    const afterOk  = after  === '' || /\W/.test(after)

    if (beforeOk && afterOk) return canonical
  }

  return null
}

/**
 * Convenience wrapper that fetches known_brands from Supabase and runs extraction.
 * Pass your Supabase client so this can be used server-side without re-fetching globals.
 */
export async function extractBrandFromDB(
  productName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string | null> {
  const { data } = await supabase
    .from('known_brands')
    .select('id, name, aliases')

  if (!data) return null
  return extractBrand(productName, data as KnownBrand[])
}
