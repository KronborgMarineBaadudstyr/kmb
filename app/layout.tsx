import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kronborg Marine Bådudstyr — Middleware',
  description: 'Produkt og lager administration',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="h-full bg-gray-50">{children}</body>
    </html>
  )
}
