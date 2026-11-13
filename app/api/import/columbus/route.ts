import { importColumbus } from '@/lib/importers/columbus'
import { trackImport } from '@/lib/import-run'
import type { ColumbusImportProgress } from '@/lib/importers/columbus'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// GET /api/import/columbus          → fuld import
// GET /api/import/columbus?limit=N  → test med N produkter
// GET /api/import/columbus?continue=1 → næste del af en opdelt kørsel (browseren kalder selv, når en del melder 'partial')

export async function GET(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied
  const url   = new URL(request.url)
  const resume = url.searchParams.get('continue') === '1'

  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c },
  })

  ;(async () => {
    try {
      await trackImport({ supplier: 'Columbus Marine', source: 'manual', kind: 'products', resumable: true, resume },
        (onP, ctx) => importColumbus(onP, ctx),
        (data: ColumbusImportProgress) => {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        })
    } catch (e: unknown) {
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({
        stage: 'error', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, skipped: 0, errors: 1,
        message: e instanceof Error ? e.message : String(e),
      })}\n\n`))
    } finally {
      ctrl.close()
    }
  })()

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
