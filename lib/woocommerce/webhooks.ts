import { createHmac, timingSafeEqual } from 'crypto'

// Verificér WooCommerce webhook HMAC-SHA256 signatur
export function verifyWooWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) return false

  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64')

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  } catch {
    return false
  }
}
