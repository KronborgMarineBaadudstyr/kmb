import { createServiceClient } from '@/lib/supabase/server'

// Salgsanalyse til AI-assistenten og indsigts-dashboardet.
// Salgspriser er inkl. 25 % moms; indkøbspriser er ekskl. moms.

export const VAT = 1.25
const DEFAULT_ELASTICITY = -1.2   // antagelse når data ikke rækker (typisk for udstyr/tilbehør)

type Rpc = <T>(fn: string, args?: Record<string, unknown>) => Promise<T[]>

function rpcClient(): Rpc {
  const supabase = createServiceClient()
  return async <T>(fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw new Error(`${fn}: ${error.message}`)
    return (data ?? []) as T[]
  }
}

const num = (v: unknown) => (v == null ? null : Number(v))
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

// ── Opslag ───────────────────────────────────────────────────────────────────────

export async function coverage() {
  const [row] = await rpcClient()<Record<string, unknown>>('analytics_coverage')
  return row ?? null
}

export async function categories() {
  return rpcClient()('analytics_categories')
}

export async function searchProducts(query: string, limit = 10) {
  const q = query.replace(/[,()*%\\]/g, ' ').trim()
  if (!q) return []
  const { data, error } = await createServiceClient().from('products')
    .select('id, name, internal_sku, ean, brand, categories, sales_price, sale_price, own_stock_quantity, status')
    .or(`name.ilike.%${q}%,internal_sku.ilike.%${q}%,ean.eq.${q},brand.ilike.%${q}%`)
    .is('variant_of_product_id', null)
    .not('status', 'in', '(archived,rejected)')
    .limit(Math.min(limit, 25))
  if (error) throw new Error(error.message)
  return data ?? []
}

export const topProducts = (from: string, to: string, category?: string | null, limit = 15) =>
  rpcClient()('analytics_top_products', { p_from: from, p_to: to, p_category: category ?? null, p_limit: limit })

export const monthly = (productId?: string | null, category?: string | null, months = 24) =>
  rpcClient()('analytics_monthly', { p_product: productId ?? null, p_category: category ?? null, p_months: months })

export const seasonality = (productId?: string | null, category?: string | null) =>
  rpcClient()('analytics_seasonality', { p_product: productId ?? null, p_category: category ?? null })

export const seasonalPeaks = (month: number, limit = 10, minQty = 10) =>
  rpcClient()('analytics_seasonal_peaks', { p_month: month, p_limit: limit, p_min_qty: minQty })

export const boughtTogether = (productId?: string | null, limit = 15, minOrders = 2) =>
  rpcClient()('analytics_bought_together', { p_product: productId ?? null, p_limit: limit, p_min_orders: minOrders })

export const categoryAffinity = (category?: string | null, limit = 15) =>
  rpcClient()('analytics_category_affinity', { p_category: category ?? null, p_limit: limit })

export const campaigns = (limit = 20) => rpcClient()('analytics_campaigns', { p_limit: limit })

// ── Prisfølsomhed ────────────────────────────────────────────────────────────────

type PriceMonth = { month: string; qty: number; avg_unit_price: number | null }

// Log-log-regression af solgt antal mod realiseret pris pr. måned.
// Kun "pålidelig" ved mindst 4 måneder og mindst 5 % prisvariation — sæson er ikke renset ud.
export function estimateElasticity(rows: PriceMonth[]) {
  const pts = rows
    .map(r => ({ p: Number(r.avg_unit_price), q: Number(r.qty) }))
    .filter(x => x.p > 0 && x.q > 0)
    .map(x => ({ x: Math.log(x.p), y: Math.log(x.q) }))
  if (pts.length < 2) return { elasticity: null, points: pts.length, r2: null, reliable: false, reason: 'for få måneder med salg' }
  const prices = rows.map(r => Number(r.avg_unit_price)).filter(p => p > 0)
  const spread = Math.max(...prices) / Math.min(...prices) - 1
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  // Afrundingsfejl i log() må ikke ligne prisvariation
  if (spread < 0.005 || sxx < 1e-12) return { elasticity: null, points: pts.length, r2: null, reliable: false, reason: 'prisen har ikke varieret' }
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0)
  const slope = sxy / sxx
  const syy = pts.reduce((s, p) => s + (p.y - my) ** 2, 0)
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy)
  const reliable = pts.length >= 4 && spread >= 0.05 && slope < 0
  return {
    elasticity: round(slope, 2), points: pts.length, r2: round(r2, 2), reliable,
    reason: reliable ? null
      : pts.length < 4 ? 'under 4 måneder med salg'
      : spread < 0.05 ? 'prisen har varieret under 5 %'
      : 'salget steg med prisen (sandsynligvis sæson eller kampagne, ikke pris)',
  }
}

