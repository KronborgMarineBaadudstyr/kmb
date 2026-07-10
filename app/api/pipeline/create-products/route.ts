import { createServiceClient } from '@/lib/supabase/server'
import { bulkCreateProductsFromGroups } from '@/lib/bulk-product-creator'
import { assignProductCategory } from '@/lib/standard-categories'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// GET /api/pipeline/create-products — SSE stream
// Stages: auto_create → remap → suggestions → done
// Called automatically by the client after /api/pipeline/run completes.
// Idempotent: confirmed groups that already have a product are skipped.
export async function GET() {
  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })

  const send = (data: object) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    const supabase = createServiceClient()
    const summary: Record<string, number> = { products_created: 0, skipped: 0, remaining: 0, products_remapped: 0, suggestions_populated: 0 }

    try {
      // ── STEP 4: Bulk-create products for confirmed groups ────────
      send({ stage: 'auto_create', status: 'running', message: 'Opretter produkter i bulk…' })

      const startMs = Date.now()
      const MAX_MS  = 220_000 // stop after ~220 s to stay within 300 s limit
      let totalCreated = 0
      let totalSkipped = 0
      let remaining    = 0

      do {
        const result = await bulkCreateProductsFromGroups(supabase, 2000)
        totalCreated += result.created
        totalSkipped += result.skipped
        remaining     = result.remaining
        if (result.created > 0) {
          send({
            stage: 'auto_create', status: 'running',
            created: totalCreated, remaining,
            message: `${totalCreated} produkter oprettet — ${remaining} tilbage…`,
          })
        }
        if (result.created === 0) break
      } while (remaining > 0 && Date.now() - startMs < MAX_MS)

      summary.products_created = totalCreated
      summary.skipped          = totalSkipped
      summary.remaining        = remaining

      send({
        stage: 'auto_create', status: 'done',
        created: totalCreated, skipped: totalSkipped, remaining,
        message: remaining > 0
          ? `${totalCreated} produkter oprettet — ${remaining} tilbage`
          : `${totalCreated} produkter oprettet ✓`,
      })

      // ── STEP 5: Re-map all products to standard category structure ─
      send({ stage: 'remap', status: 'running', message: 'Kategoriserer alle produkter…' })

      let remapUpdated   = 0
      let remapProcessed = 0
      const REMAP_PAGE   = 500
      const startRemap   = Date.now()
      const MAX_REMAP_MS = 200_000

      for (let offset = 0; ; offset += REMAP_PAGE) {
        if (Date.now() - startRemap > MAX_REMAP_MS) break

        const { data: batch } = await supabase
          .from('products')
          .select('id, name')
          .range(offset, offset + REMAP_PAGE - 1)

        if (!batch || batch.length === 0) break
        remapProcessed += batch.length

        const groups = new Map<string, string[]>()
        for (const p of batch as { id: string; name: string }[]) {
          const { category, subcategory, boatType } = assignProductCategory(p.name)
          const cats = [category, subcategory].filter(Boolean) as string[]
          const key  = JSON.stringify({ cats, boatType })
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(p.id)
        }

        await Promise.all(
          Array.from(groups.entries()).map(([key, ids]) => {
            const { cats, boatType } = JSON.parse(key) as { cats: string[]; boatType: string[] }
            return supabase.from('products')
              .update({ categories: cats, boat_type: boatType })
              .in('id', ids)
          })
        )
        remapUpdated += batch.length

        if (batch.length < REMAP_PAGE) break

        send({
          stage: 'remap', status: 'running',
          processed: remapProcessed,
          message: `${remapProcessed} produkter kategoriseret…`,
        })
      }

      summary.products_remapped = remapUpdated
      send({
        stage: 'remap', status: 'done',
        processed: remapUpdated,
        message: `${remapUpdated} produkter kategoriseret`,
      })

      // ── STEP 6: Populate match_suggestions for pending staging rows ─
      send({ stage: 'suggestions', status: 'running', message: 'Forbereder match-forslag til staging…' })

      let suggUpdated = 0
      const SUGG_PAGE   = 100
      const MAX_SUGG    = 500
      const startSugg   = Date.now()
      const MAX_SUGG_MS = 60_000

      for (let offset = 0; offset < MAX_SUGG && Date.now() - startSugg < MAX_SUGG_MS; offset += SUGG_PAGE) {
        const { data: stagingBatch } = await supabase
          .from('supplier_product_staging')
          .select('id, normalized_name')
          .in('status', ['pending_review', 'needs_review'])
          .or('match_suggestions.is.null,match_suggestions.eq.{}')
          .not('normalized_name', 'is', null)
          .range(offset, offset + SUGG_PAGE - 1)

        if (!stagingBatch || stagingBatch.length === 0) break

        await Promise.allSettled(
          (stagingBatch as { id: string; normalized_name: string }[]).map(async row => {
            const { data: fuzzyMatches } = await supabase
              .rpc('fuzzy_product_search', { search_query: row.normalized_name, match_limit: 5 })

            const suggestions = (fuzzyMatches ?? []).map((m: { id: string; name: string; similarity: number }) => ({
              product_id: m.id,
              name:       m.name,
              score:      m.similarity,
            }))

            if (suggestions.length > 0) {
              await supabase.from('supplier_product_staging')
                .update({ match_suggestions: suggestions, updated_at: new Date().toISOString() })
                .eq('id', row.id)
              suggUpdated++
            }
          })
        )
      }

      summary.suggestions_populated = suggUpdated
      send({
        stage: 'suggestions', status: 'done',
        populated: suggUpdated,
        message: `${suggUpdated} staging-rækker fik match-forslag`,
      })

      // ── DONE ──────────────────────────────────────────────────────
      send({ stage: 'done', summary })

    } catch (err) {
      send({ stage: 'error', message: String(err) })
    } finally {
      ctrl.close()
    }
  })()

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
