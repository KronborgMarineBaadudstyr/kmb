/**
 * product-enrichment.ts
 *
 * Fælles helpers der beriger `products`-rækken med data fra leverandørens feed
 * når et match etableres.
 *
 * Filosofi:
 *  - Fyld kun TOMME felter — overskriv aldrig manuelle redaktioner
 *  - Kategorier er ADDITIVE — vi tilføjer aldrig, aldrig fjerner
 *  - Specifications er MERGE — nye nøgler tilføjes, eksisterende bevares
 *  - Alle funktioner er idempotente og best-effort (fejl logges, kastes ikke)
 */

import { createServiceClient } from '@/lib/supabase/server'

type Supabase = ReturnType<typeof createServiceClient>

// ── Dimensioner & vægt ────────────────────────────────────────────────────────

export type Dimensions = {
  weight?: number | null
  length?: number | null
  width?:  number | null
  height?: number | null
}

/**
 * Udfylder tomme dimensions/vægt-felter på produktet.
 * Eksisterende værdier overskrives IKKE.
 */
export async function applyDimensionsToProduct(
  productId: string,
  dims:       Dimensions,
  supabase:   Supabase,
): Promise<void> {
  if (!dims.weight && !dims.length && !dims.width && !dims.height) return

  const { data: current } = await supabase
    .from('products')
    .select('weight, length, width, height')
    .eq('id', productId)
    .single()

  if (!current) return

  const updates: Record<string, number> = {}
  if (dims.weight != null && !current.weight) updates.weight = dims.weight
  if (dims.length != null && !current.length) updates.length = dims.length
  if (dims.width  != null && !current.width)  updates.width  = dims.width
  if (dims.height != null && !current.height) updates.height = dims.height

  if (Object.keys(updates).length === 0) return

  await supabase.from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', productId)
}

// ── Beskrivelser ─────────────────────────────────────────────────────────────

export type Descriptions = {
  description?:       string | null
  short_description?: string | null
}

/**
 * Udfylder tomme beskrivelse-felter på produktet.
 * Eksisterende tekster overskrives IKKE.
 */
export async function applyDescriptionsToProduct(
  productId: string,
  descs:     Descriptions,
  supabase:  Supabase,
): Promise<void> {
  if (!descs.description && !descs.short_description) return

  const { data: current } = await supabase
    .from('products')
    .select('description, short_description')
    .eq('id', productId)
    .single()

  if (!current) return

  const updates: Record<string, string> = {}
  if (descs.description       && !current.description)       updates.description       = descs.description
  if (descs.short_description && !current.short_description) updates.short_description = descs.short_description

  if (Object.keys(updates).length === 0) return

  await supabase.from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', productId)
}

// ── Kategorier ───────────────────────────────────────────────────────────────

/**
 * Tilføjer nye kategorier til produktet (additivt — fjerner aldrig eksisterende).
 */
export async function applyCategoriesToProduct(
  productId:  string,
  categories: string[],
  supabase:   Supabase,
): Promise<void> {
  const newCats = categories.map(c => c.trim()).filter(Boolean)
  if (newCats.length === 0) return

  const { data: current } = await supabase
    .from('products')
    .select('categories')
    .eq('id', productId)
    .single()

  if (!current) return

  const existing: string[] = current.categories ?? []
  const merged = [...new Set([...existing, ...newCats])]

  if (merged.length === existing.length) return // Ingen nye kategorier

  await supabase.from('products')
    .update({ categories: merged, updated_at: new Date().toISOString() })
    .eq('id', productId)
}

// ── Manufacturer SKU ─────────────────────────────────────────────────────────

/**
 * Udfylder products.manufacturer_sku hvis det er tomt.
 *
 * NB: DB-triggeren `trg_auto_original_number` (migration 030) opfanger
 * denne UPDATE automatisk og opgraderer original_number fra 'ean'/'internal_sku'
 * til 'manufacturer_sku' — ingen ekstra kode nødvendig her.
 */
export async function applyManufacturerSkuToProduct(
  productId:       string,
  manufacturerSku: string | null,
  supabase:        Supabase,
): Promise<void> {
  if (!manufacturerSku) return

  const { data: current } = await supabase
    .from('products')
    .select('manufacturer_sku')
    .eq('id', productId)
    .single()

  if (!current || current.manufacturer_sku) return // Allerede udfyldt

  await supabase.from('products')
    .update({ manufacturer_sku: manufacturerSku, updated_at: new Date().toISOString() })
    .eq('id', productId)
  // Triggeren håndterer automatisk original_number → 'manufacturer_sku'
}

