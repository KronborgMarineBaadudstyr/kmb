// Ikon pr. kategori, når kategorien ikke har eget billede
const ICONS: Record<string, string> = {
  'sikkerhed': '🛡️', 'tovværk': '⚓', 'anker': '⚓', 'elektronik': '📡',
  'navigation': '🧭', 'rig': '⛵', 'bådpleje': '🪣', 'vedligehold': '🔧',
  'motor': '⚙️', 'el': '💡', 'installationer': '💡', 'vand': '💧',
  'sanitet': '💧', 'komfort': '☕', 'sejlertøj': '🧥', 'tøj': '🧥',
  'vandsport': '🏄', 'gave': '🎁', 'sko': '👟',
}
export function catIcon(name: string) {
  const n = name.toLowerCase()
  for (const [key, icon] of Object.entries(ICONS)) if (n.includes(key)) return icon
  return '📦'
}
