import { createServiceClient } from '@/lib/supabase/server'
import { getShopUser } from '@/lib/shop/auth'

// Er kunden logget ind, og har de allerede en båd på profilen? (Bruges til at skjule "Gem min båd"-opfordringen)
export async function boatPromptContext(): Promise<{ loggedIn: boolean; hasBoat: boolean }> {
  const user = await getShopUser()
  if (!user) return { loggedIn: false, hasBoat: false }
  const { data } = await createServiceClient().from('shop_user_boats').select('id').eq('shop_user_id', user.id).maybeSingle()
  return { loggedIn: true, hasBoat: !!data }
}
