// Shared standard category mapping used by the rename-category API route and pipeline.
// Patterns are tested in order; first match wins.

export const STANDARD_CATEGORIES: { pattern: RegExp; to: string }[] = [
  { pattern: /ankr|fortøjn|mooring|ankerkæde|docking|pullert|fortøjningsbeslag/, to: 'Ankre & fortøjning' },
  { pattern: /beslag|fastgørel|hardware|hængsler?|låse|skrue|bolt|møtrik|bøjle|clips|krog|øjebolt|spænde|rail|pop-nitte|nitte|strop|konstruktion/, to: 'Beslag & fastgørelse' },
  { pattern: /belysning|lanterner?|lys\b|lampe|led\b|navigation.?lys|spotlight|lygte|sølygte|positionslys|anticoll|signallampe/, to: 'Belysning & lanterner' },
  { pattern: /brændstof|brændstofsystem|tank\b|fuel|diesel|benzin|påfyldning|brændstofsfilter|vandudskiller|brændstofsslange/, to: 'Brændstof & tank' },
  { pattern: /dæk\b|cockpit|rigning|mast\b|bom\b|sejl\b|blokke|winch|fald\b|skøde|stag\b|vant\b|solsejl|spray.?hood|bimini|dodger/, to: 'Dæk & rig' },
  { pattern: /\bel[- &]|elektr|elektronik|\bvhf\b|radio\b|autopilot|chartplotter|transducer|\bais\b|plotter|relæ|sikring\b|kabel\b|ledning|stik\b|connector|\busb\b|strømforsyning|switch.?panel|kontaktpanel/, to: 'El & elektronik' },
  { pattern: /batteri|energi|solcelle|solar|oplader|generator|inverter|landstrøm|powerbank|lithium|\bagm\b|gel.?batteri|shore.?power|vind.?generator|laderegulator/, to: 'Energi & batterier' },
  { pattern: /motor|fremdrift|propel|gearkasse|koblin|transmission|impeller|kølevand|startmotor|alternator|\bdrev\b|påhængsmotor|inboard|saildrive|shaft\b|throttle|gashåndtag|motorophæng|motorbeslag|manifold|udstødning|varmeveksler|olie.?filter|styr|manøvr|ror\b|rorhåndtag|styrerulle|styresystem/, to: 'Motor & fremdrift' },
  { pattern: /maling|overfladebehandling|bundmaling|bundbehandling|\blak\b|primer|coating|polish|grunding|antifoul|gelcoat|teak.?olie|rustbeskyttelse|imprægner|forsegling|reparations?.?(materiale|kit|middel|masse|epoxy)|epoxy/, to: 'Maling & overfladebehandling' },
  { pattern: /navigation|navigations|\bgps\b|kompas|ekkolod|dybde|vind.?instrument|\blog\b|barometer|pejl|sextant|søkort|\bchart\b|\bnmea\b|signalflag|\bflag\b/, to: 'Navigation & instrumenter' },
  { pattern: /pumpe|vvs|sanitær|sanitet|toilet|bilge|vandpumpe|bruse|ferskvand|spildevand|slange\b|fitting|kuglehane|ventil\b|seacock|gennemføring|\brør\b|vandtank|\bwc\b|vandsystem/, to: 'Pumper & VVS' },
  { pattern: /rengøring|vedligehold|polering|vask\b|smøring|smøremidler|service|teak.?pleje|rens\b|scrubber|moppe|svamp|klud|børste|desinfek/, to: 'Rengøring & vedligehold' },
  { pattern: /sikkerhed|redning|rednings|flydevest|harness|livline|\bsele\b|brandslukker|nødrakette|epirib|epirb|redningskrans|kasteline|\bmob\b|redningsflåde|nødsignal|pyroteknik/, to: 'Sikkerhed & redning' },
  { pattern: /tovværk|liner?\b|^line$|^tov$|^reb$|wire.?line|spring\b|fortøjningsliner?|snøre|polyester.?line/, to: 'Tovværk & liner' },
  { pattern: /udstyr|inventar|kabine|interiør|komfort|pude|madras|tæppe|gardin|køje|opbevaring|boks|container|holder|kopholder|bestik|køkken|komfur|varme|ventilation|hatch|luge|luke|materialer?|tilbehør|struktur/, to: 'Udstyr & inventar' },
]

// The canonical set of exactly the 15 allowed category names
export const CANONICAL_CATEGORIES = new Set(STANDARD_CATEGORIES.map(c => c.to))

// Redundant prefixes to strip before mapping
export const REDUNDANT_PREFIXES = [
  'Bådens ', 'Baadens ', 'Båd ', 'Baad ',
  'Marine ', 'Maritim ', 'Maritimt ',
  'Skibets ', 'Skibs ',
]

export function stripPrefix(name: string): string {
  const lower = name.toLowerCase()
  for (const prefix of REDUNDANT_PREFIXES) {
    if (lower.startsWith(prefix.toLowerCase())) {
      const stripped = name.slice(prefix.length).trim()
      return stripped.charAt(0).toUpperCase() + stripped.slice(1)
    }
  }
  return name
}

export function mapToStandard(cat: string): string | null {
  const lower = cat.toLowerCase()
  for (const { pattern, to } of STANDARD_CATEGORIES) {
    if (pattern.test(lower)) return to
  }
  return null
}

// Apply strip + standard mapping; returns final name (may be unchanged)
export function normalizeCategory(cat: string): string {
  const stripped = stripPrefix(cat)
  return mapToStandard(stripped) ?? mapToStandard(cat) ?? stripped
}

// ── Fuzzy deduplication ────────────────────────────────────────────────────
// After standard mapping, some categories may still slip through with different
// surface forms of the same concept. This function takes a list of all unique
// category names and returns a merge map: { from → canonical } for any names
// that share a "core word" with another name and should be unified.
//
// Core word = first meaningful word ≥4 chars (lowercased, stripped of "-" etc.)
// If two or more category names share the same core word the shortest name wins
// as the canonical form (most specific short names beat verbose variants).

export function buildDedupeMap(categories: string[]): Map<string, string> {
  const merges = new Map<string, string>() // from → to

  // Group by core word
  const byCore = new Map<string, string[]>()
  for (const cat of categories) {
    const core = getCoreWord(cat)
    if (!core) continue
    if (!byCore.has(core)) byCore.set(core, [])
    byCore.get(core)!.push(cat)
  }

  for (const group of byCore.values()) {
    if (group.length < 2) continue
    // Canonical = the name already in CANONICAL_CATEGORIES if any, else shortest
    const canonical =
      group.find(c => CANONICAL_CATEGORIES.has(c)) ??
      group.reduce((a, b) => a.length <= b.length ? a : b)

    for (const name of group) {
      if (name !== canonical) merges.set(name, canonical)
    }
  }

  return merges
}

function getCoreWord(cat: string): string {
  // Strip "& ..." suffix variants, lowercase, take first word ≥4 chars
  const clean = cat
    .replace(/[&\-]/g, ' ')
    .replace(/\b(og|og|tilbehør|udstyr|system|systemer|materialer?|kontrol)\b/gi, '')
    .trim()
  const words = clean.split(/\s+/)
  for (const w of words) {
    const c = w.toLowerCase().replace(/[^a-zæøå]/gi, '')
    if (c.length >= 4) return c
  }
  return ''
}
