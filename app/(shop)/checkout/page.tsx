import type { Metadata } from 'next'
import { getShopUser } from '@/lib/shop/auth'
import { payAtPickupEligible, contactDefaults } from '@/lib/shop/customers'
import { onlinePaymentAvailable } from '@/lib/shop/payment'
import { CheckoutForm } from './_checkout-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kasse', robots: { index: false } }

export default async function CheckoutPage() {
  const user = await getShopUser()
  const account = user
    ? {
        label:       user.email ?? user.phone ?? '',
        defaults:    await contactDefaults(user),
        payAtPickup: await payAtPickupEligible(user.id),
      }
    : null
  return <CheckoutForm account={account} onlineAvailable={onlinePaymentAvailable()} />
}
