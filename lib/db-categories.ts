// DB-backed category matching — replaces hardcoded standard-categories.ts in pipeline
// Load once with loadCategories(), then use assignFromDB() synchronously.

import type { SupabaseClient } from '@supabase/supabase-js'

export type DBSubcategory = { name: string; keywords: string[] }

export type DBCategory = {
  id:            string
  name:          string
  subcategories: DBSubcategory[]
  keywords:      string[]
  boat_types:    string[]
  sort_order:    number
  active:        boolean
}

export async function loadCategories(supabase: SupabaseClient): Promise<DBCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, subcategories, keywords, boat_types, sort_order, active')
    .eq('active', true)
    .order('sort_order')

  if (error) throw new Error(`loadCategories: ${error.message}`)
  return (data ?? []) as DBCategory[]
}

// Keyword match: returns true if any keyword appears as a word boundary in name
function matches(name: string, keywords: string[]): boolean {
  const lc = name.toLowerCase()
  return keywords.some(kw => {
    if (!kw) return false
    // Try whole-word match first, fall back to substring for compound words
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(lc) || lc.includes(kw.toLowerCase())
  })
}

export function assignFromDB(
  name: string,
  categories: DBCategory[],
): { category: string | null; subcategory: string | null; boatType: string[] } {
  for (const cat of categories) {
    if (!matches(name, cat.keywords)) continue

    let subcategory: string | null = null
    for (const sub of cat.subcategories) {
      if (matches(name, sub.keywords)) { subcategory = sub.name; break }
    }

    return { category: cat.name, subcategory, boatType: cat.boat_types }
  }

  return { category: null, subcategory: null, boatType: ['sejlbåd', 'motorbåd'] }
}

// Normalize a free-form category string to the nearest DB category name
export function normalizeCategoryFromDB(raw: string, categories: DBCategory[]): string {
  const lc = raw.toLowerCase().trim()

  // Exact match
  for (const cat of categories) {
    if (cat.name.toLowerCase() === lc) return cat.name
  }

  // Keyword match
  for (const cat of categories) {
    if (matches(raw, cat.keywords)) return cat.name
  }

  // Partial word overlap (≥4 chars)
  for (const cat of categories) {
    const words = cat.name.toLowerCase().split(/\W+/).filter(w => w.length >= 4)
    if (words.some(w => lc.includes(w))) return cat.name
  }

  return raw
}

export function buildDedupMapFromDB(
  rawCategories: string[],
  dbCategories: DBCategory[],
): Map<string, string> {
  const result = new Map<string, string>()
  for (const cat of rawCategories) {
    const normalized = normalizeCategoryFromDB(cat, dbCategories)
    if (normalized !== cat) result.set(cat, normalized)
  }
  return result
}
