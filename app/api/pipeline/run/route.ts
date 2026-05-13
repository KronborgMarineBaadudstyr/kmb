import { createServiceClient } from '@/lib/supabase/server'
import { runMatchingEngine } from '@/lib/matching-engine'
import { createProductFromGroup } from '@/lib/product-creator'

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
    const summary = { categories_updated: 0, groups_created: 0, auto_confirmed: 0, products_created: 0, skipped: 0 }

    try {
      // ── STEP 1: Apply standard categories + strip prefixes ──────
      send({ stage: 'categories', status: 'running', message: 'Anvender standardstruktur på kategorier…' })

      // Strip redundant prefixes first
      const REDUNDANT_PREFIXES = [
        'Bådens ', 'Baadens ', 'Båd ', 'Baad ',
        'Marine ', 'Maritim ', 'Maritimt ', 'Skibets ', 'Skibs ',
      ]
      function stripPrefix(name: string): string {
        const lower = name.toLowerCase()
        for (const prefix of REDUNDANT_PREFIXES) {
          if (lower.startsWith(prefix.toLowerCase())) {
            const stripped = name.slice(prefix.length).trim()
            return stripped.charAt(0).toUpperCase() + stripped.slice(1)
          }
        }
        return name
      }

      const STANDARD: { pattern: RegExp; to: string }[] = [
        { pattern: /ankr|fortøjn|mooring|ankerkæde|docking|pullert|klampe|fortøjningsbeslag/, to: 'Ankre & fortøjning' },
        { pattern: /beslag|fastgørel|hardware|hængsler|låse|skrue|bolt|møtrik|bøjle|clips|krog|øjebolt|spænde|kæmme|rail|pop-nitte|nitte|strop/, to: 'Beslag & fastgørelse' },
        { pattern: /belysning|lanterner|lanterne|lys|lampe|led|navigation.?lys|spotlight|lygte|sølygte|positionslys|anticoll|signallampe/, to: 'Belysning & lanterner' },
        { pattern: /brændstof|brændstofsystem|tank|fuel|diesel|benzin|påfyldning|brændstofsfilter|vandudskiller|brændstofsslange/, to: 'Brændstof & tank' },
        { pattern: /dæk|cockpit|rig|mast|bom|sejl|blokke|winch|fald|skøde|stag|vant|wire|rigning|solsejl|spray.?hood|bimini|dodger/, to: 'Dæk & rig' },
        { pattern: /el[- &]|elektr|elektronik|instrument|vhf|radio|autopilot|chartplotter|transducer|ais|plotter|display|forbruger|relæ|sikring|kabel|ledning|stik|connector|usb|strømforsyning|switch.?panel/, to: 'El & elektronik' },
        { pattern: /batteri|energi|solcelle|solar|oplader|generator|inverter|landstrøm|powerbank|lithium|agm|gel.?batteri|shore.?power|vind.?generator|laderegulator/, to: 'Energi & batterier' },
        { pattern: /motor|fremdrift|propel|gear|gearkasse|koblin|transmission|impeller|kølevand|startmotor|alternator|drev|påhængsmotor|inboard|saildrive|shaft|throttle|gashåndtag|motorophæng|motorbeslag|manifold|udstødning|varmeveksler|olie.?filter/, to: 'Motor & fremdrift' },
        { pattern: /maling|overfladebehandling|bundmaling|bundbehandling|lak|primer|coating|polish|grunding|antifoul|gelcoat|teak.?olie|rustbeskyttelse|imprægner|forsegling/, to: 'Maling & overfladebehandling' },
        { pattern: /navigation|navigations|gps|kompas|ekkolod|dybde|vind.?instrument|log|barometer|pejl|sextant|søkort|chart|nmea|signalflag|flag/, to: 'Navigation & instrumenter' },
        { pattern: /pumpe|vvs|sanitet|toilet|bilge|vandpumpe|bruse|ferskvand|spildevand|slange|fitting|kuglehane|ventil|seacock|gennemføring|rør|vandtank|wc/, to: 'Pumper & VVS' },
        { pattern: /rengøring|vedligehold|rengørings|polering|vask|fedt|smøring|smøremidler|service|teak|træpleje|rens|scrubber|moppe|svamp|klud|børste|desinfek/, to: 'Rengøring & vedligehold' },
        { pattern: /sikkerhed|redning|rednings|flydevest|vest|harness|livline|sele|brandslukker|nødrakette|epirib|epirb|redningskrans|kasteline|mob|redningsflåde|flåde|nødsignal|pyroteknik/, to: 'Sikkerhed & redning' },
        { pattern: /tovværk|liner?|line\b|tov\b|reb\b|wire\b|spring|ankerliner?|fortøjningsliner?|snøre|polyester.?line/, to: 'Tovværk & liner' },
        { pattern: /udstyr|inventar|kabine|interiør|komfort|pude|madras|tæppe|gardin|køje|opbevaring|boks|container|holder|kopholder|bestik|køkken|komfur|varme|ventilation|hatch|luge|luke/, to: 'Udstyr & inventar' },
      ]

      function mapToStandard(cat: string): string | null {
        const lower = cat.toLowerCase()
        for (const { pattern, to } of STANDARD) {
          if (pattern.test(lower)) return to
        }
        return null
      }

      const { data: catRows } = await supabase
        .from('product_types')
        .select('our_category')
        .not('our_category', 'is', null)

      const catSeen = new Set<string>()
      for (const row of catRows ?? []) {
        const cat = row.our_category as string
        if (catSeen.has(cat)) continue
        catSeen.add(cat)

        // First strip prefix, then map to standard
        const stripped  = stripPrefix(cat)
        const standard  = mapToStandard(stripped) ?? mapToStandard(cat)
        const finalName = standard ?? stripped

        if (finalName !== cat) {
          await supabase.from('product_types').update({ our_category: finalName }).eq('our_category', cat)
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

      summary.auto_confirmed = toConfirm.length
      send({ stage: 'auto_confirm', status: 'done', confirmed: toConfirm.length, needs_review: reviewReasons.size, message: `${toConfirm.length} grupper bekræftet automatisk` })

      // ── STEP 4: Auto-create products for confirmed groups ───────
      send({ stage: 'auto_create', status: 'running', message: 'Opretter produkter for bekræftede grupper…' })

      const confirmedGroups: { id: string; suggested_name: string | null }[] = []
      for (let p = 0; ; p++) {
        const { data } = await supabase
          .from('staging_match_groups')
          .select('id, suggested_name')
          .eq('status', 'confirmed')
          .is('product_id', null)
          .range(p * PAGE, p * PAGE + PAGE - 1)

        if (!data || data.length === 0) break
        confirmedGroups.push(...(data as { id: string; suggested_name: string | null }[]))
        if (data.length < PAGE) break
      }

      // Load member names for groups without suggested_name
      const needsNames = confirmedGroups.filter(g => !g.suggested_name).map(g => g.id)
      const memberNameMap = new Map<string, string>()
      if (needsNames.length > 0) {
        const { data: mems } = await supabase
          .from('supplier_product_staging')
          .select('match_group_id, normalized_name')
          .in('match_group_id', needsNames)
        for (const m of (mems ?? [])) {
          const gid = (m as { match_group_id: string }).match_group_id
          const name = (m as { normalized_name: string }).normalized_name
          if (!memberNameMap.has(gid) && name?.trim()) memberNameMap.set(gid, name.trim())
        }
      }

      for (const group of confirmedGroups) {
        const name = group.suggested_name?.trim() || memberNameMap.get(group.id)
        if (!name) { summary.skipped++; continue }
        try {
          await createProductFromGroup(group.id, name, supabase)
          summary.products_created++
        } catch {
          summary.skipped++
        }
      }

      send({ stage: 'auto_create', status: 'done', created: summary.products_created, skipped: summary.skipped, message: `${summary.products_created} produkter oprettet` })

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
