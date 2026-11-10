import { importEngholm } from '@/lib/importers/engholm'
import { chainedCronImport } from '@/lib/import-chain'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// Kører i dele á ca. 3½ min — hver del fortsætter, hvor den forrige slap (lib/import-chain.ts)
export async function GET(request: Request) {
  return chainedCronImport(request, 'Engholm', (onP, ctx) => importEngholm(onP, ctx))
}
