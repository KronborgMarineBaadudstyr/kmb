import type { Metadata } from 'next'
import { MinBaadView } from './_min-baad-view'

export const metadata: Metadata = { title: 'Min båd' }

export default function MinBaadPage() {
  return <MinBaadView />
}
