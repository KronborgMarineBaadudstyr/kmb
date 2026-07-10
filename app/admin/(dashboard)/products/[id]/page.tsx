'use client'

import { useParams, useRouter } from 'next/navigation'
import { ProductDetail } from '../_ProductDetail'

export default function ProductDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()
  return (
    <ProductDetail
      productId={id}
      mode="page"
      onBack={() => router.back()}
    />
  )
}
