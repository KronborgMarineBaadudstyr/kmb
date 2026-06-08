'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BoatNavigator — Public-facing component for lovesaling.dk
//
// Usage:
//   import { BoatNavigator } from '@/components/BoatNavigator'
//
//   // Server-side fetch (recommended):
//   const hotspots = await fetch('/api/navigation?boat_type=sailboat').then(r => r.json()).then(j => j.data)
//   return <BoatNavigator boatType="sailboat" hotspots={hotspots} baseCategoryUrl="/kategori" />
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'

export type BoatHotspot = {
  id:            string
  boat_type:     'sailboat' | 'motorboat'
  label:         string
  category_slug: string
  description:   string | null
  x_pct:         number
  y_pct:         number
  label_side:    'left' | 'right' | 'top' | 'bottom'
  color:         string
  sort_order:    number
  is_active:     boolean
}

// ─── SVG boat drawings ────────────────────────────────────────────────────────

function SailboatSVG() {
  return (
    <g>
      {/* Water line / shadow */}
      <ellipse cx="248" cy="298" rx="195" ry="8" fill="rgba(14,116,144,0.08)" />

      {/* Hull */}
      <path d="M 58 238 Q 155 256 248 258 Q 341 256 438 238 L 425 272 Q 340 288 248 290 Q 156 288 71 272 Z"
        fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
      {/* Hull sheen */}
      <path d="M 68 245 Q 248 263 428 245" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />

      {/* Keel */}
      <path d="M 238 272 L 230 312 L 266 312 L 258 272 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Deck cabin */}
      <path d="M 175 238 L 175 220 Q 220 212 248 212 Q 276 212 322 220 L 322 238 Z"
        fill="#dde6f0" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Mast */}
      <line x1="248" y1="42" x2="248" y2="240" stroke="#64748b" strokeWidth="3.5" strokeLinecap="round" />

      {/* Forestay */}
      <line x1="248" y1="48" x2="118" y2="238" stroke="#94a3b8" strokeWidth="1" />
      {/* Backstay */}
      <line x1="248" y1="48" x2="388" y2="238" stroke="#94a3b8" strokeWidth="1" />

      {/* Boom */}
      <line x1="248" y1="205" x2="375" y2="228" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />

      {/* Main sail */}
      <path d="M 248 50 L 248 210 L 372 226 Z"
        fill="rgba(219,234,254,0.85)" stroke="#93c5fd" strokeWidth="1.5" />
      {/* Main sail batten hints */}
      <line x1="248" y1="110" x2="330" y2="148" stroke="rgba(147,197,253,0.5)" strokeWidth="1" />
      <line x1="248" y1="155" x2="355" y2="185" stroke="rgba(147,197,253,0.5)" strokeWidth="1" />

      {/* Jib / Foresail */}
      <path d="M 248 78 L 248 238 L 125 233 Z"
        fill="rgba(219,234,254,0.7)" stroke="#93c5fd" strokeWidth="1.5" />

      {/* Spreaders */}
      <line x1="248" y1="128" x2="215" y2="145" stroke="#94a3b8" strokeWidth="1.5" />
      <line x1="248" y1="128" x2="281" y2="145" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Cockpit coaming */}
      <path d="M 210 238 Q 248 242 286 238 L 282 253 Q 248 256 214 253 Z"
        fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
    </g>
  )
}

