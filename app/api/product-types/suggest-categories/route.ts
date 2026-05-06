import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// POST /api/product-types/suggest-categories
// Takes full category structure (cat > sub > product type names) and
// asks Claude Sonnet to suggest category merges with full context.
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY mangler' }, { status: 503 })
  }

  const { structure } = await request.json() as { structure: string }

  const client = new Anthropic({ apiKey })

  const prompt = `Du er ekspert i produktkatalogisering for en dansk båd- og marinawebshop.

Nedenfor er den komplette kategoristruktur med tilhørende produkttyper. Kategorinavnene er auto-genereret og er IKKE konsistente — din opgave er at rydde grundigt op.

KATEGORISTRUKTUR (Kategori > [Underkategori]: produkttyper):
${structure}

NAVNGIVNINGSREGLER — følg dem strengt:
1. Fjern ALTID redundante præfikser: "Bådens X" → "X", "Marine X" → "X", "Båd X" → "X"
   Eksempel: "Bådens dæk & cockpit" → "Dæk & cockpit", "Marine el" → "El & elektronik"
2. Brug kortfattede, præcise dansk handelstermer som bådejere bruger i daglig tale
3. Undgå engelske ord med mindre de er alment accepterede i branchen (fx "GPS", "VHF")
4. "& tilbehør" og "& udstyr" er næsten altid overflødigt — fjern det medmindre det er det eneste indhold
5. Slå kategorier sammen der dækker overlappende produkter, selvom navnene er lidt forskellige
6. Vær modig — foreslå alle omdøbninger du finder meningsfulde, ikke kun de åbenlyse

OPGAVE:
For HVER kategori der bør omdøbes eller merges med en anden, returner et objekt med:
- "from": det nuværende kategorinavn
- "to": det korrekte kategorinavn efter reglerne ovenfor
- "reason": max 10 ord om hvorfor

Svar KUN med JSON-array, ingen tekst før eller efter:
[
  {
    "from": "Bådens dæk & cockpit",
    "to": "Dæk & cockpit",
    "reason": "Redundant 'Bådens' præfiks fjernet"
  },
  {
    "from": "Beslag & hardware",
    "to": "Beslag & fastgørelse",
    "reason": "Hardware er engelsk — fastgørelse er mere præcist"
  }
]`

  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return NextResponse.json({ merges: [] })

    const merges = JSON.parse(jsonMatch[0])
    return NextResponse.json({ merges })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
