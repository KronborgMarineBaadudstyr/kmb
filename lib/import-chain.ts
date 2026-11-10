import { after, NextResponse } from 'next/server'
import { trackImport, type RunContext } from '@/lib/import-run'
import { verifyCronRequest } from '@/lib/cron-auth'

// Automatisk import i flere dele (Palby, Columbus): cron-ruten svarer med det samme og kører én del
// i baggrunden (after). Når delen melder 'partial', kalder ruten sig selv med ?continue=1, og næste del
// fortsætter fra det gemte varenummer. Hver del er sit eget kald og får sine egne 5 minutter hos Vercel.

type Progress = { stage: string; processed?: number; total?: number; message?: string }

// Samme adresse som cron-kaldet kom ind på (samme deployment), ellers projektets produktionsdomæne
function continueUrls(request: Request): string[] {
  const own = new URL(request.url)
  own.searchParams.set('continue', '1')
  const urls = [own.toString()]
  const prod = process.env.VERCEL_ENV === 'production' ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined
  if (prod && prod !== own.host) {
    const alt = new URL(own); alt.protocol = 'https:'; alt.host = prod
    urls.push(alt.toString())
  }
  return urls
}

export function chainedCronImport(
  request: Request,
  supplier: string,
  run: (onProgress: (p: Progress) => void, ctx: RunContext) => Promise<void>,
): Response {
  if (!verifyCronRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resume = new URL(request.url).searchParams.get('continue') === '1'
  const tag = `[cron] ${supplier}${resume ? ' (fortsat)' : ''}`
  const nextUrls = continueUrls(request)

  after(async () => {
    let end: Progress | null = null
    try {
      await trackImport<Progress>({ supplier, source: 'cron', kind: 'products', resumable: true, resume }, run, p => { end = p })
    } catch (e) {
      console.error(`${tag} fejl:`, e instanceof Error ? e.message : String(e))
      return
    }
    const last = end as Progress | null
    console.log(`${tag}: ${last?.stage ?? 'ukendt'} — ${last?.message ?? ''}`)
    if (last?.stage !== 'partial') return

    // Start næste del. Den svarer straks (202) og arbejder selv videre i sin egen baggrund.
    const headers: Record<string, string> = { Authorization: `Bearer ${process.env.CRON_SECRET}` }
    // Er Vercels deployment-beskyttelse slået til, kræves bypass-nøglen (sættes automatisk af Vercel, hvis den er aktiveret)
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    for (const url of nextUrls) {
      try {
        const res = await fetch(url, { headers, cache: 'no-store' })
        if (res.ok) return
        console.error(`${tag}: kunne ikke starte næste del på ${new URL(url).host} — HTTP ${res.status}`)
      } catch (e) {
        console.error(`${tag}: kunne ikke starte næste del på ${new URL(url).host}:`, e instanceof Error ? e.message : String(e))
      }
    }
  })

  return NextResponse.json({ ok: true, started: true, resume }, { status: 202 })
}
