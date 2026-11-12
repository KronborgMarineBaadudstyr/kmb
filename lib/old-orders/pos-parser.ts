// Læser kassejournalen fra det gamle kassesystem ("Salg_Kronborg"-udtræk, semikolon-separeret, UTF-8).
// Kan være delt i flere filer — kun første fil har overskriftslinjen.
//
// Kolonner: EntryNo;CustNo;Date;Time;DocType;DocNo;ItemNo;ItemGrpCode;Quantity;Description;VariantCode;RefNo;
//           UnitPrice;UnitPriceFixed;DiscountPct;DiscountAmount;Amount;VatIncluded;VatPct;VatAmount;EmpNo;EmpName;
//           DepartmentNo;RegistryNo;PayNo;PayExchange;PayFee
// Én bon (DocNo) = varelinjer (ItemNo udfyldt) + betalingslinje(r) (ItemNo tom, Description = Dankort/Kontant …).
// DocType 3 = kassebon (1-000001), 1 = faktura (FAK…), 2 = kreditnota (KRE…). Returer = linjer med negativt antal.
// Ren funktion — bruges i browseren (filerne er for store til upload) og i tests.

export type PosLine = {
  item_no:  string
  group:    string | null       // ItemGrpCode — ofte leverandøren (PALBY, COLUMBUS, ENGHOLM …)
  name:     string
  variant:  string | null
  qty:      number
  price:    number               // enhedspris inkl. moms
  discount: number | null        // rabat i kr for linjen
  amount:   number               // linjebeløb inkl. moms
}

export type PosReceipt = {
  doc_no:        string           // 1-000001 / FAK00003 / KRE00012
  doc_type:      'receipt' | 'invoice' | 'credit'
  local_time:    string           // YYYY-MM-DDTHH:MM (dansk tid)
  customer_no:   string | null
  phone:         string | null    // +45… hvis kundenummeret ligner et telefonnummer
  payments:      string[]         // Dankort, VISA, Kontant …
  lines:         PosLine[]
  total:         number
}

export type PosParseResult = {
  receipts: PosReceipt[]
  rows:     number
  badRows:  number
  from:     string | null
  to:       string | null
}

// Semikolon-CSV med "citerede" felter ("" = anførselstegn)
export function parseCsvLine(line: string, sep = ';'): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

const num = (s: string | undefined): number | null => {
  const t = (s ?? '').trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// "0022880626" → "+4522880626"; initialer ("HAS") og korte numre → null
export function phoneFromPosCustomer(s: string | null): string | null {
  const d = (s ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (/^[2-9]\d{7}$/.test(d)) return `+45${d}`
  if (/^45[2-9]\d{7}$/.test(d)) return `+${d}`
  return null
}

const DOC_TYPE: Record<string, PosReceipt['doc_type']> = { '1': 'invoice', '2': 'credit', '3': 'receipt' }

export function parsePosCsv(texts: string[]): PosParseResult {
  let header: string[] | null = null
  const docs = new Map<string, PosReceipt>()
  let rows = 0, badRows = 0
  let from: string | null = null, to: string | null = null

  for (const text of texts) {
    const lines = text.split(/\r?\n/)
    for (const raw of lines) {
      if (!raw.trim()) continue
      const cells = parseCsvLine(raw)
      if (cells[0] === 'EntryNo') { header = cells; continue }
      if (!header) { badRows++; continue }                  // første fil skal have overskriften
      const r: Record<string, string> = {}
      header.forEach((h, i) => { r[h] = (cells[i] ?? '').trim() })
      rows++
      const docNo = r.DocNo
      const m = r.Date.match(/^(\d{2})-(\d{2})-(\d{4})$/)
      if (!docNo || !m) { badRows++; continue }
      const local = `${m[3]}-${m[2]}-${m[1]}T${/^\d{2}:\d{2}$/.test(r.Time) ? r.Time : '12:00'}`
      if (!from || local < from) from = local
      if (!to || local > to) to = local

      let doc = docs.get(docNo)
      if (!doc) {
        doc = {
          doc_no: docNo, doc_type: DOC_TYPE[r.DocType] ?? 'receipt', local_time: local,
          customer_no: r.CustNo || null, phone: phoneFromPosCustomer(r.CustNo || null),
          payments: [], lines: [], total: 0,
        }
        docs.set(docNo, doc)
      }
      if (!doc.customer_no && r.CustNo) { doc.customer_no = r.CustNo; doc.phone = phoneFromPosCustomer(r.CustNo) }

      if (r.ItemNo) {
        const qty = num(r.Quantity) ?? 1
        const amount = num(r.Amount) ?? 0
        const line: PosLine = {
          item_no: r.ItemNo, group: r.ItemGrpCode || null, name: r.Description || r.ItemNo,
          variant: r.VariantCode || null, qty, price: num(r.UnitPrice) ?? (qty ? amount / qty : amount),
          discount: num(r.DiscountAmount) || null, amount,
        }
        doc.lines.push(line)
        doc.total = Math.round((doc.total + amount) * 100) / 100
      } else if (r.Description && !doc.payments.includes(r.Description)) {
        doc.payments.push(r.Description)
      }
    }
  }
  return { receipts: [...docs.values()].filter(d => d.lines.length > 0), rows, badRows, from, to }
}