function MotorboatSVG() {
  return (
    <g>
      {/* Water shadow */}
      <ellipse cx="248" cy="298" rx="210" ry="8" fill="rgba(14,116,144,0.08)" />

      {/* Hull bottom */}
      <path d="M 38 225 Q 155 248 248 250 Q 341 248 458 222 L 445 260 Q 340 278 248 280 Q 156 278 52 262 Z"
        fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
      {/* Hull sheen */}
      <path d="M 46 232 Q 248 255 450 229" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />

      {/* Bow flare */}
      <path d="M 38 225 Q 55 205 80 200 L 95 225 Z" fill="#dde6f0" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Deck */}
      <path d="M 88 200 Q 248 210 445 218 L 445 225 Q 248 230 80 222 Z"
        fill="#dde6f0" stroke="#94a3b8" strokeWidth="1" />

      {/* Superstructure / cabin */}
      <path d="M 110 165 L 110 202 L 365 210 L 365 168 L 325 140 L 155 138 Z"
        fill="#e8f0f8" stroke="#94a3b8" strokeWidth="2" />

      {/* Windscreen */}
      <path d="M 155 138 L 325 140 L 365 168 L 110 165 Z"
        fill="rgba(186,230,253,0.55)" stroke="#7dd3fc" strokeWidth="1.5" />

      {/* Side windows */}
      <rect x="122" y="168" width="52" height="32" rx="5" fill="rgba(186,230,253,0.65)" stroke="#7dd3fc" strokeWidth="1.5" />
      <rect x="188" y="165" width="58" height="35" rx="5" fill="rgba(186,230,253,0.65)" stroke="#7dd3fc" strokeWidth="1.5" />
      <rect x="262" y="165" width="52" height="33" rx="5" fill="rgba(186,230,253,0.65)" stroke="#7dd3fc" strokeWidth="1.5" />

      {/* Radar arch */}
      <path d="M 330 205 Q 360 170 390 205" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
      <line x1="330" y1="205" x2="330" y2="215" stroke="#94a3b8" strokeWidth="2" />
      <line x1="390" y1="205" x2="390" y2="220" stroke="#94a3b8" strokeWidth="2" />

      {/* Radar dome */}
      <ellipse cx="360" cy="168" rx="16" ry="10" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Engine / stern drive */}
      <rect x="420" y="234" width="32" height="22" rx="4" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="430" y="255" width="12" height="18" rx="2" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />

      {/* Bow cleats */}
      <rect x="90" y="200" width="10" height="5" rx="1" fill="#94a3b8" />
      <rect x="72" y="215" width="10" height="5" rx="1" fill="#94a3b8" />

      {/* Stern cleats */}
      <rect x="400" y="218" width="10" height="5" rx="1" fill="#94a3b8" />
    </g>
  )
}

// ─── Arrow connector ──────────────────────────────────────────────────────────
// Draws a line from hotspot center to label card edge, with a small arrowhead

function Connector({
  hx, hy,       // hotspot center (SVG coords, 0–496)
  lx, ly,       // label card anchor (SVG coords)
  color,
  active,
}: {
  hx: number; hy: number; lx: number; ly: number
  color: string; active: boolean
}) {
  const id = `arr-${Math.round(hx)}-${Math.round(hy)}`
  const opacity = active ? 1 : 0.4

  return (
    <g opacity={opacity} style={{ transition: 'opacity 0.2s' }}>
      <defs>
        <marker id={id} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={hx} y1={hy} x2={lx} y2={ly}
        stroke={color}
        strokeWidth={active ? 1.8 : 1.2}
        strokeDasharray="5 3"
        markerEnd={`url(#${id})`}
        style={{ transition: 'stroke-width 0.2s' }}
      />
    </g>
  )
}

// ─── Label card ───────────────────────────────────────────────────────────────
function LabelCard({
  hotspot, active, baseCategoryUrl, onHover,
}: {
  hotspot: BoatHotspot
  active: boolean
  baseCategoryUrl: string
  onHover: (id: string | null) => void
}) {
  const href = `${baseCategoryUrl}/${hotspot.category_slug}`

  return (
    <a
      href={href}
      onMouseEnter={() => onHover(hotspot.id)}
      onMouseLeave={() => onHover(null)}
      className={`
        group absolute flex flex-col pointer-events-auto select-none
        rounded-xl border px-3 py-2 text-left
        shadow-sm hover:shadow-md
        transition-all duration-200
        ${active
          ? 'bg-white border-blue-300 shadow-md scale-[1.03] z-20'
          : 'bg-white/90 border-slate-200 hover:border-blue-300 z-10'
        }
      `}
      style={{
        transform: active ? 'scale(1.04)' : undefined,
        borderColor: active ? hotspot.color : undefined,
        minWidth: '130px',
        maxWidth: '175px',
      }}
    >
      <span
        className="text-xs font-bold leading-tight"
        style={{ color: active ? hotspot.color : '#1e293b' }}
      >
        {hotspot.label}
      </span>
      {hotspot.description && (
        <span className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
          {hotspot.description}
        </span>
      )}
      <span
        className="text-[10px] font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: hotspot.color }}
      >
        Se produkter →
      </span>
    </a>
  )
}

