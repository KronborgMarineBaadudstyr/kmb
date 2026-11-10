import type { Metadata } from 'next'
import { Source_Sans_3, Playfair_Display } from 'next/font/google'
import { CartProvider } from './_cart'
import { ShopHeader, BottomNav } from './_shell'
import { ShopFooter } from './_footer'
import './shop.css'

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const playfair = Playfair_Display({
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
    <div className={`${sourceSans.variable} ${playfair.variable} ls-root`}>
      <CartProvider>
        <ShopHeader />
        <main className="ls-main">
          {children}
          <ShopFooter />
        </main>
        <BottomNav />
      </CartProvider>
    </div>
  )
}
