import { importHfIndustri } from '@/lib/importers/hf-industri'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
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

  const limitParam = new URL(request.url).searchParams.get('limit')
  const options = limitParam ? { limit: parseInt(limitParam, 10) } : {}

  const encoder = new TextEncoder()
  let ctrl: ReadableStreamDefaultController<Uint8Array> = null!
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })
  const send = (data: object) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      await importHfIndustri(buffer, send, options)
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
