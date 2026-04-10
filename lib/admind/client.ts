// ============================================================
// admind.dk POS API klient — STUB
// Implementeres når API dokumentation og credentials foreligger
// ============================================================

export type AdmindProduct = {
  id: string
  sku: string
  name: string
  price: number
  stock_quantity: number
  // Udvides når API specs kendes
}

export type AdmindSaleEvent = {
  order_id: string
  items: { sku: string; quantity: number }[]
  timestamp: string
}

export class AdmindClient {
  private apiUrl: string
  private apiKey: string

  constructor() {
    this.apiUrl = process.env.ADMIND_API_URL || ''
    this.apiKey = process.env.ADMIND_API_KEY || ''
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey)
  }

  // Push et produkt til admind POS
  async upsertProduct(_product: Partial<AdmindProduct>): Promise<void> {
    if (!this.isConfigured()) {
      console.log('[admind] STUB: upsertProduct kaldt — API ikke konfigureret endnu')
      return
    }
    // TODO: Implementér når admind API specs foreligger
    throw new Error('admind API ikke implementeret endnu')
  }

  // Opdatér lagerbeholdning i admind POS
  async updateStock(_sku: string, _quantity: number): Promise<void> {
    if (!this.isConfigured()) {
      console.log('[admind] STUB: updateStock kaldt — API ikke konfigureret endnu')
      return
    }
    // TODO: Implementér når admind API specs foreligger
    throw new Error('admind API ikke implementeret endnu')
  }

  // Hent salg siden et givet tidspunkt (til lager-sync)
  async getSalesSince(_since: Date): Promise<AdmindSaleEvent[]> {
    if (!this.isConfigured()) {
      console.log('[admind] STUB: getSalesSince kaldt — API ikke konfigureret endnu')
      return []
    }
    // TODO: Implementér når admind API specs foreligger
    throw new Error('admind API ikke implementeret endnu')
  }
}

export function createAdmindClient() {
  return new AdmindClient()
}
