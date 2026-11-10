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

// Sorterer varerne efter varenummer, beholder kun første forekomst af hvert varenummer og springer dem over,
// som en tidligere del allerede har behandlet.
// Står samme varenummer flere gange i leverandørens fil (med forskellig pris), ville hver import ellers
// skifte prisen frem og tilbage — og logge to modsatrettede prisændringer hver nat.
export function remainingAfterCursor<T>(items: T[], skuOf: (t: T) => string, resume: ImportCursor | null): T[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const seen = new Set<string>()
  const unique = items.filter(t => { const k = skuOf(t); if (seen.has(k)) return false; seen.add(k); return true })
  if (unique.length < items.length) console.warn(`[import] ${items.length - unique.length} dubletter af varenumre i leverandørens fil sprunget over`)
  const sorted = unique.sort((a, b) => cmp(skuOf(a), skuOf(b)))
  return resume ? sorted.filter(t => cmp(skuOf(t), resume.after_sku) > 0) : sorted
}

export async function trackImport<P extends ProgressLike>(
  opts: {
    supplier: string; source: RunSource; kind: RunKind; test?: boolean
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
    deadline: opts.resumable && !opts.test ? Date.now() + CHUNK_BUDGET_MS : 0,
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
      ...(opts.test ? { test: true } : {}),
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
