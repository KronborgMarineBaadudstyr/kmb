import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic    = 'force-dynamic'
export const maxDuration = 30

// POST /api/product-types/suggest-categories
// Takes a list of category names and asks Claude to suggest merges.
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY mangler' }, { status: 503 })
  }

  const { categories } = await request.json() as { categories: string }

  const client = new Anthropic({ apiKey })

  const prompt = `Du er ekspert i produktkatalogisering for en dansk båd-webshop.

Herunder er en liste over kategorinavne som er oprettet automatisk. Flere af dem kan med fordel slås sammen fordi de dækker det samme område men har lidt forskellige navne.

KATEGORIER:
${categories}

OPGAVE:
Find kategorier der bør slås sammen. Forklar kort hvorfor. Svar KUN med et gyldigt JSON-array:

[
  {
    "from": "Beslag & hardware",
    "to": "Beslag & fastgørelse",
    "reason": "Dækker samme produktområde — hardware og fastgørelse er synonymer i bådudstyr-kontekst"
  }
]

Regler:
- Foreslå kun sammenlægninger hvor det giver klar mening
- "to" skal være det bedste/mest dækkende navn
- Slå IKKE kategorier sammen der dækker klart forskellige produkter
- Svar KUN med JSON-array, ingen tekst før eller efter`

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5',
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