// ─── Layout engine ─────────────────────────────────────────────────────────────
// Converts hotspot x_pct/y_pct + label_side to SVG and DOM coordinates.
// SVG viewport: 496 × 320.  Container is 100% wide with 16:10 aspect ratio.

const SVG_W = 496
const SVG_H = 320

// Offset label card anchor relative to hotspot based on label_side
function getLabelAnchor(x: number, y: number, side: string): { lx: number; ly: number; css: React.CSSProperties } {
  const GAP   = 22   // px gap from hotspot to line end
  const LPAD  = 14   // extra padding from line end to card edge
  const C_W   = 175  // max card width for right-side offset calculation

  switch (side) {
    case 'left':
      return {
        lx:  x - GAP,
        ly:  y,
        css: { right: `${(SVG_W - x + LPAD) / SVG_W * 100}%`, top: `${y / SVG_H * 100}%`, transform: 'translateY(-50%)' },
      }
    case 'right':
      return {
        lx:  x + GAP,
        ly:  y,
        css: { left: `${(x + LPAD) / SVG_W * 100}%`, top: `${y / SVG_H * 100}%`, transform: 'translateY(-50%)' },
      }
    case 'top':
      return {
        lx:  x,
        ly:  y - GAP,
        css: { left: `${x / SVG_W * 100}%`, bottom: `${(SVG_H - y + LPAD) / SVG_H * 100}%`, transform: 'translateX(-50%)' },
      }
    case 'bottom':
      return {
        lx:  x,
        ly:  y + GAP,
        css: { left: `${x / SVG_W * 100}%`, top: `${(y + LPAD) / SVG_H * 100}%`, transform: 'translateX(-50%)' },
      }
    default:
      return { lx: x + GAP, ly: y, css: { left: `${(x + LPAD) / SVG_W * 100}%`, top: `${y / SVG_H * 100}%`, transform: 'translateY(-50%)' } }
  }
  void C_W
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BoatNavigator({
  boatType,
  hotspots,
  baseCategoryUrl = '/kategori',
  showTitle = true,
}: {
  boatType:        'sailboat' | 'motorboat'
  hotspots:        BoatHotspot[]
  baseCategoryUrl?: string
  showTitle?:       boolean
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const title = boatType === 'sailboat' ? 'Sejlbåd' : 'Motorbåd'
  const subtitle = boatType === 'sailboat'
    ? 'Klik på en kategori for at finde udstyr til din sejlbåd'
    : 'Klik på en kategori for at finde udstyr til din motorbåd'

  return (
    <div className="w-full font-sans select-none">
      {showTitle && (
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
      )}

      {/* Aspect-ratio container — SVG 496:320 ≈ 31:20 */}
      <div className="relative w-full" style={{ paddingBottom: `${SVG_H / SVG_W * 100}%` }}>
        <div className="absolute inset-0">

          {/* SVG boat drawing */}
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="absolute inset-0 w-full h-full"
            style={{ overflow: 'visible' }}
          >
            {/* Background gradient */}
            <defs>
              <radialGradient id="bg-grad" cx="50%" cy="60%" r="55%">
                <stop offset="0%"   stopColor="#f0f9ff" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </radialGradient>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#bg-grad)" rx="16" />

            {/* Boat drawing */}
            {boatType === 'sailboat'  ? <SailboatSVG  /> : <MotorboatSVG />}

            {/* Connectors (drawn below hotspot dots) */}
            {hotspots.map(h => {
              const hx  = h.x_pct / 100 * SVG_W
              const hy  = h.y_pct / 100 * SVG_H
              const { lx, ly } = getLabelAnchor(hx, hy, h.label_side)
              return (
                <Connector
                  key={h.id}
                  hx={hx} hy={hy}
                  lx={lx} ly={ly}
                  color={h.color}
                  active={activeId === h.id}
                />
              )
            })}

            {/* Hotspot dots */}
            {hotspots.map(h => {
              const cx  = h.x_pct / 100 * SVG_W
              const cy  = h.y_pct / 100 * SVG_H
              const isActive = activeId === h.id
              return (
                <g key={h.id}
                  onMouseEnter={() => setActiveId(h.id)}
                  onMouseLeave={() => setActiveId(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Pulse ring */}
                  <circle cx={cx} cy={cy} r={isActive ? 14 : 10}
                    fill={h.color} opacity={isActive ? 0.18 : 0.12}
                    style={{ transition: 'r 0.2s, opacity 0.2s' }}
                  />
                  {/* Outer ring */}
                  <circle cx={cx} cy={cy} r={isActive ? 8 : 6}
                    fill="white" stroke={h.color} strokeWidth={isActive ? 2.5 : 2}
                    style={{ transition: 'r 0.2s' }}
                  />
                  {/* Inner dot */}
                  <circle cx={cx} cy={cy} r={isActive ? 4 : 3}
                    fill={h.color}
                    style={{ transition: 'r 0.2s' }}
                  />
                </g>
              )
            })}
          </svg>

          {/* Label cards (positioned absolutely over the SVG) */}
          {hotspots.map(h => {
            const hx = h.x_pct / 100 * SVG_W
            const hy = h.y_pct / 100 * SVG_H
            const { css } = getLabelAnchor(hx, hy, h.label_side)
            return (
              <div key={h.id} className="absolute pointer-events-none" style={css}>
                <LabelCard
                  hotspot={h}
                  active={activeId === h.id}
                  baseCategoryUrl={baseCategoryUrl}
                  onHover={setActiveId}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Dual-boat page section (both boats side by side or stacked) ──────────────
export function BoatNavigatorSection({
  sailboatHotspots,
  motorboatHotspots,
  baseCategoryUrl = '/kategori',
}: {
  sailboatHotspots:  BoatHotspot[]
  motorboatHotspots: BoatHotspot[]
  baseCategoryUrl?:  string
}) {
  const [activeBoat, setActiveBoat] = useState<'sailboat' | 'motorboat'>('sailboat')
  const hotspots = activeBoat === 'sailboat' ? sailboatHotspots : motorboatHotspots

  return (
    <section className="w-full max-w-5xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
          Find udstyr til din båd
        </h2>
        <p className="text-slate-500 mt-2 text-sm max-w-md mx-auto">
          Vælg din bådtype og klik på den del af båden du vil finde udstyr til
        </p>

        {/* Boat type toggle */}
        <div className="inline-flex mt-5 bg-slate-100 rounded-full p-1 gap-1">
          {(['sailboat', 'motorboat'] as const).map(type => (
            <button
              key={type}
              onClick={() => setActiveBoat(type)}
              className={`
                px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200
                ${activeBoat === type
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                }
              `}
            >
              {type === 'sailboat' ? '⛵ Sejlbåd' : '🚤 Motorbåd'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <BoatNavigator
          boatType={activeBoat}
          hotspots={hotspots}
          baseCategoryUrl={baseCategoryUrl}
          showTitle={false}
        />
      </div>

      {/* Category list below (mobile fallback) */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:hidden">
        {hotspots.map(h => (
          <a
            key={h.id}
            href={`${baseCategoryUrl}/${h.category_slug}`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-blue-300 transition-colors text-sm font-medium text-slate-700 hover:text-blue-700"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.color }} />
            {h.label}
          </a>
        ))}
      </div>
    </section>
  )
}