// ── Specifikationer ───────────────────────────────────────────────────────────

/**
 * Merger nye nøgle-værdi specifikationer ind i products.specifications (jsonb).
 * Eksisterende nøgler overskrives IKKE.
 *
 * @param specs  Record<string, string | number | null>
 */
export async function applySpecificationsToProduct(
  productId: string,
  specs:     Record<string, string | number | null | undefined>,
  supabase:  Supabase,
): Promise<void> {
  const cleanSpecs: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(specs)) {
    if (v != null && v !== '') cleanSpecs[k] = v
  }
  if (Object.keys(cleanSpecs).length === 0) return

  const { data: current } = await supabase
    .from('products')
    .select('specifications')
    .eq('id', productId)
    .single()

  if (!current) return

  const existing: Record<string, unknown> = (current.specifications as Record<string, unknown>) ?? {}
  // Tilføj kun nøgler der ikke allerede eksisterer
  const merged: Record<string, unknown> = { ...cleanSpecs, ...existing } // existing vinder

  // Ingen ændring hvis alle nøgler allerede fandtes
  const newKeys = Object.keys(cleanSpecs).filter(k => !(k in existing))
  if (newKeys.length === 0) return

  await supabase.from('products')
    .update({ specifications: merged, updated_at: new Date().toISOString() })
    .eq('id', productId)
}

// ── Variant-attributter ───────────────────────────────────────────────────────

/**
 * Opdaterer products.attributes med variant-attributter fra leverandørens feed
 * (f.eks. Farve, Størrelse fra Kap-Horn).
 *
 * Bruges til at sikre at attributterne er synlige på produktkortet selv
 * inden varianter oprettes manuelt.
 * Eksisterende attributes berøres ikke.
 */
export async function applyVariantAttributesToProduct(
  productId:  string,
  attributes: Array<{ name: string; value: string }>,
  supabase:   Supabase,
): Promise<void> {
  if (attributes.length === 0) return

  const { data: current } = await supabase
    .from('products')
    .select('attributes')
    .eq('id', productId)
    .single()

  if (!current) return

  const existing: Array<{ name: string; value: string }> =
    Array.isArray(current.attributes) ? current.attributes : []

  const existingNames = new Set(existing.map((a: { name: string }) => a.name.toLowerCase()))
  const toAdd = attributes.filter(a => !existingNames.has(a.name.toLowerCase()))

  if (toAdd.length === 0) return

  await supabase.from('products')
    .update({ attributes: [...existing, ...toAdd], updated_at: new Date().toISOString() })
    .eq('id', productId)
}

// ── Kombineret enrichment ─────────────────────────────────────────────────────

export type ProductEnrichmentData = {
  dimensions?:          Dimensions
  descriptions?:        Descriptions
  categories?:          string[]
  manufacturerSku?:     string | null
  specifications?:      Record<string, string | number | null | undefined>
  variantAttributes?:   Array<{ name: string; value: string }>
}

/**
 * Kør alle relevant enrichment-operationer for et produkt-match i ét kald.
 * Alle operationer er parallelle og best-effort.
 */
export async function enrichMatchedProduct(
  productId: string,
  data:      ProductEnrichmentData,
  supabase:  Supabase,
): Promise<void> {
  const ops: Promise<void>[] = []

  if (data.dimensions)
    ops.push(applyDimensionsToProduct(productId, data.dimensions, supabase))

  if (data.descriptions)
    ops.push(applyDescriptionsToProduct(productId, data.descriptions, supabase))

  if (data.categories?.length)
    ops.push(applyCategoriesToProduct(productId, data.categories, supabase))

  if (data.manufacturerSku)
    ops.push(applyManufacturerSkuToProduct(productId, data.manufacturerSku, supabase))

  if (data.specifications && Object.keys(data.specifications).length > 0)
    ops.push(applySpecificationsToProduct(productId, data.specifications, supabase))

  if (data.variantAttributes?.length)
    ops.push(applyVariantAttributesToProduct(productId, data.variantAttributes, supabase))

  await Promise.all(ops)
}
