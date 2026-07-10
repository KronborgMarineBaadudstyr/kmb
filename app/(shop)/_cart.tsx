'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type CartItem = {
  id: string
  name: string
  price: number
  image?: string
  qty: number
  sku: string
}

type CartCtx = {
  items: CartItem[]
  add:    (item: Omit<CartItem, 'qty'>) => void
  remove: (id: string) => void
  setQty: (id: string, qty: number) => void
  clear:  () => void
  total:  number
  count:  number
}

const Ctx = createContext<CartCtx | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ls_cart')
      if (stored) setItems(JSON.parse(stored))
    } catch {}
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) localStorage.setItem('ls_cart', JSON.stringify(items))
  }, [items, ready])

  const add = useCallback((item: Omit<CartItem, 'qty'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id)
      if (existing) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...item, qty: 1 }]
    })
  }, [])

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    if (qty < 1) { remove(id); return }
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i))
  }, [remove])

  const clear = useCallback(() => setItems([]), [])

  const total = items.reduce((s, i) => s + i.price * i.qty, 0)
  const count = items.reduce((s, i) => s + i.qty, 0)

  return (
    <Ctx.Provider value={{ items, add, remove, setQty, clear, total, count }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCart() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart must be inside CartProvider')
  return ctx
}

export function fmtPrice(kr: number) {
  return kr.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr'
}
