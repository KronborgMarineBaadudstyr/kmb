import { createServiceClient } from '@/lib/supabase/server'

// Fælles registrering af import-kørsler — både manuelle (/api/import/*) og automatiske (/api/cron/*).
// Gemmer i suppliers.sync_state:
//   last_run_started_at   — når en kørsel (eller en del af en kørsel) starter. Er den nyere end sammendraget, blev den ikke færdig
//   last_import_summary   — resultatet af seneste kørsel (vises som "Seneste kørsel" på Leverandører)
//   <kind>_cursor         — hvor en opdelt kørsel er nået til (kun mens den er i gang)
// Den afsluttende "done"/"error"/"partial"-besked sendes først videre, når sammendraget er gemt,
// så browseren aldrig genindlæser før data er på plads.
//
// Opdelte kørsler (resumable): store importer (Palby, Columbus) kan ikke nå alle varer inden for Vercels
// grænse på 5 min. Importøren får en deadline; når den er nået, melder den 'partial' med en cursor
// (sidste behandlede varenummer + tællere), og næste del fortsætter derfra (resume).

export type RunSource = 'manual' | 'cron'
export type RunKind   = 'products' | 'stock'

type ProgressLike = {
  stage: string
  message?: string
  total?: number
  processed?: number
  matched?: number
  updated?: number
  staged?: number
  errors?: number
  skipped?: number
  cursor?: ImportCursor
}

export type ImportRunSummary = {
  stage:     'done' | 'error' | 'partial'
  message:   string
  total:     number
  processed?: number
  matched:   number
  updated:   number
  staged:    number
  errors:    number
  timestamp: string
  started_at?: string
  source?:   RunSource
  kind?:     RunKind
  test?:     boolean
  chunks?:   number          // antal dele kørslen er delt op i
}

// Hvor en opdelt kørsel er nået til. Varerne behandles sorteret efter varenummer, så næste del
// fortsætter med varenumre efter after_sku — også selvom filen er hentet på ny.
export type ImportCursor = {
  after_sku:  string
  processed:  number
  matched:    number
  updated:    number
  staged:     number
  skipped:    number
  errors:     number
  error_log:  string[]
  started_at: string         // sættes af trackImport
  chunk:      number         // antal færdige dele — sættes af trackImport
}

export type RunContext = {
  resume:   ImportCursor | null   // null = start forfra
  deadline: number                // ms-tidspunkt; 0 = ingen opdeling
}

export const NO_CHUNKING: RunContext = { resume: null, deadline: 0 }

// Tid pr. del: Vercel stopper efter 300 sek. Resten går til afslutning (gem, review-tjek).
const CHUNK_BUDGET_MS = 200_000
const MAX_CHUNKS      = 30

export async function mergeSyncState(supplierId: string, patch: Record<string, unknown>): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('suppliers').select('sync_state').eq('id', supplierId).single()
  const { error } = await supabase.from('suppliers')
    .update({ sync_state: { ...((data?.sync_state ?? {}) as Record<string, unknown>), ...patch } })
    .eq('id', supplierId)
  if (error) console.error('[import-run] kunne ikke gemme sync_state:', error.message)
  return error?.message ?? null
}

// ── Dubletter: samme varenummer flere gange i leverandørens fil ─────────────
// Kun én af linjerne bruges — ellers ville prisen skifte frem og tilbage ved hver import og logge to
// modsatrettede prisændringer. Som standard bruges første forekomst; admin kan på Leverandører vælge
// en anden (sync_state.duplicate_choice = { varenr: nummer i rækkefølgen, 0 = første }).

export type DuplicateChoice = Record<string, number>
export type DuplicateSku = {
  sku:     string
  used:    number                                        // hvilken forekomst importen bruger
  entries: Record<string, string | number | null>[]      // felterne pr. forekomst, i filens rækkefølge
}
export type DuplicateReport = { checked_at: string; count: number; items: DuplicateSku[] }

function groupBySku<T>(items: T[], skuOf: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const t of items) { const k = skuOf(t); const g = m.get(k); if (g) g.push(t); else m.set(k, [t]) }
  return m
}

const usedIndex = (n: number, choice: number | undefined) =>
  choice !== undefined && Number.isInteger(choice) && choice >= 0 && choice < n ? choice : 0

// Varenumre der står flere gange — med de felter, der kan vise forskellen (navn, pris, EAN, enhed …)
export function findDuplicates<T>(
  items: T[], skuOf: (t: T) => string,
  describe: (t: T) => Record<string, string | number | null>,
  choice: DuplicateChoice = {},
): DuplicateReport {
  const dups = [...groupBySku(items, skuOf)].filter(([, g]) => g.length > 1)
  return {
    checked_at: new Date().toISOString(),
    count: dups.length,
    items: dups.slice(0, 300).map(([sku, g]) => ({ sku, used: usedIndex(g.length, choice[sku]), entries: g.map(describe) })),
  }
}

// Sorterer varerne efter varenummer, beholder én linje pr. varenummer (første, eller den admin har valgt)
// og springer dem over, som en tidligere del af kørslen allerede har behandlet.
export function remainingAfterCursor<T>(
  items: T[], skuOf: (t: T) => string, resume: ImportCursor | null, choice: DuplicateChoice = {},
): T[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const unique = [...groupBySku(items, skuOf)].map(([sku, g]) => g[usedIndex(g.length, choice[sku])])
  const sorted = unique.sort((a, b) => cmp(skuOf(a), skuOf(b)))
  return resume ? sorted.filter(t => cmp(skuOf(t), resume.after_sku) > 0) : sorted
}

