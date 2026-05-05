import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// Words too short or generic to count as meaningful overlap
const STOP_WORDS = new Set([
  'og', 'med', 'til', 'for', 'fra', 'den', 'det', 'de', 'en', 'et',
  'the', 'and', 'for', 'with', 'from',
])

// Strip colour words and normalise — mirrors normalize_for_matching() SQL function
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(rød|blå|grøn|sort|hvid|gul|grå|brun|orange|lilla|pink|red|blue|green|black|white|yellow|grey|gray|brown|purple|venstre|højre|left|right|øverste|nederste|top|bottom|lille|stor|mellem|mini|maxi|ekstra|super|ny|new)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Return meaningful words (≥3 chars, not a stop word, not pure digits)
function meaningfulWords(name: string): Set<string> {
  const words = normalizeName(name).split(/\s+/)
  const result = new Set<string>()
  for (const w of words) {
    const clean = w.replace(/[^a-zæøå0-9]/gi, '')
    if (clean.length >= 3 && !STOP_WORDS.has(clean) && !/^\d+$/.test(clean)) {
      result.add(clean)
    }
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

// POST /api/matching/auto-confirm
// Finds all pending EAN groups, checks name overlap across members,
// auto-confirms those with ≥2 common meaningful words across ALL member pairs.
// Sets notes on groups that need manual review explaining why.
export async function POST() {
  const supabase = createServiceClient()

  // Load all pending EAN groups with their members' names
  const allGroups: {
    id: string
    members: { normalized_name: string }[]
  }[] = []

  const PAGE = 200
  for (let p = 0; ; p++) {
    const { data, error } = await supabase
      .from('staging_match_groups')
      .select('id, supplier_product_staging(normalized_name)')
      .eq('match_method', 'ean')
      .eq('status', 'pending_review')
      .range(p * PAGE, p * PAGE + PAGE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break

    for (const row of data) {
      allGroups.push({
        id: row.id,
        members: (row.supplier_product_staging as { normalized_name: string }[] ?? []),
      })
    }
    if (data.length < PAGE) break
  }

  const toConfirm: string[] = []
  const toReview:  { id: string; reason: string }[] = []

  for (const group of allGroups) {
    const names = group.members
      .map(m => m.normalized_name)
      .filter(Boolean)

    if (names.length < 2) {
      toReview.push({
        id:     group.id,
        reason: 'Kun ét leverandørprodukt — ingen sammenligning mulig',
      })
      continue
    }

    // Check every pair — ALL pairs must have ≥2 word overlap
    let allPairsMatch = true
    let worstOverlap  = Infinity
    let worstPair: [string, string] = ['', '']

    outer: for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const overlap = wordOverlap(names[i], names[j])
        if (overlap < worstOverlap) {
          worstOverlap = overlap
          worstPair    = [names[i], names[j]]
        }
        if (overlap < 2) {
          allPairsMatch = false
          break outer
        }
      }
    }

    if (allPairsMatch) {
      toConfirm.push(group.id)
    } else {
      const short = (s: string) => s.length > 40 ? s.slice(0, 38) + '…' : s
      toReview.push({
        id:     group.id,
        reason: `Navnene deler kun ${worstOverlap} meningsfuldt ord — "${short(worstPair[0])}" vs "${short(worstPair[1])}"`,
      })
    }
  }

  // Batch-confirm in chunks of 200
  let confirmed = 0
  const BATCH = 200
  for (let i = 0; i < toConfirm.length; i += BATCH) {
    const chunk = toConfirm.slice(i, i + BATCH)
    const { error } = await supabase
      .from('staging_match_groups')
      .update({ status: 'confirmed', notes: null })
      .in('id', chunk)
    if (!error) confirmed += chunk.length
  }

  // Batch-update notes on needs_review groups
  for (let i = 0; i < toReview.length; i += BATCH) {
    const chunk = toReview.slice(i, i + BATCH)
    // Update each with its specific reason — do in parallel batches grouped by reason
    const byReason = new Map<string, string[]>()
    for (const { id, reason } of chunk) {
      if (!byReason.has(reason)) byReason.set(reason, [])
      byReason.get(reason)!.push(id)
    }
    for (const [reason, ids] of byReason) {
      await supabase
        .from('staging_match_groups')
        .update({ notes: reason })
        .in('id', ids)
    }
  }

  return NextResponse.json({
    ok:             true,
    auto_confirmed: confirmed,
    needs_review:   toReview.length,
    total_checked:  allGroups.length,
  })
}
