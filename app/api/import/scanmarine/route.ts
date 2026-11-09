import { importScanmarine } from '@/lib/importers/scanmarine'
import { trackImport } from '@/lib/import-run'
import type { ScanmarineImportProgress } from '@/lib/importers/scanmarine'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// GET /api/import/scanmarine          → fuld import
// GET /api/import/scanmarine?limit=N  → test med N produkter

export async function GET(request: Request) {
  const url   = new URL(request.url)
  const limit = url.searchParams.get('limit')

  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c },
  })

  ;(async () => {
    try {
      await trackImport({ supplier: 'Scanmarine', source: 'manual', kind: 'products', test: !!limit },
        onP => importScanmarine(onP, { limit: limit ? parseInt(limit, 10) : undefined }),
        (data: ScanmarineImportProgress) => {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        })
    } catch (e: unknown) {
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({
        stage: 'error', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, errors: 1,
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
