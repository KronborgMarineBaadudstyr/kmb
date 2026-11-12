import { createServiceClient } from '@/lib/supabase/server'

// "Kendt kunde" = har handlet hos os før: en afsluttet ordre, eller en gammel/importeret ordre
// (source ≠ webshop) der ikke er annulleret. Admin kan overstyre med pay_at_pickup_allowed.
export async function payAtPickupEligible(userId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: user } = await supabase.from('shop_users')
    .select('pay_at_pickup_allowed').eq('id', userId).maybeSingle()
  if (!user) return false
  if (user.pay_at_pickup_allowed !== null) return user.pay_at_pickup_allowed

  const { count } = await supabase.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('shop_user_id', userId)
    .not('status', 'in', '(cancelled,refunded)')
    .or('status.eq.completed,source.neq.webshop')
  return (count ?? 0) > 0
}

export type ContactDefaults = { name: string; email: string; phone: string; address: string; postcode: string; city: string }

// Udfyld checkout med kontoens oplysninger og adressen fra seneste ordre.
export async function contactDefaults(user: { id: string; email: string | null; phone: string | null; name: string | null }): Promise<ContactDefaults> {
  const { data: last } = await createServiceClient().from('orders')
    .select('customer_info').eq('shop_user_id', user.id).neq('source', 'pos')   // kassebonner har ingen adresse
    .order('ordered_at', { ascending: false }).limit(1).maybeSingle()
  const c = (last?.customer_info ?? {}) as Partial<ContactDefaults>
  return {
    name:     user.name ?? c.name ?? '',
    email:    user.email ?? c.email ?? '',
    phone:    c.phone ?? user.phone ?? '',
    address:  c.address ?? '',
    postcode: c.postcode ?? '',
    city:     c.city ?? '',
  }
}
