import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { extractBrand, KnownBrand } from '@/lib/extract-brand'

export const dynamic = 'force-dynamic'

// Column headers in the Excel template — order matters for readability
export const TEMPLATE_COLUMNS = [
  { key: 'name',                    label: 'Produktnavn',             required: true,  example: 'Wirelås rustfri 6mm' },
  { key: 'brand',                   label: 'Brand / Mærke',           required: false, example: 'Plastimo' },
  { key: 'short_description',       label: 'Kort beskrivelse',        required: false, example: 'Kompakt wirelås til sejl' },
  { key: 'description',             label: 'Beskrivelse',             required: false, example: 'Rustfri wirelås...' },
  { key: 'categories',              label: 'Kategorier (komma-sep.)', required: false, example: 'Tovværk,Wirelås' },
  { key: 'sales_price',             label: 'Salgspris (kr)',          required: false, example: '149,95' },
  { key: 'ean',                     label: 'EAN / Stregkode',         required: false, example: '5701234567890' },
  { key: 'manufacturer_sku',        label: 'Producent SKU',           required: false, example: 'PLT-WL-6' },
  { key: 'internal_sku',            label: 'Eget varenr. (valgfrit)', required: false, example: 'KMB-PLT-WL6' },
  { key: 'weight',                  label: 'Vægt (kg)',               required: false, example: '0.05' },
  { key: 'length',                  label: 'Længde (cm)',             required: false, example: '10' },
  { key: 'width',                   label: 'Bredde (cm)',             required: false, example: '5' },
  { key: 'height',                  label: 'Højde (cm)',              required: false, example: '3' },
  { key: 'supplier_name',           label: 'Leverandør (navn)',       required: false, example: 'Columbus Marine' },
  { key: 'supplier_sku',            label: 'Leverandørens varenr.',   required: false, example: 'CBS-WL-6MM' },
  { key: 'purchase_price',          label: 'Indkøbspris (kr)',        required: false, example: '72,00' },
  { key: 'recommended_sales_price', label: 'Vejl. udsalgspris (kr)',  required: false, example: '149,95' },
  { key: 'image_url',               label: 'Billede-URL',             required: false, example: 'https://...' },
]

// GET /api/products/bulk-import — download Excel template
export async function GET() {
  const wb = XLSX.utils.book_new()

  // ── Tab 1: Import-skabelon ────────────────────────────────────────────────
  const headers  = TEMPLATE_COLUMNS.map(c => c.label)
  const examples = TEMPLATE_COLUMNS.map(c => c.example)
  const required = TEMPLATE_COLUMNS.map(c => c.required ? '* Påkrævet' : '')

  const ws = XLSX.utils.aoa_to_sheet([
    headers,
    required,
    examples,
  ])

  // Column widths
  ws['!cols'] = TEMPLATE_COLUMNS.map(c => ({ wch: Math.max(c.label.length, c.example.length, 16) }))

  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  XLSX.utils.book_append_sheet(wb, ws, 'Import')

  // ── Tab 2: Vejledning ─────────────────────────────────────────────────────
  const guideData = [
    ['Felt',                         'Påkrævet', 'Beskrivelse'],
    ...TEMPLATE_COLUMNS.map(c => [
      c.label,
      c.required ? 'Ja' : 'Nej',
      (() => {
        switch (c.key) {
          case 'name':                    return 'Produktets fulde navn'
          case 'categories':              return 'Adskildt med komma, f.eks. "Tovværk,Anker"'
          case 'sales_price':             return 'Brug punktum eller komma som decimal, f.eks. 149.95 eller 149,95'
          case 'internal_sku':            return 'Lad feltet stå tomt for automatisk generering. Forslag: KMB-{leverandørSKU}'
          case 'supplier_name':           return 'Skal matche eksakt leverandørnavn i systemet, f.eks. "Columbus Marine"'
          case 'supplier_sku':            return 'Leverandørens eget varenummer — bruges til fremtidig matchning'
          case 'weight':                  return 'I kilogram, f.eks. 0.5'
          case 'length':
          case 'width':
          case 'height':                  return 'I centimeter'
          case 'image_url':               return 'Fuld URL til billede (https://...)'
          default:                        return ''
        }
      })(),
    ]),
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Vejledning')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="produktimport-skabelon.xlsx"',
    },
  })
}

