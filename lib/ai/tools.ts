import type Anthropic from '@anthropic-ai/sdk'
import * as A from './analytics'

// Værktøjer AI-assistenten kan kalde. Alle er skrivebeskyttede opslag eller beregninger.

type Prop = { type: 'string' | 'number' | 'integer'; description: string; enum?: string[]; minimum?: number; maximum?: number }
type Def = { name: string; label: string; description: string; properties: Record<string, Prop>; required: string[] }

const uuid: Prop = { type: 'string', description: 'Produktets id (fra search_products)' }
const isoDate = (d: string): Prop => ({ type: 'string', description: `${d} (ÅÅÅÅ-MM-DD)` })

const DEFS: Def[] = [
  { name: 'data_coverage', label: 'Tjekker datagrundlaget', required: [], properties: {},
    description: 'Hvor meget salgsdata der findes: første/sidste ordre, antal ordrer, kunder, solgte produkter, registrerede prisændringer og ordrer pr. kilde. Kald denne først, når datagrundlaget er relevant for svaret.' },
  { name: 'list_categories', label: 'Henter kategorier', required: [], properties: {},
    description: 'Alle produktkategorier med antal produkter og solgte stk. Brug den til at finde det præcise kategorinavn.' },
  { name: 'search_products', label: 'Søger produkter', required: ['query'],
    properties: { query: { type: 'string', description: 'Navn, varenummer, EAN eller brand' } },
    description: 'Find produkter og deres id ud fra navn, varenummer, EAN eller brand. Returnerer id, navn, kategori, pris og lager.' },
  { name: 'top_products', label: 'Henter topsælgere', required: ['from', 'to'],
    properties: { from: isoDate('Fra dato'), to: isoDate('Til dato (ikke inklusive)'),
      category: { type: 'string', description: 'Valgfri kategori' },
      limit: { type: 'integer', description: 'Antal (standard 15)', minimum: 1, maximum: 50 } },
    description: 'Mest solgte produkter i en periode efter omsætning, med antal, ordrer og gennemsnitspris.' },
  { name: 'sales_by_month', label: 'Henter salg pr. måned', required: [],
    properties: { product_id: uuid, category: { type: 'string', description: 'Valgfri kategori' },
      months: { type: 'integer', description: 'Antal måneder tilbage (standard 24)', minimum: 1, maximum: 120 } },
    description: 'Salg pr. måned (stk., omsætning, ordrer, gennemsnitspris) for ét produkt, en kategori eller hele butikken.' },
  { name: 'seasonality', label: 'Analyserer sæsonmønster', required: [],
    properties: { product_id: uuid, category: { type: 'string', description: 'Valgfri kategori' } },
    description: 'Andel af årets salg pr. kalendermåned (alle år lagt sammen) for ét produkt, en kategori eller alt. 1/12 ≈ 0,083 er gennemsnittet.' },
  { name: 'seasonal_peaks', label: 'Finder sæsonvarer', required: ['month'],
    properties: { month: { type: 'integer', description: 'Kalendermåned 1-12', minimum: 1, maximum: 12 },
      limit: { type: 'integer', description: 'Antal (standard 10)', minimum: 1, maximum: 30 } },
    description: 'Produkter hvor en stor andel af årssalget ligger i den givne måned — kandidater til at forberede lager og kampagner.' },
  { name: 'bought_together', label: 'Finder varer der købes sammen', required: [],
    properties: { product_id: uuid, limit: { type: 'integer', description: 'Antal (standard 15)', minimum: 1, maximum: 50 },
      min_orders: { type: 'integer', description: 'Mindst antal fælles ordrer (standard 2)', minimum: 1, maximum: 1000 } },
    description: 'Produkter der købes i samme ordre. confidence = andel af ordrer med A der også har B; lift > 1 = oftere sammen end tilfældigt. Uden product_id: de stærkeste par i hele butikken.' },
  { name: 'category_affinity', label: 'Analyserer kundernes kategorier', required: [],
    properties: { category: { type: 'string', description: 'Valgfri kategori' },
      limit: { type: 'integer', description: 'Antal (standard 15)', minimum: 1, maximum: 50 } },
    description: 'Kategorier der købes af de samme kunder (kunder der køber A, køber også B). confidence og lift som ved bought_together.' },
  { name: 'price_history', label: 'Henter prishistorik', required: ['product_id'], properties: { product_id: uuid },
    description: 'Registrerede prisændringer med salg 60 dage før/efter, realiseret pris pr. måned og et estimat af prisfølsomheden (elasticitet) med angivelse af om det er pålideligt.' },
  { name: 'campaign_effects', label: 'Måler kampagner', required: [],
    properties: { limit: { type: 'integer', description: 'Antal (standard 20)', minimum: 1, maximum: 50 } },
    description: 'Kampagner med salg under kampagnen og i en lige så lang periode før.' },
  { name: 'product_economics', label: 'Henter produktøkonomi', required: ['product_id'], properties: { product_id: uuid },
    description: 'Aktuel pris, indkøbspris (foretrukken leverandør), dækningsbidrag pr. stk., avance, lager og hvor mange stk. kunderne køber pr. ordre.' },
  { name: 'simulate_price_change', label: 'Simulerer prisændring', required: ['product_id', 'new_price'],
    properties: { product_id: uuid, new_price: { type: 'number', description: 'Ny pris inkl. moms', minimum: 0.01 },
      elasticity: { type: 'number', description: 'Valgfri prisfølsomhed (negativ, fx -1.5). Udelades = estimat eller antagelse', maximum: 0 } },
    description: 'Forventet salg, omsætning og dækningsbidrag pr. måned ved en ny pris, ud fra historisk salg og prisfølsomhed. Returnerer antagelserne.' },
  { name: 'simulate_bundle', label: 'Simulerer pakkepris', required: ['product_id', 'bundle_size', 'bundle_price'],
    properties: { product_id: uuid,
      bundle_size: { type: 'integer', description: 'Antal stk. i pakken', minimum: 2, maximum: 100 },
      bundle_price: { type: 'number', description: 'Pakkepris inkl. moms', minimum: 0.01 },
      take_rate: { type: 'number', description: 'Andel af enkeltkøbere der opgraderer når begge tilbydes (standard 0.25)', minimum: 0, maximum: 1 },
      elasticity: { type: 'number', description: 'Valgfri prisfølsomhed (negativ)', maximum: 0 } },
    description: 'Sammenligner nuværende salg med (a) pakke ved siden af stykpris og (b) kun pakker: stk., omsætning og dækningsbidrag pr. måned, ud fra kundernes faktiske antal pr. ordre. Returnerer antagelserne.' },
]

