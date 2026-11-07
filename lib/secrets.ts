import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'

// Kryptering af hemmelige indstillinger (app_settings.value) med AES-256-GCM.
// Nøglen afledes af SETTINGS_ENCRYPTION_KEY, eller af service-nøglen hvis den ikke er sat.
// Skiftes den, kan gemte værdier ikke længere læses — de skal så indtastes igen.

function encryptionKey(): Buffer {
  const base = process.env.SETTINGS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Ingen krypteringsnøgle (SETTINGS_ENCRYPTION_KEY / SUPABASE_SERVICE_ROLE_KEY)')
  return Buffer.from(hkdfSync('sha256', base, 'kmb-app-settings', 'secret-v1', 32))
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

// null hvis værdien ikke kan dekrypteres (fx skiftet nøgle eller ændret data)
export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, data] = stored.split(':')
  if (v !== 'v1' || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
