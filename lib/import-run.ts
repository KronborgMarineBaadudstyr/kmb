import { createServiceClient } from '@/lib/supabase/server'

// Fælles registrering af import-kørsler — både manuelle (/api/import/*) og automatiske (/api/cron/*).
// Gemmer i suppliers.sync_state:
//   last_run_started_at   — når en kørsel starter (er den nyere end sammendraget, blev kørslen ikke færdig)
//   last_import_summary   — resultatet af seneste kørsel (vises som "Seneste kørsel" på Leverandører)
// Den afsluttende "done"/"error"-besked sendes først videre, når sammendraget er gemt,
// så browseren aldrig genindlæser før data er på plads.

export type RunSource = 'manual' | 'cron'
export type RunKind   = 'products' | 'stock'

type ProgressLike = {
  stage: string
  message?: string
  total?: number
  matched?: number
  updated?: number
  staged?: number
  errors?: number
  skipped?: number
}

export type ImportRunSummary = {
  stage:     'done' | 'error'
  message:   string
  total:     number
  matched:   number
  updated:   number
  staged:    number
  errors:    number
  timestamp: string
  started_at?: string
  source?:   RunSource
  kind?:     RunKind
  test?:     boolean
}

async function mergeSyncState(supplierId: string, patch: Record<string, unknown>) {
  const supabase = createServiceClient()
  const { data } = await supabase.from('suppliers').select('sync_state').eq('id', supplierId).single()
  const { error } = await supabase.from('suppliers')
    .update({ sync_state: { ...((data?.sync_state ?? {}) as Record<string, unknown>), ...patch } })
    .eq('id', supplierId)
  if (error) console.error('[import-run] kunne ikke gemme sync_state:', error.message)
}

export async function trackImport<P extends ProgressLike>(
  opts: { supplier: string; source: RunSource; kind: RunKind; test?: boolean },
  run: (onProgress: (p: P) => void) => Promise<void>,
  forward: (p: P) => void = () => {},
): Promise<void> {
  const { data: sup } = await createServiceClient().from('suppliers').select('id').eq('name', opts.supplier).maybeSingle()
  const supplierId = sup?.id as string | undefined
  if (!supplierId) {
    console.error(`[import-run] leverandør "${opts.supplier}" ikke fundet — kørslen registreres ikke`)
    return run(forward)
  }

  const startedAt = new Date().toISOString()
  await mergeSyncState(supplierId, { last_run_started_at: startedAt })

  let last: P | null = null
  let terminal: P | null = null
  const onProgress = (p: P) => {
    last = p
    if (p.stage === 'done' || p.stage === 'error') terminal = p   // sendes først, når sammendraget er gemt
    else forward(p)
  }

  const save = (stage: 'done' | 'error', p: ProgressLike | null, message?: string) => {
    const summary: ImportRunSummary = {
      stage,
      message:  message ?? p?.message ?? '',
      total:    p?.total   ?? 0,
      matched:  p?.matched ?? 0,
      updated:  p?.updated ?? 0,
      staged:   p?.staged  ?? 0,
      errors:   p?.errors  ?? (stage === 'error' ? 1 : 0),
      timestamp: new Date().toISOString(),
      started_at: startedAt,
      source: opts.source,
      kind:   opts.kind,
      ...(opts.test ? { test: true } : {}),
    }
    // Seneste kørsel uanset type + seneste pr. type (så en lagersync ikke skjuler produktimportens resultat)
    return mergeSyncState(supplierId, { last_import_summary: summary, [`last_${opts.kind}_summary`]: summary })
  }

  try {
    await run(onProgress)
  } catch (e) {
    await save('error', last, e instanceof Error ? e.message : String(e))
    throw e
  }
  const end = terminal as P | null
  await save(end?.stage === 'error' ? 'error' : 'done', end ?? last)
  if (end) forward(end)
}
