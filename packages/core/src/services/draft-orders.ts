import { and, desc, eq, inArray } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { products, productVariants } from '../schema/products'
import { orderAddresses, orderEvents, orderLineItems, orderShippingMethods, orderTransactions, orders, type Order } from '../schema/orders'
import { createDraftOrderInput, completeDraftOrderInput, type CompleteDraftOrderInput, type CreateDraftOrderInput } from '../validation/orders'
import { createInventoryService } from './inventory'
import { resolveAdditionTaxesForAddress } from './order-pricing'
import type { PricingService } from './pricing'
import type { TaxService } from './tax'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

export interface DraftOrdersServiceContext extends ServiceContext {
  pricing: Pick<PricingService, 'calculatePrices'>
  tax: Pick<TaxService, 'getTaxLines'>
}

/**
 * Draft orders. NO separate model: a draft is a normal `order` with
 * `is_draft_order=true, status='draft'`. Admin creates it with catalogue lines
 * (price via the pricing service) or custom lines (free title + price), snapshots
 * addresses, and an optional shipping method. `complete` reserves inventory,
 * flips the two flags (conditional claim: `status='draft'` → 'pending'), and
 * optionally records a manual payment (order_transaction 'manual_payment',
 * append-only ledger), becoming a real payable order and emitting order.placed.
 * A draft never surfaces in the standard order lists (callers filter
 * `is_draft_order=false`).
 */