export const TOOLS: Anthropic.Tool[] = DEFS.map(d => ({
  name: d.name,
  description: d.description,
  eager_input_streaming: true,
  input_schema: { type: 'object', properties: d.properties, required: d.required, additionalProperties: false },
}))

export const TOOL_LABELS: Record<string, string> = Object.fromEntries(DEFS.map(d => [d.name, d.label]))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

// Strøm-input valideres ikke af API'et, så tjek mod skemaet før kørsel
function validate(def: Def, input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input skal være et objekt'
  const obj = input as Record<string, unknown>
  for (const k of Object.keys(obj)) if (!(k in def.properties)) return `ukendt felt: ${k}`
  for (const r of def.required) if (obj[r] === undefined || obj[r] === null || obj[r] === '') return `mangler ${r}`
  for (const [k, p] of Object.entries(def.properties)) {
    const v = obj[k]
    if (v === undefined || v === null) continue
    if (p.type === 'string' && typeof v !== 'string') return `${k} skal være tekst`
    if (p.type !== 'string' && (typeof v !== 'number' || !Number.isFinite(v))) return `${k} skal være et tal`
    if (p.type === 'integer' && !Number.isInteger(v)) return `${k} skal være et heltal`
    if (typeof v === 'number' && p.minimum !== undefined && v < p.minimum) return `${k} skal være mindst ${p.minimum}`
    if (typeof v === 'number' && p.maximum !== undefined && v > p.maximum) return `${k} må højst være ${p.maximum}`
    if (k === 'product_id' && !UUID.test(String(v))) return 'product_id skal være et id fra search_products'
    if ((k === 'from' || k === 'to') && !DATE.test(String(v))) return `${k} skal være ÅÅÅÅ-MM-DD`
  }
  return null
}

export async function runTool(name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const def = DEFS.find(d => d.name === name)
  if (!def) return { content: `Ukendt værktøj: ${name}`, isError: true }
  const invalid = validate(def, input)
  if (invalid) return { content: `Ugyldigt input: ${invalid}`, isError: true }
  const i = input as Record<string, never>
  try {
    const result = await (async () => {
      switch (name) {
        case 'data_coverage':         return A.coverage()
        case 'list_categories':       return A.categories()
        case 'search_products':       return A.searchProducts(i.query)
        case 'top_products':          return A.topProducts(i.from, i.to, i.category, i.limit)
        case 'sales_by_month':        return A.monthly(i.product_id, i.category, i.months)
        case 'seasonality':           return A.seasonality(i.product_id, i.category)
        case 'seasonal_peaks':        return A.seasonalPeaks(i.month, i.limit)
        case 'bought_together':       return A.boughtTogether(i.product_id, i.limit, i.min_orders)
        case 'category_affinity':     return A.categoryAffinity(i.category, i.limit)
        case 'price_history':         return A.priceHistory(i.product_id)
        case 'campaign_effects':      return A.campaigns(i.limit)
        case 'product_economics':     return (await A.productEconomics(i.product_id)) ?? { error: 'Produktet findes ikke' }
        case 'simulate_price_change': return A.simulatePriceChange(i.product_id, i.new_price, i.elasticity)
        case 'simulate_bundle':       return A.simulateBundle(i.product_id, i.bundle_size, i.bundle_price, i.take_rate, i.elasticity)
      }
    })()
    return { content: JSON.stringify(result ?? null), isError: false }
  } catch (e) {
    return { content: `Fejl: ${e instanceof Error ? e.message : String(e)}`, isError: true }
  }
}
