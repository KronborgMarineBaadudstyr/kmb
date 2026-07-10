import type { Metadata } from 'next'
import { CartView } from './_cart-view'

export const metadata: Metadata = { title: 'Kurv' }

export default function KurvPage() {
  return <CartView />
}
