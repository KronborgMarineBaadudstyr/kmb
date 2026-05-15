import { createServiceClient } from '@/lib/supabase/server'
import { runMatchingEngine } from '@/lib/matching-engine'
import { bulkCreateProductsFromGroups } from '@/lib/bulk-product-creator'
import { normalizeCategory, buildDedupeMap, assignProductCategory } from '@/lib/standard-categories'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// ── Word-overlap helpers (mirrors auto-confirm logic) ──────────────
const STOP_WORDS = new Set([
  'og', 'med', 'til', 'for', 'fra', 'den', 'det', 'de', 'en', 'et',
  'the', 'and', 'with', 'from',
])

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(rød|blå|grøn|sort|hvid|gul|grå|brun|orange|lilla|pink|red|blue|green|black|white|yellow|grey|gray|brown|purple|venstre|højre|left|right|øverste|nederste|top|bottom|lille|stor|mellem|mini|maxi|ekstra|super|ny|new)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function meaningfulWords(name: string): Set<string> {
  const words = normalizeName(name).split(/\s+/)
  const result = new Set<string>()
  for (const w of words) {
    const clean = w.replace(/[^a-zæøå0-9]/gi, '')
    if (clean.length >= 3 && !STOP_WORDS.has(clean) && !/^\d+$/.test(clean)) result.add(clean)
  }
  return result
}

function wordOverlap(a: string, b: string): number {
  const wa = meaningfulWords(a)
  const wb = meaningfulWords(b)
  let count = 0
  for (const w of wa) { if (wb.has(w)) count++ }
  return count
}

