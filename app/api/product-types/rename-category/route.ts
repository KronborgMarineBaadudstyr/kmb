import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Prefixes that are always redundant in a boat-equipment webshop context
const REDUNDANT_PREFIXES = [
  'Bådens ', 'Baadens ', 'Båd ', 'Baad ',
  'Marine ', 'Maritim ', 'Maritimt ',
  'Skibets ', 'Skibs ',
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

// ─── Standard 15-category structure ──────────────────────────────
// Maps keyword patterns (lowercase) → canonical standard category name
// Patterns are tested in order; first match wins.
const STANDARD_CATEGORIES: { pattern: RegExp; to: string }[] = [
  // Ankre & fortøjning
  { pattern: /ankr|fortøjn|mooring|fortøj|ankerkæde|ankerkætte|ankerline|docking|pullert|klampe|fortøjningsbeslag/, to: 'Ankre & fortøjning' },
  // Beslag & fastgørelse
  { pattern: /beslag|fastgørel|hardware|hængsler|hængsle|låse|skrue|bolt|møtrik|låsepin|bøjle|clips|krog|wire-terminal|kauscher|wire terminal|øjebolt|spænde|kæmme|klampe|rail|pop-nitte|nitte|strop|spændings/, to: 'Beslag & fastgørelse' },
  // Belysning & lanterner
  { pattern: /belysning|lanterner|lanterne|lys|lampe|led|navigation.?lys|lanterner|spotlight|lygte|sølygte|positionslys|pont|anticoll|anti.?coll|signallampe|søfartslampe/, to: 'Belysning & lanterner' },
  // Brændstof & tank
  { pattern: /brændstof|brændstofsystem|tank|fuel|diesel|benzin|påfyldning|brændstofsfilter|vandudskiller|brændstofsslange|diesel.?filter|benzin.?filter/, to: 'Brændstof & tank' },
  // Dæk & rig
  { pattern: /dæk|cockpit|rig|mast|bom|sejl|blokke|winch|fald|skøde|stag|vant|wire|tovværk.?rig|blokkebeslag|sejlring|rigning|forfald|bakke|solsejl|spray.?hood|bimini|dodger/, to: 'Dæk & rig' },
  // El & elektronik
  { pattern: /el[- &]|elektr|elektronik|instrument|vhf|radio|autopilot|chartplotter|transducer|ais|plotter|display|forbruger|relæ|sikring|strøm|kabel|ledning|stik|connector|usb|12v.?udstyr|strømforsyning|switch.?panel|kontaktpanel/, to: 'El & elektronik' },
  // Energi & batterier
  { pattern: /batteri|energi|solcelle|solar|oplader|generator|inverter|landstrøm|powerbank|lithium|agm|gel.?batteri|battery|shore.?power|vind.?generator|laderegulator/, to: 'Energi & batterier' },
  // Motor & fremdrift
  { pattern: /motor|fremdrift|propel|gear|gearkasse|koblin|transmission|impeller|kølevand|startmotor|alternator|drev|benzinmotor|dieselmotor|påhængsmotor|inboard|saildrive|shaft|waterjet|throttle|gashåndtag|motorophæng|motorbeslag|motorbeslag|manifold|udstødning|varmeveksler|olie.?filter|motorfilter/, to: 'Motor & fremdrift' },
  // Maling & overfladebehandling
  { pattern: /maling|overfladebehandling|bundmaling|bundbehandling|lak|primer|coating|polish|grunding|antifoul|antifouling|gelcoat|teak.?olie|rustbeskyttelse|imprægner|forsegling/, to: 'Maling & overfladebehandling' },
  // Navigation & instrumenter
  { pattern: /navigation|navigations|instrument|gps|kompas|ekkolod|dybde|vind.?instrument|log|barometer|pejl|sextant|søkort|chart|nmea|signalflag|flag/, to: 'Navigation & instrumenter' },
  // Pumper & VVS
  { pattern: /pumpe|vvs|sanitet|toilet|hejse|bilge|vandpumpe|bruse|bad|ferskvand|spildevand|slange|fitting|kuglehane|ventil|seacock|gennemføring|rør|manifold.?vvs|vandtank|wc|pumpe.?system/, to: 'Pumper & VVS' },
  // Rengøring & vedligehold
  { pattern: /rengøring|vedligehold|rengørings|polering|vask|fedt|smøring|smøremidler|service|teak|træpleje|rens|scrubber|moppe|svamp|klud|børste|lugt|desinfek/, to: 'Rengøring & vedligehold' },
  // Sikkerhed & redning
  { pattern: /sikkerhed|redning|rednings|flydevest|vest|harness|livline|sele|brandslukker|nødrakette|epirib|epirb|sar|redningskrans|kasteline|MOB|man.?over.?board|redningsflåde|flåde|sos|nødsignal|pyroteknik/, to: 'Sikkerhed & redning' },
  // Tovværk & liner
  { pattern: /tovværk|liner?|line\b|tov\b|reb\b|wire\b|wireliner?|spring|ankerliner?|fortøjningsliner?|snøre|fald|skøde.?tov|polyester.?line/, to: 'Tovværk & liner' },
  // Udstyr & inventar — catch-all for cabin/comfort/misc
  { pattern: /udstyr|inventar|kabine|interiør|komfort|pude|madras|tæppe|gardin|köje|køje|opbevaring|boks|container|holder|beslag.?inventar|bimsen|kopholder|bestik|køkken|komfur|fyr|varme|ventilation|vindspjæld|hatch|luge|luke/, to: 'Udstyr & inventar' },
]

export function mapToStandard(cat: string): string | null {
  const lower = cat.toLowerCase()
  for (const { pattern, to } of STANDARD_CATEGORIES) {
    if (pattern.test(lower)) return to
  }
  return null // no match — keep as-is
}

// GET — preview which categories would be renamed by auto-cleanup OR standard mapping
export async function GET(request: Request) {
  const url    = new URL(request.url)
  const mode   = url.searchParams.get('preview') // 'standard' | null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('product_types')
    .select('our_category')
    .not('our_category', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const seen = new Set<string>()

  if (mode === 'standard') {
    const renames: { from: string; to: string; matched: boolean }[] = []
    for (const row of data ?? []) {
      const cat = row.our_category as string
      if (seen.has(cat)) continue
      seen.add(cat)
      const standard = mapToStandard(cat)
      if (standard && standard !== cat) renames.push({ from: cat, to: standard, matched: true })
      else if (!standard) renames.push({ from: cat, to: cat, matched: false })
    }
    return NextResponse.json({ renames })
  }

  // Default: prefix-strip preview
  const renames: { from: string; to: string }[] = []
  for (const row of data ?? []) {
    const cat = row.our_category as string
    if (seen.has(cat)) continue
    seen.add(cat)
    const clean = stripPrefix(cat)
    if (clean !== cat) renames.push({ from: cat, to: clean })
  }

  return NextResponse.json({ renames })
}

// POST — auto_cleanup | apply_standard | rename a specific category
export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json() as {
    auto_cleanup?:    boolean
    apply_standard?:  boolean
    old_category?:    string
    new_category?:    string
    old_subcategory?: string
    new_subcategory?: string
  }

  // ── Auto-cleanup mode (strip redundant prefixes) ───────────────
  if (body.auto_cleanup) {
    const { data, error } = await supabase
      .from('product_types')
      .select('our_category')
      .not('our_category', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const seen = new Set<string>()
    let updated = 0

    for (const row of data ?? []) {
      const cat = row.our_category as string
      if (seen.has(cat)) continue
      seen.add(cat)
      const clean = stripPrefix(cat)
      if (clean === cat) continue

      const { error: updErr } = await supabase
        .from('product_types')
        .update({ our_category: clean })
        .eq('our_category', cat)

      if (!updErr) updated++
    }

    return NextResponse.json({ ok: true, updated })
  }

  // ── Apply standard 15-category structure ──────────────────────
  if (body.apply_standard) {
    const { data, error } = await supabase
      .from('product_types')
      .select('our_category')
      .not('our_category', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const seen = new Set<string>()
    let updated = 0
    const skipped: string[] = []

    for (const row of data ?? []) {
      const cat = row.our_category as string
      if (seen.has(cat)) continue
      seen.add(cat)

      const standard = mapToStandard(cat)
      if (!standard || standard === cat) {
        if (!standard) skipped.push(cat)
        continue
      }

      const { error: updErr } = await supabase
        .from('product_types')
        .update({ our_category: standard })
        .eq('our_category', cat)

      if (!updErr) updated++
    }

    return NextResponse.json({ ok: true, updated, skipped })
  }

  // ── Single rename / merge mode ─────────────────────────────────
  const { old_category, new_category, old_subcategory, new_subcategory } = body

  if (!old_category || !new_category) {
    return NextResponse.json({ error: 'old_category og new_category er påkrævet' }, { status: 400 })
  }

  const updatePayload = {
    our_category: new_category.trim(),
    ...(new_subcategory !== undefined ? { our_subcategory: new_subcategory.trim() || null } : {}),
  }

  let q = supabase
    .from('product_types')
    .update(updatePayload)
    .eq('our_category', old_category)

  if (old_subcategory !== undefined) {
    q = old_subcategory
      ? q.eq('our_subcategory', old_subcategory)
      : q.is('our_subcategory', null)
  }

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
