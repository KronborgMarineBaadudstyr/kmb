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

  const prompt = `Du er ekspert i produktkatalogisering for en dansk båd- og marinaudstyr-webshop.

Nedenfor er den komplette kategoristruktur med tilhørende produkttyper. Kategorinavnene er auto-genereret af en AI over flere kørsler og er derfor ikke konsistente.

KATEGORISTRUKTUR (Kategori > [Underkategori]: produkttyper):
${structure}

OPGAVE — Analyser strukturen og foreslå:
1. **Sammenlægninger**: Kategorier der dækker samme område men har forskellige navne (fx "Beslag & hardware" og "Beslag & fastgørelse")
2. **Omdøbninger**: Kategorier med upræcise eller inkonsekvente navne der bør hedde noget andet

For hver anbefaling skal du angive:
- "from": det nuværende kategorinavn der skal ændres
- "to": det bedste kategorinavn (enten eksisterende eller et nyt bedre navn)
- "reason": 1 kort sætning der forklarer hvorfor

VIGTIGE REGLER:
- Se på de faktiske produkttyper inden du foreslår en sammenlægning — hvis produkttyperne er fundamentalt forskellige, så slå dem IKKE sammen selvom navnene ligner
- Foreslå kun sammenlægninger/omdøbninger du er sikker på giver mening for en webshop-kunde
- Brug dansk terminologi der giver mening for bådejere
- "to"-værdien skal være et præcist, dækkende og brugervenligt kategorinavn
- Svar KUN med et gyldigt JSON-array, ingen tekst før eller efter

Eksempel på svar:
[
  {
    "from": "Beslag & hardware",
    "to": "Beslag & fastgørelse",
    "reason": "Begge kategorier indeholder beslag, skruer og monteringsdele — hardware er et unødigt engelsk lånord"
  },
  {
    "from": "Diverse marinetilbehør",
    "to": "Marinetilbehør",
    "reason": "Diverse tilføjer ingen information og gør kategorien mindre søgbar"
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
