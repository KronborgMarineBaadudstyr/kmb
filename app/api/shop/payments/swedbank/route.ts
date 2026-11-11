import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { syncPayment } from '@/lib/shop/payment'

export const dynamic = 'force-dynamic'

// POST /api/shop/payments/swedbank — callback fra Swedbank Pay (v3.1): { orderReference, paymentOrder: { id, instrument, number } }
// Indholdet stoles ikke på: vi slår ordren op på paymentOrder-id og henter selv status med GET (syncPayment).
// Svarer altid 200, så Swedbank ikke prøver igen unødigt — fejl logges.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { paymentOrder?: { id?: unknown } } | null
  const poId = typeof body?.paymentOrder?.id === 'string' ? body.paymentOrder.id : null
  if (!poId || !/^\/psp\/paymentorders\/[0-9a-f-]{36}$/i.test(poId)) return NextResponse.json({ ok: true })

  const { data: order } = await createServiceClient().from('orders').select('id').eq('payment_reference', poId).maybeSingle()
  if (!order) return NextResponse.json({ ok: true })
  try {
    await syncPayment(order.id)
  } catch (e) {
    console.error('[swedbank callback]', poId, e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false }, { status: 500 })   // Swedbank prøver igen senere
  }
  return NextResponse.json({ ok: true })
}
