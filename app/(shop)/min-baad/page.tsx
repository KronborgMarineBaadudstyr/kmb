import type { Metadata } from 'next'
import { MinBaadView } from './_min-baad-view'
import { getShopUser } from '@/lib/shop/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { ServerBoat } from '@/lib/shop/boat-profile'

export const metadata: Metadata = { title: 'Min båd' }
export const dynamic = 'force-dynamic'

export default async function MinBaadPage({ searchParams }: { searchParams: Promise<{ gem?: string }> }) {
  const [{ gem }, user] = await Promise.all([searchParams, getShopUser()])
  let boat: ServerBoat | null = null
  if (user) {
    const { data } = await createServiceClient().from('shop_user_boats')
      .select('name, boat_type, length_ft').eq('shop_user_id', user.id).maybeSingle()
    boat = (data as ServerBoat | null) ?? null
  }
  // gem=1: kunden kommer fra bekræftelsesmailen ("Gem min båd") — båden fra browseren gemmes på kontoen
  return <MinBaadView loggedIn={!!user} email={user?.email ?? null} serverBoat={boat} fromConfirm={gem === '1'} />
}
