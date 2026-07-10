import type { Metadata } from 'next'
import { Hanken_Grotesk, Cormorant_Garamond } from 'next/font/google'
import { CartProvider } from './_cart'
import { ShopHeader, BottomNav } from './_shell'
import './shop.css'

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'LoveSailing.dk', template: '%s — LoveSailing.dk' },
  description: 'Marine bådudstyr til sejl- og motorbåde. Stort udvalg fra de bedste brands.',
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${hanken.variable} ${cormorant.variable} ls-root`}>
      <CartProvider>
        <ShopHeader />
        <main className="ls-main">
          {children}
        </main>
        <BottomNav />
      </CartProvider>
    </div>
  )
}