// POST /api/products/bulk-import — parse uploaded xlsx and create products
// Content-Type: multipart/form-data  field: "file"
export async function POST(request: Request) {
  const supabase = createServiceClient()

  let formData: FormData
  try { formData = await request.formData() }
  catch { return NextResponse.json({ error: 'Forventet multipart/form-data' }, { status: 400 }) }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Ingen fil modtaget (felt: "file")' }, { status: 400 })

  const buf  = Buffer.from(await file.arrayBuffer())
  const wb   = XLSX.read(buf, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Filen indeholder ingen datarækker' }, { status: 400 })
  }

  // Map header labels → keys
  const labelToKey: Record<string, string> = {}
  for (const col of TEMPLATE_COLUMNS) labelToKey[col.label] = col.key

  // Build supplier name → id map
  const { data: supplierRows } = await supabase.from('suppliers').select('id, name')
  const supplierMap = new Map<string, string>()
  for (const s of supplierRows ?? []) supplierMap.set(s.name.toLowerCase().trim(), s.id)

  // Load known brands for auto-detection
  const { data: brandRows } = await supabase.from('known_brands').select('id, name, aliases')
  const knownBrands: KnownBrand[] = brandRows ?? []

  const results: { row: number; name: string; status: 'created' | 'error'; sku?: string; error?: string }[] = []
  let created = 0, errors = 0

  for (let ri = 0; ri < rows.length; ri++) {
    const raw = rows[ri]
    // Skip the "required" and "example" header rows if they snuck in
    const rowNum = ri + 2 // 1-indexed, +1 for header row

    // Normalize keys: accept both label and key names
    const r: Record<string, string> = {}
    for (const [rawKey, rawVal] of Object.entries(raw)) {
      const normalized = labelToKey[rawKey.trim()] ?? rawKey.trim()
      r[normalized] = String(rawVal ?? '').trim()
    }

    const name = r['name'] ?? r['Produktnavn'] ?? ''
    if (!name || name === '* Påkrævet' || name === 'Produktnavn') continue // skip header/example rows

    const parseNum = (v: string): number | null => {
      if (!v) return null
      const cleaned = v.replace(',', '.')
      const n = parseFloat(cleaned)
      return isNaN(n) ? null : n
    }

    const categories = r.categories
      ? r.categories.split(',').map(s => s.trim()).filter(Boolean)
      : []

    // Resolve supplier
    const suppName = (r.supplier_name ?? '').toLowerCase().trim()
    const supplierId = suppName ? supplierMap.get(suppName) ?? null : null
    if (suppName && !supplierId) {
      results.push({ row: rowNum, name, status: 'error', error: `Leverandør "${r.supplier_name}" ikke fundet` })
      errors++
      continue
    }

    // Resolve internal SKU
    let internalSku = r.internal_sku?.toUpperCase() || ''
    if (!internalSku && r.supplier_sku) {
      // Suggest: KMB- + normalized supplier SKU
      const normalized = r.supplier_sku.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)
      if (normalized) internalSku = `KMB-${normalized}`
    }
    if (internalSku) {
      // Check uniqueness — if taken, append -2, -3, ...
      let candidate = internalSku
      let suffix = 1
      while (true) {
        const { data: existing } = await supabase
          .from('products').select('id').eq('internal_sku', candidate).single()
        if (!existing) { internalSku = candidate; break }
        suffix++
        candidate = `${internalSku}-${suffix}`
      }
    } else {
      const ts  = Date.now().toString(36).toUpperCase()
      const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
      internalSku = `KMB-${ts}-${rnd}`
    }

    try {
      const { data: product, error: prodErr } = await supabase
        .from('products')
        .insert({
          internal_sku:      internalSku,
          name,
          brand:             r.brand || extractBrand(name, knownBrands) || null,
          description:       r.description       || null,
          short_description: r.short_description || null,
          categories,
          sales_price:       parseNum(r.sales_price),
          ean:               r.ean               || null,
          manufacturer_sku:  r.manufacturer_sku  || null,
          weight:            parseNum(r.weight),
          length:            parseNum(r.length),
          width:             parseNum(r.width),
          height:            parseNum(r.height),
          status:            'draft',
        })
        .select('id, internal_sku')
        .single()

      if (prodErr || !product) throw new Error(prodErr?.message ?? 'Ukendt fejl')

      if (supplierId) {
        await supabase.from('product_suppliers').insert({
          product_id:              product.id,
          supplier_id:             supplierId,
          supplier_sku:            r.supplier_sku            || internalSku,
          supplier_product_name:   name,
          purchase_price:          parseNum(r.purchase_price),
          recommended_sales_price: parseNum(r.recommended_sales_price),
          priority:    1,
          is_active:   true,
          item_status: 'active',
        })
      }

      if (r.image_url?.startsWith('http')) {
        await supabase.from('product_images').insert({
          product_id: product.id, url: r.image_url,
          is_primary: true, position: 0, source: 'manual',
        })
      }

      results.push({ row: rowNum, name, status: 'created', sku: product.internal_sku })
      created++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ row: rowNum, name, status: 'error', error: msg })
      errors++
    }
  }

  return NextResponse.json({ created, errors, results })
}