// GET /api/pipeline/run — SSE stream
// Stages: categories → matching → auto_confirm → auto_create → done
export async function GET() {
  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })

  const send = (data: object) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    const supabase = createServiceClient()
    const summary: Record<string, number> = { categories_updated: 0, groups_created: 0, auto_confirmed: 0, products_created: 0, skipped: 0, remaining: 0 }

    try {
      // ── STEP 1: Apply standard categories + strip prefixes ──────
      send({ stage: 'categories', status: 'running', message: 'Anvender standardstruktur på kategorier…' })

      const { data: catRows } = await supabase
        .from('product_types')
        .select('our_category')
        .not('our_category', 'is', null)

      const allCats = [...new Set((catRows ?? []).map(r => r.our_category as string))]

      // Phase 1: normalize to standard
      const phase1 = new Map<string, string>()
      for (const cat of allCats) {
        const final = normalizeCategory(cat)
        if (final !== cat) phase1.set(cat, final)
      }

      // Phase 2: fuzzy dedup on post-phase1 names
      const afterPhase1 = allCats.map(c => phase1.get(c) ?? c)
      const phase2 = buildDedupeMap([...new Set(afterPhase1)])

      for (const cat of allCats) {
        const afterP1 = phase1.get(cat) ?? cat
        const final   = phase2.get(afterP1) ?? afterP1
        if (final !== cat) {
          await supabase.from('product_types').update({ our_category: final }).eq('our_category', cat)
          summary.categories_updated++
        }
      }

      send({ stage: 'categories', status: 'done', updated: summary.categories_updated, message: `${summary.categories_updated} kategorier opdateret` })

      // ── STEP 2: Run matching engine ─────────────────────────────
      send({ stage: 'matching', status: 'running', message: 'Kører matching-motor…' })

      await runMatchingEngine((event) => {
        // Proxy matching engine SSE events (override stage so UI maps correctly)
        const { stage: _s, ...rest } = event as Record<string, unknown>
        void _s
        send({ stage: 'matching', ...rest })
        if ((event as { groups_created?: number }).groups_created != null) {
          summary.groups_created += (event as { groups_created: number }).groups_created
        }
      })

      send({ stage: 'matching', status: 'done', message: 'Matching-motor færdig' })

      // ── STEP 3: Auto-confirm EAN groups ────────────────────────
      send({ stage: 'auto_confirm', status: 'running', message: 'Auto-bekræfter EAN-grupper…' })

      const allGroups: { id: string; members: { normalized_name: string }[] }[] = []
      const PAGE = 200
      for (let p = 0; ; p++) {
        const { data } = await supabase
          .from('staging_match_groups')
          .select('id, supplier_product_staging(normalized_name)')
          .eq('match_method', 'ean')
          .eq('status', 'pending_review')
          .range(p * PAGE, p * PAGE + PAGE - 1)

        if (!data || data.length === 0) break
        for (const row of data) {
          allGroups.push({
            id:      row.id,
            members: (row.supplier_product_staging as { normalized_name: string }[] ?? []),
          })
        }
        if (data.length < PAGE) break
      }

      const toConfirm: string[] = []
      const reviewReasons = new Map<string, string[]>()

      for (const group of allGroups) {
        const names = group.members.map(m => m.normalized_name).filter(Boolean)
        if (names.length < 2) {
          // Single-member EAN group — confirm anyway (no conflict possible)
          toConfirm.push(group.id)
          continue
        }
        let allPairsMatch = true
        let worstOverlap  = Infinity
        let worstPair: [string, string] = ['', '']
        outer: for (let i = 0; i < names.length; i++) {
          for (let j = i + 1; j < names.length; j++) {
            const ov = wordOverlap(names[i], names[j])
            if (ov < worstOverlap) { worstOverlap = ov; worstPair = [names[i], names[j]] }
            if (ov < 2) { allPairsMatch = false; break outer }
          }
        }
        if (allPairsMatch) {
          toConfirm.push(group.id)
        } else {
          const short = (s: string) => s.length > 40 ? s.slice(0, 38) + '…' : s
          const reason = `Navnene deler kun ${worstOverlap} meningsfuldt ord — "${short(worstPair[0])}" vs "${short(worstPair[1])}"`
          if (!reviewReasons.has(reason)) reviewReasons.set(reason, [])
          reviewReasons.get(reason)!.push(group.id)
        }
      }

      // Batch confirm
      const BATCH = 200
      for (let i = 0; i < toConfirm.length; i += BATCH) {
        await supabase.from('staging_match_groups')
          .update({ status: 'confirmed', notes: null })
          .in('id', toConfirm.slice(i, i + BATCH))
      }
      // Write review reasons
      for (const [reason, ids] of reviewReasons) {
        for (let i = 0; i < ids.length; i += BATCH) {
          await supabase.from('staging_match_groups')
            .update({ notes: reason })
            .in('id', ids.slice(i, i + BATCH))
        }
      }

      // Also auto-confirm all single-supplier and variant groups (no ambiguity)
      const { data: autoGroups } = await supabase
        .from('staging_match_groups')
        .select('id')
        .in('match_method', ['single', 'variant'])
        .eq('status', 'pending_review')

      const singleAndVariantIds = (autoGroups ?? []).map((g: { id: string }) => g.id)
      for (let i = 0; i < singleAndVariantIds.length; i += BATCH) {
        await supabase.from('staging_match_groups')
          .update({ status: 'confirmed', notes: null })
          .in('id', singleAndVariantIds.slice(i, i + BATCH))
      }

      summary.auto_confirmed = toConfirm.length + singleAndVariantIds.length
      send({
        stage: 'auto_confirm', status: 'done',
        confirmed: summary.auto_confirmed,
        needs_review: reviewReasons.size,
        message: `${summary.auto_confirmed} grupper bekræftet (${toConfirm.length} EAN, ${singleAndVariantIds.length} enkelt/variant)`,
      })

      // ── STEP 4: Bulk-create products for confirmed groups (loop until done) ─
      send({ stage: 'auto_create', status: 'running', message: 'Opretter produkter i bulk…' })

      const startMs = Date.now()
      const MAX_MS  = 200_000 // stop looping after ~200 s to stay within 300 s limit
      let totalCreated  = 0
      let totalSkipped  = 0
      let remaining     = 0

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
        if (result.created === 0) break // nothing left to create
      } while (remaining > 0 && Date.now() - startMs < MAX_MS)

      summary.products_created = totalCreated
      summary.skipped          = totalSkipped
      summary.remaining        = remaining

      send({
        stage: 'auto_create', status: 'done',
        created: totalCreated, skipped: totalSkipped, remaining,
        message: remaining > 0
          ? `${totalCreated} produkter oprettet — ${remaining} tilbage (kør pipeline igen)`
          : `${totalCreated} produkter oprettet — alle er nu behandlet ✓`,
      })

      // ── STEP 5: Re-map all existing products to new category structure ──
      send({ stage: 'remap', status: 'running', message: 'Kategoriserer alle produkter…' })

      let remapUpdated   = 0
      let remapProcessed = 0
      const REMAP_PAGE   = 500
      const startRemap   = Date.now()
      const MAX_REMAP_MS = 180_000

      for (let offset = 0; ; offset += REMAP_PAGE) {
        if (Date.now() - startRemap > MAX_REMAP_MS) break

        const { data: batch } = await supabase
          .from('products')
          .select('id, name')
          .range(offset, offset + REMAP_PAGE - 1)

        if (!batch || batch.length === 0) break
        remapProcessed += batch.length

        // Group by (categories JSON, boat_type JSON) to minimise DB calls
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

      // ── DONE ────────────────────────────────────────────────────
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
