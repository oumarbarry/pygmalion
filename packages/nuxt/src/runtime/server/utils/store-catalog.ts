import { getQuery, type H3Event } from 'h3'
import { usePygmalion } from './pygmalion'

/**
 * Storefront variants WITH their calculated price: a store product detail
 * that returns the product row alone has no variant, therefore no
 * `variantId` to POST to `/store/carts/:id/line-items`, and no price to show.
 *
 * Currency resolution mirrors the cart's: explicit `currency_code`, else the
 * region's currency (`region_id`). Neither given → variants without price
 * (`calculatedPrice: null`) rather than an error: a catalogue page with no
 * region context still renders.
 */
async function priceContext(event: H3Event): Promise<{ regionId?: string; currencyCode?: string }> {
  const { services } = usePygmalion()
  const query = getQuery(event)
  const regionId = typeof query.region_id === 'string' && query.region_id ? query.region_id : undefined
  let currencyCode = typeof query.currency_code === 'string' && query.currency_code ? query.currency_code : undefined
  if (!currencyCode && regionId) {
    const region = await services.regions.get(regionId)
    currencyCode = region?.currencyCode
  }
  return { regionId, currencyCode }
}

export async function storeVariants(event: H3Event, productId: string) {
  const { services } = usePygmalion()
  const { regionId, currencyCode } = await priceContext(event)

  const variants = await services.products.variants.list(productId)
  if (!currencyCode || !variants.length) return variants.map((v) => ({ ...v, calculatedPrice: null }))

  const prices = await services.pricing.calculatePrices(
    variants.map((v) => v.id),
    { currencyCode, regionId },
    { entity: 'variant' },
  )
  return variants.map((v) => ({ ...v, calculatedPrice: prices.get(v.id) ?? null }))
}

/**
 * The same price resolution for a LIST of products: a catalogue grid has
 * to print a price under every card, and doing it card by card is one HTTP
 * round-trip per product. Opt-in: without `region_id`/`currency_code` the
 * products come back exactly as before, so nothing that already reads these
 * routes changes shape.
 *
 * Two queries total whatever the page size: one bulk variant read, one
 * `calculatePrices` over every variant id at once.
 */
export async function withStoreVariants<T extends { id: string }>(event: H3Event, products: T[]) {
  const { services } = usePygmalion()
  const { regionId, currencyCode } = await priceContext(event)
  if (!currencyCode || !products.length) return products

  const byProduct = await services.products.variants.listForProducts(products.map((p) => p.id))
  const variantIds = [...byProduct.values()].flat().map((v) => v.id)
  const prices = await services.pricing.calculatePrices(variantIds, { currencyCode, regionId }, { entity: 'variant' })
  return products.map((p) => ({
    ...p,
    variants: (byProduct.get(p.id) ?? []).map((v) => ({ ...v, calculatedPrice: prices.get(v.id) ?? null })),
  }))
}