export async function priceHistory(productId: string) {
  const rpc = rpcClient()
  const [changes, months] = await Promise.all([
    rpc('analytics_price_changes', { p_product: productId, p_days: 60 }),
    rpc<PriceMonth>('analytics_price_monthly', { p_product: productId }),
  ])
  return { price_changes: changes, monthly_realized_price: months, elasticity_estimate: estimateElasticity(months) }
}

// ── Produktøkonomi ───────────────────────────────────────────────────────────────

type PS = { product_id: string; priority: number; is_active: boolean; item_status: string; purchase_price: number | null; suppliers: { name: string } | null }

export async function productEconomics(productId: string) {
  const supabase = createServiceClient()
  const { data: p, error } = await supabase.from('products')
    .select('id, name, ean, categories, brand, sales_price, sale_price, own_stock_quantity, own_stock_reserved, expected_lifespan_months')
    .eq('id', productId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!p) return null

  // Leverandører på produktet og på varianter der er lagt ind under det
  const { data: members } = await supabase.from('products').select('id').eq('variant_of_product_id', productId)
  const ids = [productId, ...(members ?? []).map(m => m.id)]
  const { data: ps } = await supabase.from('product_suppliers')
    .select('product_id, priority, is_active, item_status, purchase_price, suppliers ( name )')
    .in('product_id', ids)
  const rows = ((ps ?? []) as unknown as PS[]).filter(r => r.is_active && r.item_status !== 'discontinued' && r.purchase_price != null)
  const chosen = rows.find(r => r.priority === 1) ?? [...rows].sort((a, b) => Number(a.purchase_price) - Number(b.purchase_price))[0]

  const price = num(p.sale_price) ?? num(p.sales_price)
  const purchase = chosen ? Number(chosen.purchase_price) : null
  const net = price != null ? price / VAT : null
  const qtyDist = await rpcClient()('analytics_order_qty', { p_product: productId, p_months: 24 })
  return {
    product: p,
    current_price_incl_vat: price,
    purchase_price_excl_vat: purchase,
    supplier: chosen?.suppliers?.name ?? null,
    gross_margin_per_unit: net != null && purchase != null ? round(net - purchase) : null,
    margin_pct: net != null && purchase != null && net > 0 ? round((net - purchase) / net * 100, 1) : null,
    qty_per_order_last_24m: qtyDist,
  }
}

// ── Simuleringer ─────────────────────────────────────────────────────────────────

async function baseline(productId: string) {
  const rows = await monthly(productId, null, 12) as { month: string; qty: number; revenue: number; orders: number }[]
  const firstMonth = rows.length ? new Date(rows[0].month) : null
  const now = new Date()
  const monthsCovered = firstMonth
    ? Math.min(12, (now.getFullYear() - firstMonth.getFullYear()) * 12 + now.getMonth() - firstMonth.getMonth() + 1)
    : 12
  const sum = (k: 'qty' | 'revenue' | 'orders') => rows.reduce((s, r) => s + Number(r[k]), 0)
  return {
    months: monthsCovered,
    units_per_month: sum('qty') / monthsCovered,
    orders_per_month: sum('orders') / monthsCovered,
    revenue_per_month: sum('revenue') / monthsCovered,
  }
}

async function elasticityFor(productId: string, override?: number | null) {
  if (override != null) return { value: override, source: 'angivet i spørgsmålet' }
  const { elasticity_estimate: e } = await priceHistory(productId)
  return e.reliable && e.elasticity != null
    ? { value: e.elasticity, source: `estimeret fra ${e.points} måneders salg (r² ${e.r2})` }
    : { value: DEFAULT_ELASTICITY, source: `antagelse ${DEFAULT_ELASTICITY} — data rækker ikke (${e.reason})` }
}

function econ(units: number, revenue: number, purchase: number | null) {
  return {
    units_per_month: round(units, 1),
    revenue_per_month_incl_vat: round(revenue),
    gross_margin_per_month: purchase != null ? round(revenue / VAT - units * purchase) : null,
  }
}

export async function simulatePriceChange(productId: string, newPrice: number, elasticity?: number | null) {
  const eco = await productEconomics(productId)
  if (!eco || eco.current_price_incl_vat == null) return { error: 'Produktet findes ikke eller har ingen pris' }
  const base = await baseline(productId)
  const e = await elasticityFor(productId, elasticity)
  const old = eco.current_price_incl_vat
  const units = base.units_per_month * (newPrice / old) ** e.value
  return {
    product: eco.product.name,
    data_months: base.months,
    current: { price: old, ...econ(base.units_per_month, base.units_per_month * old, eco.purchase_price_excl_vat) },
    scenario: { price: newPrice, ...econ(units, units * newPrice, eco.purchase_price_excl_vat) },
    assumptions: [
      `Udgangspunkt: gennemsnit af de seneste ${base.months} måneders salg`,
      `Prisfølsomhed (elasticitet): ${e.value} — ${e.source}`,
      eco.purchase_price_excl_vat != null ? `Indkøbspris ${eco.purchase_price_excl_vat} kr ekskl. moms (${eco.supplier})` : 'Ingen indkøbspris — dækningsbidrag kan ikke beregnes',
      'Salgspriser er inkl. 25 % moms; dækningsbidrag er ekskl. moms',
    ],
  }
}

