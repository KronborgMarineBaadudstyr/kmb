import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CartView } from './_cart-view'
import { BoatPrompt } from '../_boat-prompt'
import { boatPromptContext } from '@/lib/shop/user-boat'

export const metadata: Metadata = { title: 'Kurv' }
export const dynamic = 'force-dynamic'

export default async function KurvPage() {
  const ctx = await boatPromptContext()
  return (
    <>
      <Suspense>
        <CartView />
      </Suspense>
      {/* Har den besøgende valgt Sejlbåd/Motorbåd: tilbud om at gemme båden (vises ikke, hvis den allerede er gemt) */}
      <div style={{ maxWidth: 1280, margin: '8px auto 0' }}>
        <BoatPrompt loggedIn={ctx.loggedIn} hasBoat={ctx.hasBoat} compact />
      </div>
    </>
  )
}
