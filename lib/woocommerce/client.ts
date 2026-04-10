import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api'

// WooCommerce REST API v3 klient
export function createWooClient() {
  return new WooCommerceRestApi({
    url: process.env.WOO_BASE_URL!,
    consumerKey: process.env.WOO_CONSUMER_KEY!,
    consumerSecret: process.env.WOO_CONSUMER_SECRET!,
    version: 'wc/v3',
    queryStringAuth: false, // Brug Authorization header (HTTPS)
  })
}

// Hjælpefunktion til pagineret hentning af alle ressourcer
export async function fetchAllPages<T>(
  client: ReturnType<typeof createWooClient>,
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const results: T[] = []
  let page = 1
  let totalPages = 1

  do {
    const response = await client.get(endpoint, {
      ...params,
      per_page: 100,
      page,
    })

    results.push(...(response.data as T[]))

    // Læs total antal sider fra response headers
    const headers = response.headers as Record<string, string>
    totalPages = parseInt(headers['x-wp-totalpages'] || '1', 10)
    page++
  } while (page <= totalPages)

  return results
}
