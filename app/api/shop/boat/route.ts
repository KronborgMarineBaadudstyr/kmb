import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getShopUser } from '@/lib/shop/auth'
import { cleanBoatInput } from '@/lib/shop/boat-profile'

export const dynamic = 'force-dynamic'

// GET /api/shop/boat → kundens båd (kræver login)
export async function GET() {
  const user = await getShopUser()
  if (!user) return NextResponse.json({ error: 'Ikke logget ind' }, { status: 401 })
  const { data, error } = await createServiceClient().from('shop_user_boats')
    .select('name, boat_type, length_ft').eq('shop_user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ boat: null, unavailable: true })
  return NextResponse.json({ boat: data ?? null })
}

// PUT /api/shop/boat { name?, type: 'sail'|'motor'|'both', length? } → gem på kontoen
export async function PUT(request: Request) {
  const user = await getShopUser()
  if (!user) return NextResponse.json({ error: 'Ikke logget ind' }, { status: 401 })
  const input = cleanBoatInput(await request.json().catch(() => null))
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 })
  const { error } = await createServiceClient().from('shop_user_boats').upsert(
    { shop_user_id: user.id, ...input, updated_at: new Date().toISOString() },
    { onConflict: 'shop_user_id' },
  )
  if (error) return NextResponse.json({ error: 'Kunne ikke gemme båden' }, { status: 503 })
  return NextResponse.json({ ok: true })
}
