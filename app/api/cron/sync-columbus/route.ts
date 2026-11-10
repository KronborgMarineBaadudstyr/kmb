import { importColumbus } from '@/lib/importers/columbus'
import { chainedCronImport } from '@/lib/import-chain'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// Kører i dele á ca. 3½ min — hver del fortsætter, hvor den forrige slap (lib/import-chain.ts)
export async function GET(request: Request) {
  return chainedCronImport(request, 'Columbus Marine', (onP, ctx) => importColumbus(onP, ctx))
}