// Ren beregning: kundernes antal pr. ordre (dist) skaleres til ordrer pr. måned.
// Pakke + stk.: q ≥ k køber pakker + rest som stk.; q < k opgraderer med andel t.
// Kun pakker: q ≥ k runder op til hele pakker; q < k køber en pakke med sandsynlighed (B / (q·P))^e.
export function bundleScenarios(o: { dist: { q: number; n: number }[]; ordersPerMonth: number; P: number; k: number; B: number; t: number; e: number }) {
  const { dist, P, k, B, t, e } = o
  const total = dist.reduce((s, d) => s + d.n, 0)
  const scale = total ? o.ordersPerMonth / total : 0
  const cur = { units: 0, revenue: 0 }, both = { units: 0, revenue: 0 }, only = { units: 0, revenue: 0 }
  for (const { q, n } of dist) {
    const m = n * scale
    cur.units += m * q; cur.revenue += m * q * P
    if (q >= k) {
      both.units += m * q; both.revenue += m * (Math.floor(q / k) * B + (q % k) * P)
      const packs = Math.ceil(q / k)
      only.units += m * packs * k; only.revenue += m * packs * B
    } else {
      both.units += m * ((1 - t) * q + t * k); both.revenue += m * ((1 - t) * q * P + t * B)
      const buy = Math.min(1, (B / (q * P)) ** e)
      only.units += m * buy * k; only.revenue += m * buy * B
    }
  }
  return { current: cur, packAndSingle: both, packOnly: only }
}

export async function simulateBundle(productId: string, bundleSize: number, bundlePrice: number,
                                     takeRate?: number | null, elasticity?: number | null) {
  const eco = await productEconomics(productId)
  if (!eco || eco.current_price_incl_vat == null) return { error: 'Produktet findes ikke eller har ingen pris' }
  const base = await baseline(productId)
  const e = await elasticityFor(productId, elasticity)
  const P = eco.current_price_incl_vat
  const k = bundleSize
  const B = bundlePrice
  const t = takeRate ?? 0.25
  const cost = eco.purchase_price_excl_vat

  const dist = (eco.qty_per_order_last_24m as { qty_per_order: number; orders: number }[])
    .map(d => ({ q: Number(d.qty_per_order), n: Number(d.orders) }))
  const totalOrders = dist.reduce((s, d) => s + d.n, 0)
  const r = bundleScenarios({ dist, ordersPerMonth: base.orders_per_month, P, k, B, t, e: e.value })

  return {
    product: eco.product.name,
    data_months: base.months,
    orders_per_month: round(base.orders_per_month, 1),
    pack: { size: k, price: B, price_per_unit: round(B / k), discount_vs_single_pct: round((1 - B / (k * P)) * 100, 1) },
    current: { unit_price: P, ...econ(r.current.units, r.current.revenue, cost) },
    pack_and_single: { description: 'Pakke tilbydes ved siden af stykpris', ...econ(r.packAndSingle.units, r.packAndSingle.revenue, cost) },
    pack_only: { description: 'Kun pakker (stykpris fjernes)', ...econ(r.packOnly.units, r.packOnly.revenue, cost) },
    assumptions: [
      `Udgangspunkt: ${round(base.orders_per_month, 1)} ordrer/md. (seneste ${base.months} mdr.) og kundernes faktiske antal pr. ordre (24 mdr.)`,
      `Pakke + stk.: kunder der køber ${k}+ stk. går over til pakker; ${Math.round(t * 100)} % af dem der køber færre opgraderer til en pakke (antagelse — kan ændres)`,
      `Kun pakker: kunder der køber færre end ${k} stk. køber en pakke med sandsynlighed (pakkepris/deres nuværende beløb)^elasticitet; elasticitet ${e.value} — ${e.source}`,
      totalOrders === 0 ? 'ADVARSEL: ingen salgshistorik for produktet — resultatet er 0' : `Fordeling bygger på ${totalOrders} ordrer`,
      cost != null ? `Indkøbspris ${cost} kr ekskl. moms (${eco.supplier})` : 'Ingen indkøbspris — dækningsbidrag kan ikke beregnes',
      'Salgspriser er inkl. 25 % moms; dækningsbidrag er ekskl. moms',
    ],
  }
}
