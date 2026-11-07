import { createHash, randomBytes } from 'crypto'

// Engangs- og sessionstokens. Kun hashen gemmes i databasen.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const newToken  = () => randomBytes(32).toString('base64url')

// Kun interne stier — ellers kunne et login-link sende brugeren videre til et fremmed site
export function safeNext(v: unknown): string | null {
  return typeof v === 'string' && /^\/(?![\/\\])[\w\-./?=&%]*$/.test(v) && v.length <= 200 ? v : null
}
