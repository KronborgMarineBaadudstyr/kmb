// Læser gamle salgsbilag (fakturaer fra det tidligere system, "Salgsbilag.pdf") — én faktura pr. side,
// en faktura kan fortsætte på flere sider ("Side 2"). Ren funktion: input er tekststykker med placering
// (fra pdf.js i browseren), output er strukturerede ordrer + advarsler. Ingen server- eller browserkode.
//
// Siden: kundens adresse øverst til venstre, "Leveringsadresse:" under, felter til højre
// (Faktura FAK00001, Kundenr., Ordrenr., Bilagsdato …) og en tabel Varenr. | Beskrivelse | Antal | Pris | Rabat | Beløb
// efterfulgt af "Total DKK inkl. moms" og "Moms udgør 25% af …".

export type TextItem = { str: string; x: number; y: number; w: number }   // x/y = nederste venstre hjørne (PDF-punkter, y opad)

export type InvoiceLine = {
  sku:      string | null
  name:     string
  qty:      number
  price:    number
  discount: number | null
  amount:   number
}

export type ParsedInvoice = {
  invoice:         string            // FAK00001
  order_ref:       string | null     // ORD00007
  customer_number: string | null     // Kundenr. — ofte kundens telefonnummer
  date:            string | null     // YYYY-MM-DD (Bilagsdato)
  customer: {
    name:     string | null
    company:  string | null
    address:  string | null
    postcode: string | null
    city:     string | null
    phone:    string | null           // +45xxxxxxxx, kun hvis Kundenr. ligner et dansk telefonnummer
  }
  delivery:        { name: string | null; address: string | null; postcode: string | null; city: string | null } | null
  lines:           InvoiceLine[]     // varer
  shipping:        { name: string; amount: number } | null
  shipping_method: 'pickup' | 'delivery'
  total:           number | null
  vat:             number | null
  pages:           number[]
  warnings:        string[]
}

const SHIPPING_RE = /levering|omdeling|afhentning|fragt|forsendelse|pakkeshop|gls|postnord|dao|bring/i

// Dansk talformat: "1.689,00" → 1689, "-50,00" → -50
export function parseDanishNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '')
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// "27-03-24" → "2024-03-27"
export function parseShortDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/)
  if (!m) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])))
  return d.getUTCDate() === Number(m[1]) ? d.toISOString().slice(0, 10) : null
}

// Kundenr. som telefonnummer: 8 cifre, evt. med 45/+45 foran
export function phoneFromCustomerNumber(s: string | null): string | null {
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (/^\d{8}$/.test(digits) && /^[2-9]/.test(digits)) return `+45${digits}`
  if (/^45\d{8}$/.test(digits) && (s.trim().startsWith('+') || s.trim().startsWith('45'))) return `+${digits}`
  return null
}

type Line = { y: number; items: TextItem[]; text: string }

// Saml tekststykker i linjer (samme y ± 2 punkter), sorteret oppefra og ned, venstre mod højre
function toLines(items: TextItem[]): Line[] {
  const sorted = items.filter(i => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it)
    else lines.push({ y: it.y, items: [it], text: '' })
  }
  for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.str.trim()).join(' ') }
  return lines
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

// Adresseblok → navn, firma, adresse, postnr., by. Postnr.-linjen er "dddd By"
function splitAddress(block: string[]) {
  const postIdx = block.findIndex(l => /^\d{4}\s+\S/.test(l))
  const before = postIdx >= 0 ? block.slice(0, postIdx) : block
  const post = postIdx >= 0 ? block[postIdx].match(/^(\d{4})\s+(.+)$/) : null
  return { first: before[0] ?? null, rest: before.slice(1), postcode: post?.[1] ?? null, city: post ? clean(post[2]) : null }
}

type PageResult = Omit<ParsedInvoice, 'pages'> & { page: number; sideNo: number; hasTotal: boolean }

