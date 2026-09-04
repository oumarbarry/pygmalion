import { eq, sql } from 'drizzle-orm'
import * as schema from '../schema'
import { inventoryLevels, reservationItems } from '../schema/inventory'
import type { PygmalionDatabase } from '../db/types'
import { createCurrenciesService } from './currencies'
import { createRegionsService } from './regions'
import { createProductsService } from './products'
import { createPricingService } from './pricing'
import { createInventoryService } from './inventory'
import { createSystemTaxProvider, createTaxRatesService, createTaxRegionsService, createTaxService, type TaxProvider, type TaxProviderRegistry } from './tax'
import { createShippingService } from './shipping'
import { createCartService } from './cart'
import { createManualPaymentProvider, createPaymentService, type PaymentProvider, type PaymentProviderRegistry } from './payment'
import { createCheckoutService } from './checkout'
import { createFulfillmentsService } from './fulfillments'
import { createReturnsService } from './returns'
import { createExchangesService } from './exchanges'
import { createClaimsService } from './claims'
import { createDraftOrdersService } from './draft-orders'
import { createOrderEditsService } from './order-edits'

// Shared test-only fixture for the RMA suites (returns/exchanges/claims/drafts).
// Builds the full service stack against a PGlite db and can place a real order
// through checkout, capture it, and fulfill+ship it so returns operate on
// genuine SHIPPED order lines with reservations.

function taxRegistry(providers: Record<string, TaxProvider>): TaxProviderRegistry {
  return { get: <T>(_t: 'tax', id: string): T => providers[id] as unknown as T }
}
function paymentRegistry(provider: PaymentProvider): PaymentProviderRegistry {
  return { get: () => provider }
}

export function makeStack(db: PygmalionDatabase) {
  const providers = taxRegistry({ system: createSystemTaxProvider() })
  const paymentProviders = paymentRegistry(createManualPaymentProvider())
  const pricing = createPricingService({ db })
  const shipping = createShippingService({ db, pricing, providers: { get: () => { throw new Error('no fulfillment provider') } } })
  const cart = createCartService({ db, pricing, providers, shipping })
  const payment = createPaymentService({ db, providers: paymentProviders })
  const checkout = createCheckoutService({ db, providers: paymentProviders, cart })
  const fulfillments = createFulfillmentsService({ db })
  const tax = createTaxService({ db, providers })
  const returns = createReturnsService({ db, checkout })
  const exchanges = createExchangesService({ db, checkout, tax })
  const claims = createClaimsService({ db, checkout, tax })
  const draftOrders = createDraftOrdersService({ db, pricing, tax })
  const orderEdits = createOrderEditsService({ db, tax })
  const inventory = createInventoryService({ db })
  const currencies = createCurrenciesService({ db })
  const regions = createRegionsService({ db })
  const products = createProductsService({ db })
  const taxRegions = createTaxRegionsService({ db, providers })
  const taxRates = createTaxRatesService({ db })
  return { db, pricing, cart, payment, checkout, orderEdits, fulfillments, tax, returns, exchanges, claims, draftOrders, inventory, currencies, regions, products, taxRegions, taxRates }
}

export type Stack = ReturnType<typeof makeStack>

export interface SeededVariant {
  variantId: string
  inventoryItemId: string
}

/** Seed a region (10% US tax), a location, and `n` priced variants each with `stock` units. */
export async function seedCatalog(s: Stack, { unitPrice = 1000, stock = 10, variants = 1, tax = true } = {}) {
  await s.currencies.seed()
  const regionId = (await s.regions.create({ name: 'NA', currencyCode: 'usd' })).id
  if (tax) {
    const tr = await s.taxRegions.create({ countryCode: 'US' })
    await s.taxRates.create({ taxRegionId: tr.id, code: 'STD', name: 'Standard', rate: 10, isDefault: true })
  }
  const loc = await s.inventory.locations.create({ name: 'Main' })
  const seeded: SeededVariant[] = []
  for (let i = 0; i < variants; i++) {
    const product = await s.products.create({ title: `P${i}`, status: 'published' })
    const variantId = (await s.products.variants.create(product.id, { title: 'Default', sku: `SKU-${i}-${Math.random().toString(36).slice(2, 7)}` })).id
    await s.pricing.batchPrices({ create: [{ variantId, currencyCode: 'usd', amount: unitPrice }] })
    const item = await s.inventory.items.create({ sku: `II-${i}-${Math.random().toString(36).slice(2, 7)}` })
    await s.inventory.items.linkVariant(variantId, { inventoryItemId: item.id })
    await s.inventory.levels.upsert(item.id, loc.id, { stockedQuantity: stock })
    seeded.push({ variantId, inventoryItemId: item.id })
  }
  return { regionId, locationId: loc.id, variants: seeded }
}

/** Place an order for `qty` of the first seeded variant; optionally capture + fulfill + ship it. */
export async function placeOrder(
  s: Stack,
  ctx: { regionId: string; variantId: string },
  qty: number,
  opts: { capture?: boolean; fulfill?: boolean; ship?: boolean } = {},
) {
  const c = await s.cart.create({ regionId: ctx.regionId })
  await s.cart.addItem(c.id, { variantId: ctx.variantId, quantity: qty })
  await s.cart.setAddresses(c.id, { shippingAddress: { countryCode: 'US', city: 'Austin' } })
  const [{ total }] = await s.db.select({ total: schema.carts.total }).from(schema.carts).where(eq(schema.carts.id, c.id))
  const collection = await s.payment.collections.create({ cartId: c.id, amount: total, currencyCode: 'usd' })
  await s.payment.sessions.create({ collectionId: collection.id, providerId: 'manual' })
  const { order } = await s.checkout.completeCart(c.id)
  const [line] = await s.db.select().from(schema.orderLineItems).where(eq(schema.orderLineItems.orderId, order.id))

  if (opts.capture) await s.checkout.captureOrder(order.id, {})
  let fulfillmentId: string | undefined
  if (opts.fulfill || opts.ship) {
    const { fulfillment } = await s.fulfillments.create(order.id, { items: [{ lineItemId: line.id, quantity: qty }] })
    fulfillmentId = fulfillment.id
    if (opts.ship) await s.fulfillments.ship(fulfillment.id, {})
  }
  return { orderId: order.id, lineItemId: line.id, fulfillmentId, total }
}

export async function stockedQty(db: PygmalionDatabase, inventoryItemId: string) {
  const [row] = await db.select().from(inventoryLevels).where(eq(inventoryLevels.inventoryItemId, inventoryItemId)).limit(1)
  return row?.stockedQuantity ?? 0
}
export async function reservedQty(db: PygmalionDatabase, inventoryItemId: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${reservationItems.quantity}), 0)::int` })
    .from(reservationItems)
    .where(eq(reservationItems.inventoryItemId, inventoryItemId))
  return row?.total ?? 0
}
