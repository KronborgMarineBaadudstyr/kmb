'use client'

// ── Lovesaling brand palette ──────────────────────────────────────────────────
// Inspired by kronborgmarineudstyr.dk: clean white/navy minimal nautical aesthetic
// Logo: L+S monogram (coming later)

const PALETTE = [
  { name: 'Navy Deep',    hex: '#0F2B4E', var: '--ls-navy',      use: 'Primær navigation, headings, dark baggrund' },
  { name: 'Ocean Blue',   hex: '#1B5E8C', var: '--ls-ocean',     use: 'Links, knappers hover-state, accenter' },
  { name: 'Horizon',      hex: '#3A7EAA', var: '--ls-horizon',   use: 'Sekundær blå, ikoner, badges' },
  { name: 'Sail White',   hex: '#FFFFFF', var: '--ls-white',     use: 'Sideflader, kortbaggrunde' },
  { name: 'Off White',    hex: '#F4F6F9', var: '--ls-offwhite',  use: 'Side-baggrund, alternerende rækker' },
  { name: 'Rope Gold',    hex: '#C9A84C', var: '--ls-gold',      use: 'Call-to-action, kampagnepris, highlights' },
  { name: 'Teak',         hex: '#8B6040', var: '--ls-teak',      use: 'Varmt accent, "Wooden deck" touch' },
  { name: 'Fog',          hex: '#8D99A8', var: '--ls-fog',       use: 'Sekundær tekst, placeholders' },
  { name: 'Mist',         hex: '#C8D2DC', var: '--ls-mist',      use: 'Borders, dividers, input-rammer' },
  { name: 'Storm',        hex: '#2C3E50', var: '--ls-storm',     use: 'Tekst på lys baggrund (body copy)' },
  { name: 'Alert Red',    hex: '#C0392B', var: '--ls-alert',     use: 'Fejl, lav-lager advarsel' },
  { name: 'Kelp Green',   hex: '#1A7A4A', var: '--ls-green',     use: 'Succes, på lager, aktiv status' },
]

const CSS_VARS = PALETTE.map(c => `  ${c.var}: ${c.hex};`).join('\n')

const TAILWIND_EXTEND = `// tailwind.config.ts → theme.extend.colors
lovesaling: {
  navy:     '#0F2B4E',
  ocean:    '#1B5E8C',
  horizon:  '#3A7EAA',
  white:    '#FFFFFF',
  offwhite: '#F4F6F9',
  gold:     '#C9A84C',
  teak:     '#8B6040',
  fog:      '#8D99A8',
  mist:     '#C8D2DC',
  storm:    '#2C3E50',
  alert:    '#C0392B',
  green:    '#1A7A4A',
}`

const TYPOGRAPHY = [
  { role: 'Display heading', family: 'Playfair Display', fallback: 'Georgia, serif', weight: '700', note: 'Logo/hero, large section titles' },
  { role: 'Body / UI',       family: 'Inter',            fallback: 'system-ui, sans-serif', weight: '400 / 500 / 600', note: 'All body text, navigation, labels' },
  { role: 'Mono / SKU',      family: 'JetBrains Mono',  fallback: 'monospace', weight: '400', note: 'Product SKUs, EAN numbers, technical specs' },
]