function parsePage(items: TextItem[], pageNo: number): PageResult | null {
  const lines = toLines(items)
  const warnings: string[] = []
  const all = items.filter(i => i.str.trim())

  // Højre side: etiket → værdi (værdien står på samme linje, til højre for etiketten)
  const field = (label: RegExp): string | null => {
    const lab = all.find(i => label.test(i.str.trim()))
    if (!lab) return null
    const val = all.filter(i => Math.abs(i.y - lab.y) <= 2 && i.x > lab.x + lab.w + 2).sort((a, b) => a.x - b.x)[0]
    return val ? val.str.trim() : null
  }
  const invoiceItem = all.find(i => /^FAK\d+$/i.test(i.str.trim()))
  if (!invoiceItem) return null                                   // ikke en fakturaside
  const sideItem = all.find(i => /^Side\s+\d+$/i.test(i.str.trim()))
  const sideNo = sideItem ? Number(sideItem.str.trim().split(/\s+/)[1]) : 1

  // Tabellens kolonner ud fra overskrifterne
  const header = lines.find(l => /^Varenr\.?$/i.test(l.items[0]?.str.trim() ?? '') && /Beløb/i.test(l.text))
  const col = (re: RegExp) => header?.items.find(i => re.test(i.str.trim()))
  const hVarenr = col(/^Varenr/i), hDesc = col(/^Beskrivelse/i)
  const numCols = (['Antal', 'Pris', 'Rabat', 'Beløb'] as const)
    .map(name => ({ name, it: col(new RegExp(`^${name}$`, 'i')) }))
    .filter((c): c is { name: typeof c.name; it: TextItem } => !!c.it)
    .map(c => ({ name: c.name, right: c.it.x + c.it.w }))

  // Venstre side over tabellen: kundens adresse, derefter "Leveringsadresse:"
  const leftLimit = (hDesc?.x ?? 100) + 230
  const headerY = header?.y ?? 0
  const leftLines = lines
    .filter(l => l.y > headerY + 5)
    .map(l => clean(l.items.filter(i => i.x < Math.min(leftLimit, 300)).map(i => i.str).join(' ')))
    .filter(Boolean)
  const delivIdx = leftLines.findIndex(l => /^Leveringsadresse/i.test(l))
  const billing = delivIdx >= 0 ? leftLines.slice(0, delivIdx) : leftLines
  const delivery = delivIdx >= 0 ? leftLines.slice(delivIdx + 1) : []

  // Varelinjer: under overskriften, indtil "Total"
  const result: InvoiceLine[] = []
  let shipping: ParsedInvoice['shipping'] = null
  let total: number | null = null, vat: number | null = null, hasTotal = false
  for (const l of lines.filter(l => header && l.y < headerY - 2)) {
    if (/Total\s+DKK/i.test(l.text)) {
      hasTotal = true
      total = parseDanishNumber(l.items[l.items.length - 1].str)
      continue
    }
    if (/^Moms\s+udgør/i.test(l.text) || /Moms udgør/i.test(l.text)) { vat = parseDanishNumber(l.items[l.items.length - 1].str); continue }
    if (hasTotal) continue
    const descStart = hDesc ? hDesc.x - 3 : 100
    const firstNumX = numCols.length ? Math.min(...numCols.map(c => c.right)) - 40 : 380
    const skuItems = l.items.filter(i => i.x < descStart)
    const descItems = l.items.filter(i => i.x >= descStart && i.x + i.w < firstNumX)
    const numItems = l.items.filter(i => i.x + i.w >= firstNumX && i.x >= descStart)
    const values: Partial<Record<'Antal' | 'Pris' | 'Rabat' | 'Beløb', number>> = {}
    for (const n of numItems) {
      const v = parseDanishNumber(n.str)
      if (v == null || !numCols.length) continue
      const right = n.x + n.w
      const c = numCols.reduce((a, b) => (Math.abs(b.right - right) < Math.abs(a.right - right) ? b : a))
      values[c.name] = v
    }
    const name = clean(descItems.map(i => i.str).join(' '))
    const sku = clean(skuItems.map(i => i.str).join(' ')) || null
    if (!name && !sku) continue
    if (values['Beløb'] == null && values['Antal'] == null) {
      // Fortsat beskrivelse på næste linje (lang tekst brudt over to linjer)
      const prev = result[result.length - 1]
      if (prev && name && !sku) { prev.name = clean(`${prev.name} ${name}`); continue }
      warnings.push(`Side ${pageNo}: kunne ikke læse linjen "${clean(l.text)}"`)
      continue
    }
    const qty = values['Antal'] ?? 1
    const amount = values['Beløb'] ?? Math.round(qty * (values['Pris'] ?? 0) * 100) / 100
    const line: InvoiceLine = { sku, name: name || sku || '', qty, price: values['Pris'] ?? (qty ? amount / qty : amount), discount: values['Rabat'] ?? null, amount }
    if (!sku && SHIPPING_RE.test(line.name)) {
      shipping = shipping ? { name: `${shipping.name} + ${line.name}`, amount: shipping.amount + amount } : { name: line.name, amount }
    } else {
      result.push(line)
    }
  }
  if (!header) warnings.push(`Side ${pageNo}: fandt ikke tabellens overskrift (Varenr. … Beløb)`)

  const customerNumber = field(/^Kundenr\.?$/i)
  const b = splitAddress(billing)
  const d = splitAddress(delivery)
  // Står der en ekstra linje i kundens adresse, som ikke er i leveringsadressen, er det typisk en kontaktperson (første linje = firma)
  const extra = b.rest.filter(r => !d.rest.includes(r) && r !== d.first)
  const hasPerson = delivery.length > 0 && extra.length > 0 && b.first === d.first
  const name = hasPerson ? extra[0] : b.first
  const company = hasPerson ? b.first : null
  const addrLines = (hasPerson ? b.rest.filter(r => r !== extra[0]) : b.rest)
  const phone = phoneFromCustomerNumber(customerNumber)
  const date = parseShortDate(field(/^Bilagsdato$/i) ?? '')
  if (!date) warnings.push(`Side ${pageNo}: bilagsdato mangler eller kan ikke læses`)

  return {
    invoice: invoiceItem.str.trim().toUpperCase(),
    order_ref: field(/^Ordrenr\.?$/i),
    customer_number: customerNumber,
    date,
    customer: { name, company, address: addrLines.length ? addrLines.join(', ') : null, postcode: b.postcode, city: b.city, phone },
    delivery: delivery.length ? { name: d.first, address: d.rest.length ? d.rest.join(', ') : null, postcode: d.postcode, city: d.city } : null,
    lines: result,
    shipping,
    shipping_method: shipping && /afhent/i.test(shipping.name) ? 'pickup' : 'delivery',
    total, vat,
    warnings,
    page: pageNo, sideNo, hasTotal,
  }
}

