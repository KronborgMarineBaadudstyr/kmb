import { importHfIndustri } from '@/lib/importers/hf-industri'
import { trackImport } from '@/lib/import-run'
import { requireAdmin } from '@/lib/api-admin'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new Response(JSON.stringify({ error: 'Ugyldig form data' }), { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return new Response(JSON.stringify({ error: 'Ingen fil modtaget' }), { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })
  const send = (data: object) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      await trackImport({ supplier: 'HF Industri Marine', source: 'manual', kind: 'products' },
        onP => importHfIndustri(buffer, onP), send)
    } catch (e: unknown) {
      send({
        stage: 'error', total: 0, processed: 0, matched: 0,
        staged: 0, updated: 0, errors: 1,
        message: e instanceof Error ? e.message : String(e),
      })
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
