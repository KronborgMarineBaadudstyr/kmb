'use client'

import { useEffect } from 'react'
import { useCart } from '../../../_cart'

// Tømmer kurven første gang kvitteringen for en ordre vises — ikke hvis linket åbnes igen senere.
export function ClearCart({ orderId }: { orderId: string }) {
  const { clear, ready } = useCart()
  useEffect(() => {
    if (!ready) return
    try {
      if (localStorage.getItem('ls_last_order') === orderId) return
      localStorage.setItem('ls_last_order', orderId)
    } catch {}
    clear()
  }, [ready, clear, orderId])
  return null
}
