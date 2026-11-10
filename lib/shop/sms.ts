import { createServiceClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/secrets'

// SMS via GatewayAPI (bruges til login med telefonnummer).
// Opsætning: Indstillinger → SMS (/admin/sms, kun ejere) — token, region og afsendernavn gemmes krypteret
// i app_settings ('gatewayapi'). Fallback: env GATEWAYAPI_TOKEN (+ GATEWAYAPI_REGION=eu, SMS_SENDER).
// Uden opsætning returnerer sendSms() false, og login-ruten sender i stedet linket til kundens e-mail.
//
// API: POST https://gatewayapi.{com|eu}/rest/mtsms, header "Authorization: Token <token>",
//      body { sender, message, recipients: [{ msisdn: 4512345678 }] } → 200 { ids: [...] }

export const SMS_SETTING = 'gatewayapi'

export type SmsRegion = 'com' | 'eu'     // gatewayapi.com (standard) eller gatewayapi.eu (EU-opsætning)
export type SmsConfig = { token: string; region: SmsRegion; sender: string }
export type SmsInfo = {
  config: SmsConfig | null
  source: 'shop' | 'env' | null
  hint: string | null
  updated_at: string | null
  updated_by: string | null
  unreadable: boolean
}

export const DEFAULT_SENDER = 'LoveSailing'

// Afsendernavn: højst 11 bogstaver/tal (mellemrum tilladt) eller et telefonnummer på højst 15 cifre
export function validSender(s: string): boolean {
  return /^[A-Za-z0-9 ]{1,11}$/.test(s) && /[A-Za-z0-9]/.test(s) || /^\+?\d{1,15}$/.test(s)
}

const host = (r: SmsRegion) => (r === 'eu' ? 'https://gatewayapi.eu' : 'https://gatewayapi.com')

export async function resolveSmsConfig(): Promise<SmsInfo> {
  const { data: row, error } = await createServiceClient().from('app_settings')
    .select('value, hint, updated_at, updated_by').eq('key', SMS_SETTING).maybeSingle()
  const stored = !error && row ? decryptSecret(row.value) : null
  if (row && stored) {
    try {
      const c = JSON.parse(stored) as SmsConfig
      if (c.token) return { config: { token: c.token, region: c.region === 'eu' ? 'eu' : 'com', sender: c.sender || DEFAULT_SENDER },
        source: 'shop', hint: row.hint, updated_at: row.updated_at, updated_by: row.updated_by, unreadable: false }
    } catch { /* falder igennem til env */ }
  }
  const token = process.env.GATEWAYAPI_TOKEN?.trim()
  return {
    config: token ? { token, region: process.env.GATEWAYAPI_REGION === 'eu' ? 'eu' : 'com', sender: process.env.SMS_SENDER?.trim() || DEFAULT_SENDER } : null,
    source: token ? 'env' : null, hint: token ? token.slice(-4) : null,
    updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null, unreadable: !!row && !stored,
  }
}

// "+4512345678" → 4512345678 (GatewayAPI vil have nummeret med landekode, uden +)
export function toMsisdn(phone: string): number | null {
  const digits = phone.replace(/[^\d]/g, '')
  return /^\d{8,15}$/.test(digits) ? Number(digits) : null
}

// Sender én SMS. Returnerer en fejltekst ved fejl, ellers null.
export async function sendSmsWith(cfg: SmsConfig, to: string, text: string): Promise<string | null> {
  const msisdn = toMsisdn(to)
  if (!msisdn) return 'Ugyldigt telefonnummer'
  try {
    const res = await fetch(`${host(cfg.region)}/rest/mtsms`, {
      method: 'POST',
      headers: { Authorization: `Token ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: cfg.sender, message: text, recipients: [{ msisdn }] }),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return null
    const body = await res.json().catch(() => null) as { message?: string; code?: string } | null
    if (res.status === 401 || res.status === 403) return 'GatewayAPI afviste token — tjek at det er kopieret helt'
    return `GatewayAPI svarede ${res.status}${body?.message ? `: ${body.message}` : ''}`
  } catch (e) {
    return `Kunne ikke nå GatewayAPI: ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function smsConfigured(): Promise<boolean> {
  return !!(await resolveSmsConfig()).config
}

// Bruges af login-ruten. false = ikke sendt (ingen opsætning eller fejl) — så bruges e-mail i stedet.
export async function sendSms(to: string, text: string): Promise<boolean> {
  const { config } = await resolveSmsConfig()
  if (!config) return false
  const err = await sendSmsWith(config, to, text)
  if (err) console.error('[sms]', err)
  return !err
}

// Tjekker token uden at sende en SMS (kontooplysninger). null = ok, ellers fejltekst.
// Svarer GatewayAPI uventet (fx andet end 401/403), godtages token — test-SMS'en afgør det.
export async function checkSmsToken(cfg: Pick<SmsConfig, 'token' | 'region'>): Promise<string | null> {
  try {
    const res = await fetch(`${host(cfg.region)}/rest/me`, {
      headers: { Authorization: `Token ${cfg.token}` }, signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401 || res.status === 403) {
      return `GatewayAPI (gatewayapi.${cfg.region}) afviste token — tjek token og om kontoen er på .com eller .eu`
    }
    return null
  } catch {
    return `Kunne ikke nå gatewayapi.${cfg.region} — prøv igen om lidt`
  }
}
