import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/shop/load-cart/[token]
// Returnerer cart_data for et gyldigt, ikke-udløbet token.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('saved_carts')
    .select('cart_data, expires_at')
    .eq('token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Kurven blev ikke fundet' }, { status: 404 })
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Kurv-linket er udløbet' }, { status: 410 })
  }

  return NextResponse.json({ cart: data.cart_data })
}
