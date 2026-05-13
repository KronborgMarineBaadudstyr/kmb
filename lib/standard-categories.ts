// Shared standard 15-category mapping used by both the rename-category API route
// and the pipeline. Patterns are tested in order; first match wins.

export const STANDARD_CATEGORIES: { pattern: RegExp; to: string }[] = [
  // Ankre & fortøjning
  { pattern: /ankr|fortøjn|mooring|ankerkæde|docking|pullert|fortøjningsbeslag/, to: 'Ankre & fortøjning' },
  // Beslag & fastgørelse
  { pattern: /beslag|fastgørel|hardware|hængsler?|låse|skrue|bolt|møtrik|bøjle|clips|krog|øjebolt|spænde|rail|pop-nitte|nitte|strop|struktur|konstruktion/, to: 'Beslag & fastgørelse' },
  // Belysning & lanterner
  { pattern: /belysning|lanterner?|lys\b|lampe|led\b|navigation.?lys|spotlight|lygte|sølygte|positionslys|anticoll|signallampe/, to: 'Belysning & lanterner' },
  // Brændstof & tank
  { pattern: /brændstof|brændstofsystem|tank\b|fuel|diesel|benzin|påfyldning|brændstofsfilter|vandudskiller|brændstofsslange/, to: 'Brændstof & tank' },
  // Dæk & rig
  { pattern: /dæk\b|cockpit|rigning|mast\b|bom\b|sejl\b|blokke|winch|fald\b|skøde|stag\b|vant\b|solsejl|spray.?hood|bimini|dodger/, to: 'Dæk & rig' },
  // El & elektronik
  { pattern: /\bel[- &]|elektr|elektronik|\bvhf\b|radio\b|autopilot|chartplotter|transducer|\bais\b|plotter|relæ|sikring\b|kabel\b|ledning|stik\b|connector|\busb\b|strømforsyning|switch.?panel|kontaktpanel/, to: 'El & elektronik' },
  // Energi & batterier
  { pattern: /batteri|energi|solcelle|solar|oplader|generator|inverter|landstrøm|powerbank|lithium|\bagm\b|gel.?batteri|shore.?power|vind.?generator|laderegulator/, to: 'Energi & batterier' },
  // Motor & fremdrift
  { pattern: /motor|fremdrift|propel|gearkasse|koblin|transmission|impeller|kølevand|startmotor|alternator|\bdrev\b|påhængsmotor|inboard|saildrive|shaft\b|throttle|gashåndtag|motorophæng|motorbeslag|manifold|udstødning|varmeveksler|olie.?filter/, to: 'Motor & fremdrift' },
  // Maling & overfladebehandling
  { pattern: /maling|overfladebehandling|bundmaling|bundbehandling|\blak\b|primer|coating|polish|grunding|antifoul|gelcoat|teak.?olie|rustbeskyttelse|imprægner|forsegling|reparations?.?(materiale|kit|middel|masse|epoxy)|epoxy/, to: 'Maling & overfladebehandling' },
  // Navigation & instrumenter
  { pattern: /navigation|navigations|\bgps\b|kompas|ekkolod|dybde|vind.?instrument|\blog\b|barometer|pejl|sextant|søkort|\bchart\b|\bnmea\b|signalflag|\bflag\b/, to: 'Navigation & instrumenter' },
  // Pumper & VVS
  { pattern: /pumpe|vvs|sanitær|sanitet|toilet|bilge|vandpumpe|bruse|ferskvand|spildevand|slange\b|fitting|kuglehane|ventil\b|seacock|gennemføring|\brør\b|vandtank|\bwc\b|vandsystem/, to: 'Pumper & VVS' },
  // Rengøring & vedligehold
  { pattern: /rengøring|vedligehold|polering|vask\b|smøring|smøremidler|service|teak.?pleje|rens\b|scrubber|moppe|svamp|klud|børste|desinfek/, to: 'Rengøring & vedligehold' },
  // Sikkerhed & redning
  { pattern: /sikkerhed|redning|rednings|flydevest|harness|livline|\bsele\b|brandslukker|nødrakette|epirib|epirb|redningskrans|kasteline|\bmob\b|redningsflåde|nødsignal|pyroteknik/, to: 'Sikkerhed & redning' },
  // Tovværk & liner
  { pattern: /tovværk|liner?\b|^line$|^tov$|^reb$|wire.?line|spring\b|fortøjningsliner?|snøre|polyester.?line/, to: 'Tovværk & liner' },
  // Udstyr & inventar — catch-all
  { pattern: /udstyr|inventar|kabine|interiør|komfort|pude|madras|tæppe|gardin|køje|opbevaring|boks|container|holder|kopholder|bestik|køkken|komfur|varme|ventilation|hatch|luge|luke|materialer?|tilbehør/, to: 'Udstyr & inventar' },
]

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

// Apply both strip + standard mapping; returns final name (may be unchanged)
export function normalizeCategory(cat: string): string {
  const stripped = stripPrefix(cat)
  return mapToStandard(stripped) ?? mapToStandard(cat) ?? stripped
}
