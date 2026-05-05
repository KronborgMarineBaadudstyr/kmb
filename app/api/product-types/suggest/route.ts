import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export type AiSuggestion = {
  name:               string
  keywords:           string[]
  variant_attributes: { name: string; unit: string }[]
  our_category:       string
  our_subcategory:    string
  reasoning:          string   // kort forklaring fra AI
  example_names:      string[] // eksempler fra staging-data der matchede
}

// POST /api/product-types/suggest
// Samples product names from staging, calls Claude, returns product type suggestions.
export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim() === '') {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY er ikke sat i .env.local / Vercel environment variables.' },
      { status: 503 }
    )
  }

  const supabase = createServiceClient()

  // Sample up to 500 unique product names from staging (pending or needs_review only)
  const names: string[] = []
  const PAGE = 1000
  for (let p = 0; names.length < 500; p++) {
    const { data, error } = await supabase
      .from('supplier_product_staging')
      .select('normalized_name')
      .in('status', ['pending_review', 'needs_review'])
      .not('normalized_name', 'is', null)
      .range(p * PAGE, p * PAGE + PAGE - 1)
      .order('id') // consistent ordering

    if (error || !data || data.length === 0) break

    for (const row of data) {
      if (row.normalized_name && !names.includes(row.normalized_name)) {
        names.push(row.normalized_name)
        if (names.length >= 500) break
      }
    }
    if (data.length < PAGE) break
  }

  if (names.length === 0) {
    return NextResponse.json(
      { error: 'Ingen produktnavne fundet i staging.' },
      { status: 400 }
    )
  }

  // Load existing product type names so AI avoids duplicates
  const { data: existingTypes } = await supabase
    .from('product_types')
    .select('name, keywords')

  const existingNames = (existingTypes ?? []).map(t => t.name).join(', ') || 'ingen endnu'

  const client = new Anthropic({ apiKey })

  const prompt = `Du er ekspert i marine bådudstyr og produktkatalogisering.

Nedenfor er op til 500 produktnavne fra en dansk båd-webshop. Analyser dem og identificér produkttyper hvor det giver mening at oprette varianter frem for separate produkter.

EKSISTERENDE PRODUKTTYPER (undgå dubletter): ${existingNames}

PRODUKTNAVNE:
${names.slice(0, 500).join('\n')}

OPGAVE:
Identificér 10-20 produkttyper fra listen. For hver type skal du svare:

1. **name**: Produkttypens navn på dansk (fx "Ankerkæde", "Fender", "Fortøjningstov")
2. **keywords**: Nøgleord der identificerer produkter af denne type. Søgning er case-insensitiv og matcher delstrenge. Inkludér variationer af stavning og flertal.
3. **variant_attributes**: Hvilke måleenheder/egenskaber i produktnavnet er VARIANTER (ikke separate produkter)?
   - Eksempel: For "Ankerkæde 10mm 30m" → mm = godstyklelse (variant), m = længde (variant)
   - Eksempel: For "Fender type A 20cm" → størrelseskoder (A0/A1/B0...) og cm = variant
   - VIGTIG REGEL: Tal+enhed er variant HVIS det er en valgmulighed for brugeren. Det er et SEPARAT produkt hvis det ændrer produktets grundlæggende funktion (fx en 12V pumpe vs 24V pumpe → separate produkter).
4. **our_category**: Vores kategori i webshop (overordnet, brugervenlig dansk tekst)
5. **our_subcategory**: Underkategori (mere specifik, kan være tom)
6. **reasoning**: 1-2 sætninger der forklarer dit valg af variant-attributter
7. **example_names**: 2-3 eksempler fra listen der illustrerer varianter af denne type

Svar KUN med et gyldigt JSON-array. Ingen tekst før eller efter. Format:
[
  {
    "name": "Ankerkæde",
    "keywords": ["ankerkæde", "kæde", "anchor chain"],
    "variant_attributes": [
      {"name": "Godstyklelse", "unit": "mm"},
      {"name": "Længde", "unit": "m"}
    ],
    "our_category": "Ankre & fortøjning",
    "our_subcategory": "Ankerkæder",
    "reasoning": "Ankerkæder fås i samme type men forskellige tykkelser og længder som brugeren vælger.",
    "example_names": ["Ankerkæde galvaniseret 10mm 30m", "Ankerkæde galvaniseret 10mm 50m", "Ankerkæde rustfri 12mm 30m"]
  }
]`

  let suggestions: AiSuggestion[] = []

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    // Extract JSON array from response (strip any accidental markdown)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('AI returnerede ikke gyldigt JSON-array')

    suggestions = JSON.parse(jsonMatch[0]) as AiSuggestion[]
  } catch (err) {
    return NextResponse.json(
      { error: `AI-analyse fejlede: ${String(err)}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    suggestions,
    sample_size: names.length,
  })
}