export function createDraftOrdersService(ctx: DraftOrdersServiceContext) {
  const { db, pricing, tax } = ctx

  async function get(id: string): Promise<Order | null> {
    const [row] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.isDraftOrder, true))).limit(1)
    return row ?? null
  }

  async function list({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.isDraftOrder, true)).orderBy(desc(orders.createdAt)).limit(limit).offset(offset)
  }

  async function create(input: CreateDraftOrderInput): Promise<Order> {
    const data = createDraftOrderInput.parse(input)

    // Resolve line prices outside the tx (catalogue lines via the pricing service; custom lines as given).
    const variantIds = data.items.map((i) => i.variantId).filter((v): v is string => !!v)
    const priced = variantIds.length ? await pricing.calculatePrices(variantIds, { currencyCode: data.currencyCode, regionId: data.regionId }) : new Map()
    const variantRows = variantIds.length
      ? await db.select({ id: productVariants.id, title: productVariants.title, sku: productVariants.sku, thumbnail: productVariants.thumbnail, productId: productVariants.productId }).from(productVariants).where(inArray(productVariants.id, variantIds))
      : []
    const variantById = new Map(variantRows.map((v) => [v.id, v]))
    const productIds = variantRows.map((v) => v.productId).filter((p): p is string => !!p)
    const productRows = productIds.length ? await db.select({ id: products.id, title: products.title, thumbnail: products.thumbnail }).from(products).where(inArray(products.id, productIds)) : []
    const productById = new Map(productRows.map((p) => [p.id, p]))

    const resolved = data.items.map((i) => {
      if (i.variantId) {
        const v = variantById.get(i.variantId)
        if (!v) throw new Error(`draft-orders: variant '${i.variantId}' not found`)
        const amount = priced.get(i.variantId)?.calculatedAmount
        const unitPrice = i.unitPrice ?? amount
        if (unitPrice == null) throw new Error(`draft-orders: no price for variant '${i.variantId}' in ${data.currencyCode}`)
        const p = v.productId ? productById.get(v.productId) : undefined
        return { variantId: i.variantId, productId: v.productId, title: i.title ?? p?.title ?? v.title, sku: v.sku, thumbnail: v.thumbnail ?? p?.thumbnail ?? null, unitPrice, quantity: i.quantity }
      }
      if (!i.title || i.unitPrice == null) throw new Error('draft-orders: a custom line needs a title and a unitPrice')
      return { variantId: null, productId: null, title: i.title, sku: i.sku ?? null, thumbnail: null, unitPrice: i.unitPrice, quantity: i.quantity }
    })

    // Real tax on every line, resolved outside the tx (the tax service holds its own db
    // handle; calling it inside the tx would deadlock the single connection).
    const addr = data.shippingAddress ?? null
    const addTax = await resolveAdditionTaxesForAddress(
      db,
      tax,
      addr ? { countryCode: (addr.countryCode as string) ?? null, province: (addr.province as string) ?? null } : null,
      resolved.map((r) => ({ variantId: r.variantId, unitPrice: r.unitPrice, quantity: r.quantity })),
    )

    return db.transaction(async (tx) => {
      const shippingAddressId = await snapshotAddress(tx, data.shippingAddress)
      const billingAddressId = await snapshotAddress(tx, data.billingAddress)
      const [order] = await tx
        .insert(orders)
        .values({
          id: pygId('ord'),
          regionId: data.regionId,
          customerId: data.customerId ?? null,
          salesChannelId: data.salesChannelId ?? null,
          email: data.email ?? null,
          currencyCode: data.currencyCode,
          status: 'draft',
          isDraftOrder: true,
          shippingAddressId,
          billingAddressId,
        })
        .returning()

      let itemsSubtotal = 0
      let taxTotal = 0
      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i]
        const subtotal = r.unitPrice * r.quantity
        const lineTax = addTax[i] ?? 0
        itemsSubtotal += subtotal
        taxTotal += lineTax
        await tx.insert(orderLineItems).values({
          id: pygId('oli'),
          orderId: order.id,
          productId: r.productId,
          variantId: r.variantId,
          title: r.title,
          sku: r.sku,
          thumbnail: r.thumbnail,
          unitPrice: r.unitPrice,
          quantity: r.quantity,
          subtotal,
          taxTotal: lineTax,
          total: subtotal + lineTax,
        })
      }

      let shippingTotal = 0
      if (data.shippingMethod) {
        shippingTotal = data.shippingMethod.amount
        await tx.insert(orderShippingMethods).values({
          id: pygId('osm'),
          orderId: order.id,
          shippingOptionId: data.shippingMethod.shippingOptionId ?? null,
          name: data.shippingMethod.name,
          amount: data.shippingMethod.amount,
          subtotal: data.shippingMethod.amount,
          total: data.shippingMethod.amount,
        })
      }

      const total = itemsSubtotal + taxTotal + shippingTotal
      const [withTotals] = await tx.update(orders).set({ itemsSubtotal, taxTotal, shippingTotal, total, updatedAt: new Date() }).where(eq(orders.id, order.id)).returning()
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: order.id, type: 'draft_order.created', payload: { total }, createdBy: data.createdBy ?? null })
      await emitDomainEvent(tx, 'draft-order.created', { orderId: order.id })
      return withTotals
    })
  }

  async function complete(orderId: string, input: CompleteDraftOrderInput = {}): Promise<Order> {
    const data = completeDraftOrderInput.parse(input)
    const [pre] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!pre) throw new Error(`draft-orders: '${orderId}' not found`)
    if (!pre.isDraftOrder || pre.status !== 'draft') throw new Error(`draft-orders: '${orderId}' is not a draft (status '${pre.status}')`)

    const order = await db.transaction(async (tx) => {
      // Conditional claim: only a still-draft order converts (serializes double-complete).
      const [claimed] = await tx
        .update(orders)
        .set({ status: 'pending', isDraftOrder: false, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'draft'), eq(orders.isDraftOrder, true)))
        .returning()
      if (!claimed) throw new Error(`draft-orders: '${orderId}' is not a draft (already completed or canceled)`)

      // Reserve stock for the variant-backed lines (single-warehouse MVP).
      const lines = await tx.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
      const reserveInput = lines.filter((l) => l.variantId).map((l) => ({ variantId: l.variantId!, quantity: l.quantity, lineItemId: l.id }))
      if (reserveInput.length) {
        const inv = createInventoryService({ db: tx })
        const [loc] = await inv.locations.list({ limit: 1 })
        if (loc) await inv.reserveVariants({ locationId: loc.id, items: reserveInput })
      }

      if (data.markPaid) {
        await tx.insert(orderTransactions).values({ id: pygId('ordtxn'), orderId, amount: claimed.total, currencyCode: claimed.currencyCode, reference: 'manual_payment', referenceId: null })
        await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'payment.manual', payload: { amount: claimed.total }, createdBy: data.createdBy ?? null })
      }
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'order.placed', payload: { fromDraft: true, total: claimed.total }, createdBy: data.createdBy ?? null })
      await emitDomainEvent(tx, 'order.placed', { orderId })
      return claimed
    })
    return order
  }

  async function cancel(orderId: string): Promise<Order> {
    const [pre] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!pre) throw new Error(`draft-orders: '${orderId}' not found`)
    if (pre.status === 'canceled') return pre
    const [row] = await db
      .update(orders)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'draft'), eq(orders.isDraftOrder, true)))
      .returning()
    if (!row) throw new Error(`draft-orders: '${orderId}' is not a cancelable draft`)
    await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'draft_order.canceled', payload: {} })
    return row
  }

  return { create, complete, cancel, get, list }
}

export type DraftOrdersService = ReturnType<typeof createDraftOrdersService>

const ADDRESS_FIELDS = ['firstName', 'lastName', 'company', 'address1', 'address2', 'city', 'countryCode', 'province', 'postalCode', 'phone'] as const

async function snapshotAddress(tx: PygmalionDatabase, addr: Record<string, unknown> | null | undefined): Promise<string | null> {
  if (!addr) return null
  const values: Record<string, string | null> = {}
  let any = false
  for (const f of ADDRESS_FIELDS) {
    const v = addr[f]
    values[f] = typeof v === 'string' && v ? v : null
    if (values[f]) any = true
  }
  if (!any) return null
  const [row] = await tx.insert(orderAddresses).values({ id: pygId('oaddr'), ...values }).returning()
  return row.id
}