export default function LovesalingBrandPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {/* LS monogram placeholder */}
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-white select-none"
          style={{ background: 'linear-gradient(135deg, #0F2B4E 0%, #1B5E8C 100%)' }}
        >
          <span style={{ fontFamily: 'Georgia, serif', letterSpacing: '-0.05em' }}>LS</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lovesaling — Brand Guide</h1>
          <p className="text-sm text-gray-500">Farver, typografi og design-tokens til lovesaling.dk</p>
        </div>
      </div>

      {/* Color palette */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Farvepalette</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {PALETTE.map(c => (
            <div key={c.var} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <div className="h-20" style={{ backgroundColor: c.hex }} />
              <div className="p-3 bg-white">
                <div className="font-semibold text-sm text-gray-900">{c.name}</div>
                <div className="text-xs font-mono text-gray-500 mt-0.5">{c.hex}</div>
                <div className="text-xs font-mono text-blue-500 mt-0.5">{c.var}</div>
                <div className="text-xs text-gray-400 mt-1 leading-tight">{c.use}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Typografi</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Rolle</th>
                <th className="px-4 py-2 text-left">Familie</th>
                <th className="px-4 py-2 text-left">Vægt</th>
                <th className="px-4 py-2 text-left">Brug</th>
              </tr>
            </thead>
            <tbody>
              {TYPOGRAPHY.map(t => (
                <tr key={t.role} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.role}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{t.family}</span>
                    <span className="text-gray-400 text-xs ml-1">/ {t.fallback}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.weight}</td>
                  <td className="px-4 py-3 text-gray-500">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* UI preview */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">UI-preview</h2>
        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          {/* Nav bar mock */}
          <nav className="px-6 py-3 flex items-center justify-between" style={{ backgroundColor: '#0F2B4E' }}>
            <div className="text-white font-bold text-lg" style={{ fontFamily: 'Georgia, serif', letterSpacing: '-0.03em' }}>
              LS
            </div>
            <div className="flex gap-6 text-sm" style={{ color: '#C8D2DC' }}>
              {['Sejlbåde', 'Motorbåde', 'Udstyr', 'Tilbud'].map(l => (
                <span key={l} className="cursor-pointer hover:text-white transition-colors">{l}</span>
              ))}
            </div>
            <button className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#C9A84C' }}>
              Butik
            </button>
          </nav>

          {/* Hero mock */}
          <div className="px-8 py-10" style={{ background: 'linear-gradient(135deg, #0F2B4E 0%, #1B5E8C 70%, #3A7EAA 100%)' }}>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#C9A84C' }}>Nautisk udstyr</p>
            <h1 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'Georgia, serif' }}>
              Udrustning til<br/>sejl- og motorbåde
            </h1>
            <p className="text-sm mb-5" style={{ color: '#C8D2DC' }}>
              Kvalitetsprodukter fra de bedste brands — leveret hurtigt.
            </p>
            <div className="flex gap-3">
              <button className="px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#C9A84C' }}>
                Se produkter
              </button>
              <button className="px-5 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: '#C8D2DC', color: '#C8D2DC' }}>
                Boat navigator
              </button>
            </div>
          </div>

          {/* Product cards mock */}
          <div className="p-6" style={{ backgroundColor: '#F4F6F9' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: '#2C3E50' }}>Populære produkter</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'LIROS Polyester Braid 10mm', price: '249', sale: '199', stock: true },
                { name: 'Plastimo Fortstyrret Kompass', price: '895', sale: null, stock: true },
                { name: 'Harken Blok 40mm enkelt', price: '349', sale: null, stock: false },
              ].map(p => (
                <div key={p.name} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="w-full h-24 rounded-lg mb-3 flex items-center justify-center text-2xl" style={{ backgroundColor: '#F4F6F9' }}>
                    ⚓
                  </div>
                  <div className="text-xs font-semibold mb-1" style={{ color: '#2C3E50' }}>{p.name}</div>
                  <div className="flex items-center gap-2 mt-2">
                    {p.sale
                      ? <><span className="text-sm font-bold" style={{ color: '#C9A84C' }}>{p.sale} kr</span>
                          <span className="text-xs line-through" style={{ color: '#8D99A8' }}>{p.price} kr</span></>
                      : <span className="text-sm font-bold" style={{ color: '#2C3E50' }}>{p.price} kr</span>
                    }
                  </div>
                  {!p.stock && (
                    <div className="text-xs mt-1" style={{ color: '#C0392B' }}>Ikke på lager</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CSS tokens */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">CSS custom properties</h2>
        <pre className="bg-gray-900 text-green-400 text-xs rounded-xl p-5 overflow-x-auto leading-relaxed">
          {`:root {\n${CSS_VARS}\n}`}
        </pre>
      </section>

      {/* Tailwind config */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Tailwind config</h2>
        <pre className="bg-gray-900 text-blue-300 text-xs rounded-xl p-5 overflow-x-auto leading-relaxed">
          {TAILWIND_EXTEND}
        </pre>
      </section>

      {/* Notes */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Design-principper</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2"><span>⚓</span> <span><strong>Minimal & maritim</strong> — hvide flader, navy accenter, lav visuelt støj</span></li>
          <li className="flex gap-2"><span>🪢</span> <span><strong>Rope Gold</strong> (#C9A84C) bruges KUN til CTA-knapper og priser — aldrig som baggrund</span></li>
          <li className="flex gap-2"><span>🗂️</span> <span><strong>Typography</strong> — Playfair Display til headings giver det nautiske "premium" udtryk; Inter til alt UI</span></li>
          <li className="flex gap-2"><span>📐</span> <span><strong>Radii</strong> — 8px (sm), 12px (md), 16px (xl) — bløde men ikke runde</span></li>
          <li className="flex gap-2"><span>🔤</span> <span><strong>Logo</strong> — L+S monogram i Playfair Display (kommer senere). Bruger navy→ocean gradient som placeholder</span></li>
          <li className="flex gap-2"><span>🖼️</span> <span><strong>Billeder</strong> — produkt på hvid/off-white baggrund, ingen skygger — "clean catalog" look</span></li>
        </ul>
      </section>
    </div>
  )
}
