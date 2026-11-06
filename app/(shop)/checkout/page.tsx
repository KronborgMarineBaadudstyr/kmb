import type { Metadata } from 'next'
import { CheckoutForm } from './_checkout-form'

export const metadata: Metadata = { title: 'Kasse' }

export default function CheckoutPage() {
  return <CheckoutForm />
}
