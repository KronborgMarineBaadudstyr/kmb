import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/secrets'

// Hvilken Anthropic-nøgle al AI i systemet bruger: butikkens egen (indtastet i admin, krypteret)
// eller standardnøglen ANTHROPIC_API_KEY. Butikkens nøgle vinder, når den findes og kan læses.

export const ANTHROPIC_SETTING = 'anthropic_api_key'

export type KeyInfo = {
  source: 'shop' | 'env' | null
  hint: string | null                 // sidste 4 tegn
  updated_at: string | null
  updated_by: string | null
  unreadable: boolean                 // gemt nøgle kunne ikke dekrypteres → standardnøglen bruges
}

async function stored() {
  const { data, error } = await createServiceClient().from('app_settings')
    .select('value, hint, updated_at, updated_by').eq('key', ANTHROPIC_SETTING).maybeSingle()
  return error ? null : data      // fejl (fx tabel ikke oprettet endnu) → som om intet er gemt
}

export async function resolveAnthropicKey(): Promise<{ key: string | null } & KeyInfo> {
  const row = await stored()
  const shopKey = row ? decryptSecret(row.value) : null
  if (row && shopKey) {
    return { key: shopKey, source: 'shop', hint: row.hint, updated_at: row.updated_at, updated_by: row.updated_by, unreadable: false }
  }
  const env = process.env.ANTHROPIC_API_KEY?.trim() || null
  return {
    key: env, source: env ? 'env' : null, hint: env ? env.slice(-4) : null,
    updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null, unreadable: !!row && !shopKey,
  }
}

// Klient til den aktive nøgle, eller null hvis AI ikke er sat op
export async function anthropicClient(): Promise<Anthropic | null> {
  const { key } = await resolveAnthropicKey()
  return key ? new Anthropic({ apiKey: key }) : null
}
