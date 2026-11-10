import { importPalby } from '@/lib/importers/palby'
import { chainedCronImport } from '@/lib/import-chain'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// Kører efter Palby har opdateret den fulde produktfil — fuld fil, da Palby ikke har en stabil delta-produktfil.
// Kører i dele á ca. 3½ min — hver del fortsætter, hvor den forrige slap (lib/import-chain.ts)
export async function GET(request: Request) {
  return chainedCronImport(request, 'Palby', (onP, ctx) => importPalby(onP, { delta: false, ...ctx }))
}