// Fælles start for store importer: finder dubletter (gemmes i sync_state.duplicate_skus ved kørslens første del,
// så de kan ses på Leverandører), bruger admins valg pr. varenummer og returnerer de varer, der er tilbage.
export async function prepareImportItems<T>(
  supplierId: string, items: T[], skuOf: (t: T) => string,
  describe: (t: T) => Record<string, string | number | null>,
  opts: { resume: ImportCursor | null },
): Promise<{ products: T[]; total: number; duplicates: number }> {
  const { data } = await createServiceClient().from('suppliers').select('sync_state').eq('id', supplierId).single()
  const choice = (((data?.sync_state ?? {}) as Record<string, unknown>).duplicate_choice ?? {}) as DuplicateChoice
  const report = findDuplicates(items, skuOf, describe, choice)
  if (!opts.resume) await mergeSyncState(supplierId, { duplicate_skus: report })
  if (report.count > 0) console.warn(`[import] ${report.count} varenumre står flere gange i leverandørens fil — én linje pr. varenummer bruges`)
  const products = remainingAfterCursor(items, skuOf, opts.resume, choice)
  return { products, total: new Set(items.map(skuOf)).size, duplicates: report.count }
}

export async function trackImport<P extends ProgressLike>(
  opts: {
    supplier: string; source: RunSource; kind: RunKind
    resumable?: boolean     // importøren understøtter opdeling (RunContext)
    resume?: boolean        // fortsæt en opdelt kørsel i stedet for at starte forfra
  },
  run: (onProgress: (p: P) => void, ctx: RunContext) => Promise<void>,
  forward: (p: P) => void = () => {},
): Promise<void> {
  const { data: sup } = await createServiceClient().from('suppliers').select('id, sync_state').eq('name', opts.supplier).maybeSingle()
  const supplierId = sup?.id as string | undefined
  if (!supplierId) {
    console.error(`[import-run] leverandør "${opts.supplier}" ikke fundet — kørslen registreres ikke`)
    return run(forward, NO_CHUNKING)
  }

  const cursorKey = `${opts.kind}_cursor`
  const saved = ((sup?.sync_state ?? {}) as Record<string, unknown>)[cursorKey] as ImportCursor | null | undefined
  const resume = opts.resumable && opts.resume ? (saved ?? null) : null

  if (opts.resume && !resume) {
    // Intet at fortsætte (fx allerede færdig eller startet forfra) — rør ikke ved sammendraget
    forward({ stage: 'error', message: 'Der er ingen afbrudt kørsel at fortsætte', total: 0, processed: 0, matched: 0, updated: 0, staged: 0, skipped: 0, errors: 0 } as P)
    return
  }

  const now       = new Date().toISOString()
  const startedAt = resume?.started_at ?? now                 // hele kørslens start (varighed og review-tjek)
  const chunk     = (resume?.chunk ?? 0) + 1
  const ctx: RunContext = {
    resume,
    deadline: opts.resumable ? Date.now() + CHUNK_BUDGET_MS : 0,
  }
  await mergeSyncState(supplierId, { last_run_started_at: now, [cursorKey]: resume })

  let last: P | null = null
  let terminal: P | null = null
  const onProgress = (p: P) => {
    last = p
    if (p.stage === 'done' || p.stage === 'error' || p.stage === 'partial') terminal = p   // sendes først, når sammendraget er gemt
    else forward(p)
  }

  const save = (stage: ImportRunSummary['stage'], p: ProgressLike | null, extra: Record<string, unknown>, message?: string) => {
    const summary: ImportRunSummary = {
      stage,
      message:   message ?? p?.message ?? '',
      total:     p?.total     ?? 0,
      processed: p?.processed ?? 0,
      matched:   p?.matched   ?? 0,
      updated:   p?.updated   ?? 0,
      staged:    p?.staged    ?? 0,
      errors:    p?.errors    ?? (stage === 'error' ? 1 : 0),
      timestamp: new Date().toISOString(),
      started_at: startedAt,
      source: opts.source,
      kind:   opts.kind,
      ...(chunk > 1 || stage === 'partial' ? { chunks: chunk } : {}),
    }
    // Seneste kørsel uanset type + seneste pr. type (så en lagersync ikke skjuler produktimportens resultat)
    return mergeSyncState(supplierId, { last_import_summary: summary, [`last_${opts.kind}_summary`]: summary, ...extra })
  }

  try {
    if (chunk > MAX_CHUNKS) throw new Error(`Kørslen er stoppet efter ${MAX_CHUNKS} dele uden at blive færdig — næste kørsel starter forfra`)
    await run(onProgress, ctx)
  } catch (e) {
    await save('error', last, { [cursorKey]: null }, e instanceof Error ? e.message : String(e))
    throw e
  }

  const end = terminal as P | null
  if (end?.stage === 'partial' && end.cursor) {
    const cursor: ImportCursor = { ...end.cursor, error_log: end.cursor.error_log.slice(0, 500), started_at: startedAt, chunk }
    await save('partial', end, { [cursorKey]: cursor })
  } else {
    await save(end?.stage === 'error' ? 'error' : 'done', end ?? last, { [cursorKey]: null })
  }
  if (end) forward(end)
}
