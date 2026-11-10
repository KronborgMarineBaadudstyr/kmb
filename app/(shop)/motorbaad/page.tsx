import type { Metadata } from 'next'
import { BoatCategoriesPage } from '../_boat-categories'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Udstyr til motorbåd' }

export default function Page() {
  return <BoatCategoriesPage boat="motorbaad" />
}
