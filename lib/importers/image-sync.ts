/**
 * image-sync.ts
 *
 * Shared helper: kopiér leverandørbilleder til product_images.
 *
 * Regler:
 * - Billeder der allerede eksisterer (samme URL) springes over
 * - Første billede sættes som primær HVIS produktet ikke allerede har et primærbillede
 * - Billedfejl logges til import_change_log og returneres som liste (ikke kastet)
 */
import { createServiceClient } from '@/lib/supabase/server'

export type SupplierImage = {
  url:        string
  alt:        string
  is_primary: boolean
}

export async function syncImagesToProduct(
  productId:  string,
  images:     SupplierImage[],
  source:     string,   // 'palby' | 'engholm' | 'columbus' osv.
  supabase:   ReturnType<typeof createServiceClient>,
): Promise<{ synced: number; skipped: number; error: string | null }> {
  if (images.length === 0) return { synced: 0, skipped: 0, error: null }

  // Hent eksisterende billeder for dette produkt
  const { data: existing } = await supabase
    .from('product_images')
    .select('url, is_primary')
    .eq('product_id', productId)

  const existingUrls = new Set((existing ?? []).map(r => r.url))
  const hasPrimary   = (existing ?? []).some(r => r.is_primary)

  const toInsert = images
    .filter(img => img.url && !existingUrls.has(img.url))
    .map((img, idx) => ({
      product_id:   productId,
      url:          img.url,
      alt_text:     img.alt || null,
      is_primary:   !hasPrimary && idx === 0,
      position:     (existing?.length ?? 0) + idx,
      source,
      storage_path: null,
    }))

  if (toInsert.length === 0) return { synced: 0, skipped: images.length, error: null }

  const { error } = await supabase.from('product_images').insert(toInsert)

  if (error) {
    // Log til import_change_log — best effort, fejl i logning ignoreres
    await supabase.from('import_change_log').insert({
      supplier_id:  null,
      product_id:   productId,
      field_name:   'product_images',
      change_type:  'image_sync_error',
      new_value:    JSON.stringify({ source, urls: toInsert.map(i => i.url), error: error.message }),
      changed_at:   new Date().toISOString(),
    }).catch(() => {/* ignore */})

    return { synced: 0, skipped: images.length, error: error.message }
  }

  return { synced: toInsert.length, skipped: images.length - toInsert.length, error: null }
}