// Alle sider → fakturaer. Sider med samme fakturanummer (Side 2, 3 …) lægges sammen.
export function parseInvoicePages(pages: TextItem[][]): { invoices: ParsedInvoice[]; skippedPages: number[] } {
  const invoices: ParsedInvoice[] = []
  const skippedPages: number[] = []
  pages.forEach((items, idx) => {
    const r = parsePage(items, idx + 1)
    if (!r) { skippedPages.push(idx + 1); return }
    const prev = invoices[invoices.length - 1]
    if (prev && prev.invoice === r.invoice) {
      prev.lines.push(...r.lines)
      prev.pages.push(r.page)
      prev.warnings.push(...r.warnings)
      if (r.shipping) prev.shipping = r.shipping
      if (r.hasTotal) { prev.total = r.total; prev.vat = r.vat }
      if (r.shipping) prev.shipping_method = r.shipping_method
      return
    }
    const { page, sideNo: _s, hasTotal: _h, ...inv } = r
    invoices.push({ ...inv, pages: [page] })
  })
  // Kontrol: varelinjer + fragt skal give totalen
  for (const inv of invoices) {
    const sum = inv.lines.reduce((s, l) => s + l.amount, 0) + (inv.shipping?.amount ?? 0)
    if (inv.total == null) inv.warnings.push('Total mangler')
    else if (Math.abs(sum - inv.total) > 0.05) inv.warnings.push(`Linjerne giver ${sum.toFixed(2)} kr, men totalen er ${inv.total.toFixed(2)} kr`)
    if (inv.lines.length === 0) inv.warnings.push('Ingen varelinjer fundet')
    if (!inv.customer.phone) inv.warnings.push(`Intet telefonnummer (Kundenr. ${inv.customer_number ?? '—'}) — ordren kan ikke knyttes til en kundekonto`)
  }
  return { invoices, skippedPages }
}
