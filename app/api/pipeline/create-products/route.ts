import { createServiceClient } from '@/lib/supabase/server'
import { bulkCreateProductsFromGroups } from '@/lib/bulk-product-creator'
import { assignProductCategory } from '@/lib/standard-categories'
import { processAutoStage } from '@/lib/auto-stage-processor'
import { PipelineRun } from '@/lib/pipeline-run'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// GET /api/pipeline/create-products?run_id=xxx — SSE stream
// Stages: auto_create → remap → suggestions → done
// Called automatically by the client after /api/pipeline/run completes.
// Idempotent: confirmed groups that already have a product are skipped.
export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })

  const send = (data: object) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    const supabase = createServiceClient()
    const summary: Record<string, number> = { products_created: 0, skipped: 0, remaining: 0, products_remapped: 0, suggestions_populated: 0 }

    // Attach to existing run from /run, or look up latest running run
    const runId = new URL(request.url).searchParams.get('run_id')
    let run: { updateStep: (s: string, p: object) => Promise<void>; finish: (s: Record<string, number>) => Promise<void>; fail: (e: string) => Promise<void> } | null = null
    if (runId) {
      const existing = await PipelineRun.latest()
      if (existing?.id === runId) {
        // Re-use the same run object via a minimal proxy
        const supabase2 = createServiceClient()
        run = {
          updateStep: async (stage, patch) => {
            await supabase2.from('pipeline_runs').update({
              steps: { ...(existing.steps ?? {}), [stage]: patch },
              updated_at: new Date().toISOString(),
            }).eq('id', runId)
          },
          finish: async (s) => {
            await supabase2.from('pipeline_runs').update({
              status: 'done', summary: s, finished_at: new Date().toISOString(),
            }).eq('id', runId)
          },
          fail: async (e) => {
            await supabase2.from('pipeline_runs').update({
              status: 'error', error: e, finished_at: new Date().toISOString(),
            }).eq('id', runId)
          },
        }
      }
    }

    try {
      // ── STEP 4: Bulk-create products for confirmed groups ────────
      send({ stage: 'auto_create', status: 'running', message: 'Opretter produkter i bulk…' })
      await run?.updateStep('auto_create', { status: 'running', message: 'Opretter produkter i bulk…' })

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
      await run?.updateStep('auto_create', { status: 'done', detail: `${totalCreated} produkter oprettet` })

      // ── STEP 5: Re-map all products to standard category structure ─
      send({ stage: 'remap', status: 'running', message: 'Kategoriserer alle produkter…' })
      await run?.updateStep('remap', { status: 'running', message: 'Kategoriserer alle produkter…' })

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
      await run?.updateStep('remap', { status: 'done', detail: `${remapUpdated} kategoriseret` })

      // ── STEP 6: Populate match_suggestions for pending staging rows ─
      send({ stage: 'suggestions', status: 'running', message: 'Forbereder match-forslag til staging…' })
      await run?.updateStep('suggestions', { status: 'running', message: 'Forbereder match-forslag til staging…' })

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
      await run?.updateStep('suggestions', { status: 'done', detail: `${suggUpdated} forslag tilføjet` })

      // ── STEP 7: Auto-match + auto-create fra pending staging ──────
      send({ stage: 'auto_stage', status: 'running', message: 'Auto-matcher staging mod eksisterende produkter (≥ 0.85)…' })
      await run?.updateStep('auto_stage', { status: 'running', message: 'Auto-matcher staging mod eksisterende produkter…' })

      const runId = new Date().toISOString()
      const startAutoStage = Date.now()
      let autoMatched = 0
      let autoCreated = 0

      try {
        const result = await processAutoStage(supabase, runId, (m, c) => {
          autoMatched = m; autoCreated = c
          if (Date.now() - startAutoStage < 230_000) {
            send({
              stage: 'auto_stage', status: 'running',
              matched: m, created: c,
              message: `${m} matchet til eksisterende · ${c} nye oprettet…`,
            })
          }
        })
        autoMatched = result.matched
        autoCreated = result.created
        summary.auto_matched = autoMatched
        summary.auto_created = autoCreated
      } catch (e) {
        send({ stage: 'auto_stage', status: 'error', message: String(e) })
      }

      send({
        stage: 'auto_stage', status: 'done',
        matched: autoMatched, created: autoCreated,
        message: `${autoMatched} matchet til eksisterende produkter · ${autoCreated} nye produkter oprettet`,
      })
      await run?.updateStep('auto_stage', { status: 'done', detail: `${autoMatched} matchet · ${autoCreated} oprettet` })

      // ── DONE ──────────────────────────────────────────────────────
      await run?.finish(summary)
      send({ stage: 'done', summary })

    } catch (err) {
      await run?.fail(String(err))
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
