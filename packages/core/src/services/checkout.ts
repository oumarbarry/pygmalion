import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { cartLineItems, cartShippingMethods, carts } from '../schema/cart'
import { reservationItems, stockLocations } from '../schema/inventory'
import {
  fulfillments,
  orderAddresses,
  orderEvents,
  orderLineItems,
  orderShippingMethods,
  orderTransactions,
  orders,
  type Order,
} from '../schema/orders'
import { paymentCollections, paymentSessions, payments } from '../schema/payment'
import { collectionAmounts, insertAuthorization, insertCapture, insertRefund, orderCollectionAmounts, paymentCapturedRefunded, type PaymentProviderRegistry } from './payment'
import { createInventoryService } from './inventory'
import type { CartService } from './cart'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

// Checkout: complete cart -> order. External calls never run inside a transaction:
//   TX1 (revalidate + reserve stock + order `pending`) → COMMIT
//   → authorize payment outside any transaction
//   → TX2 finalize (session authorized, payment, order.placed)
//      OR TX2' compensate (cancel order + release reservations, 100% DB) +
//      best-effort void of any external hold, logged to order_event.
// No external call is ever made inside an open transaction; capture never
// happens before commit (recommended mode: manual capture at shipment).

export interface CheckoutServiceContext extends ServiceContext {
  providers: PaymentProviderRegistry
  // Only `recalcTaxes` — used to revalidate promos/tax/totals before TX1
  // (its own transaction, outside TX1). Bound to the plain `db` handle, so it is
  // called OUTSIDE the transactions this service opens (same reasoning as the
  // cart service's tax/pricing deep-module deps).
  cart: Pick<CartService, 'recalcTaxes'>
}

export type CompleteStatus = 'authorized' | 'error' | 'already_complete'

/** Thrown inside TX1 when the conditional cart freeze matches 0 rows — another
 * concurrent (or prior) completion already froze this cart. Caught by
 * `completeCart` to replay the idempotent path. */
class CartCompletionRace extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function createCheckoutService(ctx: CheckoutServiceContext) {
  const { db, providers } = ctx

  async function getOrder(orderId: string) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order) return null
    const items = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId)).orderBy(asc(orderLineItems.createdAt))
    const shippingMethods = await db.select().from(orderShippingMethods).where(eq(orderShippingMethods.orderId, orderId))
    const transactions = await db.select().from(orderTransactions).where(eq(orderTransactions.orderId, orderId)).orderBy(asc(orderTransactions.createdAt))
    // Aggregated over EVERY collection of the order: an order edit that
    // raises the total, or a positive exchange difference, opens an additional
    // collection — the derived status must see them all.
    const raw = await orderCollectionAmounts(db, orderId)
    // Manual payments (draft markPaid) exist only on the append-only
    // ledger — fold them in or a marked-paid draft derives as unpaid.
    const manualPaid = transactions.filter((t) => t.reference === 'manual_payment').reduce((a, t) => a + t.amount, 0)
    const amounts = {
      authorizedAmount: raw.authorizedAmount + manualPaid,
      capturedAmount: raw.capturedAmount + manualPaid,
      refundedAmount: raw.refundedAmount,
    }
    const collections = await db
      .select()
      .from(paymentCollections)
      .where(eq(paymentCollections.orderId, orderId))
      .orderBy(asc(paymentCollections.createdAt))
    // Hydrated addresses: the ids alone would leave the order sheet
    // address-less, which no merchant can ship from.
    const addressIds = [order.shippingAddressId, order.billingAddressId].filter((v): v is string => !!v)
    const addressRows = addressIds.length
      ? await db.select().from(orderAddresses).where(inArray(orderAddresses.id, addressIds))
      : []
    const addressById = new Map(addressRows.map((a) => [a.id, a]))
    return {
      ...order,
      items,
      shippingMethods,
      transactions,
      shippingAddress: order.shippingAddressId ? addressById.get(order.shippingAddressId) ?? null : null,
      billingAddress: order.billingAddressId ? addressById.get(order.billingAddressId) ?? null : null,
      // Every collection of the order (the original + any additional one opened
      // by an edit/exchange) — how the admin finds what is left to collect.
      paymentCollections: collections,
      ...amounts,
      paymentStatus: derivePaymentStatus({
        target: order.total,
        canceled: order.status === 'canceled',
        ...amounts,
      }),
    }
  }

  /**
   * Standard order list, EXCLUDES draft orders by default (a draft never
   * surfaces in the normal order lists). Scoped to a customer when
   * `customerId` is given (storefront "my orders").
   */
  async function listOrders(opts: { customerId?: string; isDraft?: boolean; q?: string; status?: string; limit?: number; offset?: number } = {}): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(and(...orderListConditions(opts)))
      .orderBy(desc(orders.createdAt))
      .limit(opts.limit ?? 20)
      .offset(opts.offset ?? 0)
  }

  /** Same filters as `listOrders` — the admin list pairs them for pagination. */
  async function countOrders(opts: { customerId?: string; isDraft?: boolean; q?: string; status?: string } = {}): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(...orderListConditions(opts)))
    return row?.count ?? 0
  }

  /** Order audit journal (before/after amounts of every financial mutation), newest first. */
  async function listOrderEvents(orderId: string, { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) {
    return db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.createdAt), desc(orderEvents.id))
      .limit(limit)
      .offset(offset)
  }

  function orderListConditions(opts: { customerId?: string; isDraft?: boolean; q?: string; status?: string }) {
    const conditions = [eq(orders.isDraftOrder, opts.isDraft ?? false)]
    if (opts.customerId) conditions.push(eq(orders.customerId, opts.customerId))
    if (opts.status) conditions.push(eq(orders.status, opts.status))
    if (opts.q) {
      const found = or(ilike(orders.email, `%${opts.q}%`), ilike(orders.id, `%${opts.q}%`))
      if (found) conditions.push(found)
    }
    return conditions
  }

  async function findOrderByCart(cartId: string): Promise<Order | null> {
    // Newest NON-canceled order for the cart: a cart may carry several orders
    // (a refused authorize cancels one, the retry places another — orders.cartId
    // is a non-unique FK). Idempotent replay must return the live order, never
    // a canceled one.
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.cartId, cartId), isNull(orders.canceledAt)))
      .orderBy(desc(orders.createdAt))
      .limit(1)
    return order ?? null
  }

  async function completeCart(cartId: string): Promise<{ order: Order; status: CompleteStatus }> {
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId)).limit(1)
    if (!cart) throw new Error('checkout: cart not found')

    // --- Fast path (common replay): an already-completed cart returns its
    // existing order, NO new reservation or authorization. A
    // frozen cart with no order yet = a concurrent completion in flight — fall
    // through; the conditional freeze in TX1 is the authoritative guard.
    if (cart.completedAt) {
      const existing = await findOrderByCart(cartId)
      if (existing) return { order: existing, status: 'already_complete' }
    }

    const items = await db.select().from(cartLineItems).where(eq(cartLineItems.cartId, cartId))
    if (!items.length) throw new Error('checkout: cart is empty')

    // Newest NON-canceled collection: a retry after a failed authorize creates
    // a fresh collection+session; complete must use that one, not the stale
    // (canceled, session-error) one from the failed attempt.
    const [collection] = await db
      .select()
      .from(paymentCollections)
      .where(and(eq(paymentCollections.cartId, cartId), ne(paymentCollections.status, 'canceled')))
      .orderBy(desc(paymentCollections.createdAt))
      .limit(1)
    if (!collection) throw new Error('checkout: no payment collection for this cart')
    const [session] = await db.select().from(paymentSessions).where(eq(paymentSessions.paymentCollectionId, collection.id)).limit(1)
    if (!session) throw new Error('checkout: no payment session for this cart')

    // Revalidate promos/tax/totals (own tx, hors TX1). Refreshes persisted
    // cart totals so the order snapshot below is current.
    await ctx.cart.recalcTaxes(cartId)

    // Amount coherence: the collection was created for a total that may since
    // have changed (promo expired, price edited). Never authorize an amount
    // that differs from what the order will total.
    const [afterRecalc] = await db.select({ total: carts.total }).from(carts).where(eq(carts.id, cartId)).limit(1)
    if (afterRecalc && collection.amount !== afterRecalc.total) {
      throw new Error(`checkout: payment collection amount (${collection.amount}) is out of date with the cart total (${afterRecalc.total}) — recreate the payment collection`)
    }

    // Default stock location for reservations (single-warehouse MVP). No
    // location configured -> the store isn't tracking inventory, skip reserving.
    // Deliberately the first location; add multi-location routing when needed.
    const [location] = await db.select().from(stockLocations).where(isNull(stockLocations.deletedAt)).limit(1)

    // --- TX1: freeze cart (atomic guard), reserve, create order `pending` ----
    let tx1: { order: Order; orderLineItemIds: string[] }
    try {
      tx1 = await db.transaction(async (tx) => {
        // Conditional freeze FIRST, atomically: `completedAt is null` guard +
        // `.returning()` gives us the fresh cart under the freeze. 0 rows =>
        // another completion won the race; the whole TX1 rolls back on throw,
        // so a later failure (e.g. insufficient stock) also un-freezes.
        const [c] = await tx
          .update(carts)
          .set({ completedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(carts.id, cartId), isNull(carts.completedAt)))
          .returning()
        if (!c) throw new CartCompletionRace()
        // Re-check amount coherence under the freeze (fresh totals).
        if (collection.amount !== c.total) {
          throw new Error(`checkout: payment collection amount (${collection.amount}) is out of date with the cart total (${c.total}) — recreate the payment collection`)
        }
        const lines = await tx.select().from(cartLineItems).where(eq(cartLineItems.cartId, cartId))
        const shipping = await tx.select().from(cartShippingMethods).where(eq(cartShippingMethods.cartId, cartId))

      const shippingAddressId = await snapshotAddress(tx, {
        firstName: c.shippingFirstName,
        lastName: c.shippingLastName,
        company: c.shippingCompany,
        address1: c.shippingAddress1,
        address2: c.shippingAddress2,
        city: c.shippingCity,
        countryCode: c.shippingCountryCode,
        province: c.shippingProvince,
        postalCode: c.shippingPostalCode,
        phone: c.shippingPhone,
      })
      const billingAddressId = await snapshotAddress(tx, {
        firstName: c.billingFirstName,
        lastName: c.billingLastName,
        company: c.billingCompany,
        address1: c.billingAddress1,
        address2: c.billingAddress2,
        city: c.billingCity,
        countryCode: c.billingCountryCode,
        province: c.billingProvince,
        postalCode: c.billingPostalCode,
        phone: c.billingPhone,
      })

      const [ord] = await tx
        .insert(orders)
        .values({
          id: pygId('ord'),
          cartId,
          regionId: c.regionId,
          customerId: c.customerId,
          salesChannelId: c.salesChannelId,
          email: c.email,
          currencyCode: c.currencyCode,
          status: 'pending',
          shippingAddressId,
          billingAddressId,
          itemsSubtotal: c.itemsSubtotal,
          discountTotal: c.discountTotal,
          shippingTotal: c.shippingTotal,
          taxTotal: c.taxTotal,
          total: c.total,
        })
        .returning()

      const lineIds: string[] = []
      const reserveInput: { variantId: string; quantity: number; lineItemId: string }[] = []
      for (const li of lines) {
        const id = pygId('oli')
        lineIds.push(id)
        await tx.insert(orderLineItems).values({
          id,
          orderId: ord.id,
          productId: li.productId,
          variantId: li.variantId,
          title: li.title,
          sku: li.sku,
          thumbnail: li.thumbnail,
          unitPrice: li.unitPrice,
          isTaxInclusive: li.isTaxInclusive,
          quantity: li.quantity,
          subtotal: li.subtotal,
          discountTotal: li.discountTotal,
          taxTotal: li.taxTotal,
          total: li.total,
          metadata: li.metadata,
        })
        if (li.variantId) reserveInput.push({ variantId: li.variantId, quantity: li.quantity, lineItemId: id })
      }

      for (const sm of shipping) {
        await tx.insert(orderShippingMethods).values({
          id: pygId('osm'),
          orderId: ord.id,
          shippingOptionId: sm.shippingOptionId,
          name: sm.name,
          amount: sm.amount,
          isTaxInclusive: sm.isTaxInclusive,
          subtotal: sm.subtotal,
          discountTotal: sm.discountTotal,
          taxTotal: sm.taxTotal,
          total: sm.total,
        })
      }

      // Reserve stock — tx-scoped inventory service (nested tx = savepoint),
      // validates availability; insufficient stock throws and rolls back TX1.
      if (location && reserveInput.length) {
        const inv = createInventoryService({ db: tx })
        await inv.reserveVariants({ locationId: location.id, items: reserveInput })
      }

      // Link the collection to the order (the cart was already frozen above).
      await tx.update(paymentCollections).set({ orderId: ord.id, updatedAt: new Date() }).where(eq(paymentCollections.id, collection.id))
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: ord.id, type: 'order.created', payload: { total: ord.total, paymentStatus: 'awaiting' } })
      return { order: ord, orderLineItemIds: lineIds }
      })
    } catch (e) {
      if (e instanceof CartCompletionRace) {
        // Another completion won the freeze. Its order may not be committed/
        // visible yet — short retry, then a 409-style error the caller retries.
        for (let i = 0; i < 5; i++) {
          const existing = await findOrderByCart(cartId)
          if (existing) return { order: existing, status: 'already_complete' }
          await sleep(20)
        }
        throw new Error('checkout: cart completion already in progress')
      }
      throw e
    }
    const { order, orderLineItemIds } = tx1

    // --- OUTSIDE ANY TX: authorize the payment session ----------------------
    const provider = providers.get('payment', session.providerId)
    let auth: { data: Record<string, unknown>; status: string }
    try {
      auth = await provider.authorize(session.data)
    } catch {
      auth = { data: session.data, status: 'error' }
    }

    if (auth.status === 'authorized' || auth.status === 'captured') {
      // --- TX2: finalize --------------------------------------------------
      await db.transaction(async (tx) => {
        await tx
          .update(paymentSessions)
          .set({ status: auth.status, data: auth.data, authorizedAt: new Date(), updatedAt: new Date() })
          .where(eq(paymentSessions.id, session.id))
        await insertAuthorization(tx, { sessionId: session.id, amount: collection.amount, data: auth.data })
        await tx.update(paymentCollections).set({ status: 'authorized', updatedAt: new Date() }).where(eq(paymentCollections.id, collection.id))
        await tx.insert(orderEvents).values({
          id: pygId('ordevt'),
          orderId: order.id,
          type: 'payment.authorized',
          payload: { authorizedBefore: 0, authorizedAfter: collection.amount },
        })
        await emitDomainEvent(tx, 'order.placed', { orderId: order.id })
      })
      // Automatic capture at placement is deliberately omitted: capture is an
      // explicit admin action (recommended manual-capture-at-shipment mode).
      // Add a capture here (AFTER this commit, never inside it) if a provider
      // is configured capture_method=automatic.
      return { order, status: 'authorized' }
    }

    // --- TX2': compensate (100% DB) -----------------------------------------
    const canceled = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(orders)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id))
        .returning()
      // Release the reservations created in TX1: internal, pure DB.
      if (orderLineItemIds.length) {
        await tx.delete(reservationItems).where(inArray(reservationItems.lineItemId, orderLineItemIds))
      }
      // UN-freeze the cart (Medusa parity): a refused authorize must leave the
      // cart reusable — the client just recreates a payment session and retries
      // (findOrderByCart ignores the canceled order this compensation produces).
      await tx.update(carts).set({ completedAt: null, updatedAt: new Date() }).where(eq(carts.id, cartId))
      await tx.update(paymentSessions).set({ status: 'error', data: auth.data, updatedAt: new Date() }).where(eq(paymentSessions.id, session.id))
      await tx.update(paymentCollections).set({ status: 'canceled', updatedAt: new Date() }).where(eq(paymentCollections.id, collection.id))
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: order.id, type: 'order.canceled', payload: { reason: 'payment_authorization_failed' } })
      return row
    })

    // Best-effort void of any external hold (benign for a DB provider) — logged.
    try {
      await provider.cancel(session.data)
      await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId: order.id, type: 'payment.hold_voided', payload: {} })
    } catch {
      await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId: order.id, type: 'payment.void_failed', payload: {} })
    }
    return { order: canceled, status: 'error' }
  }

  // --- Admin financial ops (each records an APPEND-ONLY order_transaction +
  // an order_event with before/after amounts) --------------------------------

  /**
   * The order's principal payment: OLDEST collection holding a payment
   * (an order may carry several collections; without an explicit ordering
   * the pick would be non-deterministic). Target one precisely with
   * `capturePayment`/`refundPayment` (`/admin/payments/:id/*`).
   */
  async function resolvePayment(orderId: string) {
    const collections = await db
      .select()
      .from(paymentCollections)
      .where(eq(paymentCollections.orderId, orderId))
      .orderBy(asc(paymentCollections.createdAt), asc(paymentCollections.id))
    if (!collections.length) throw new Error('checkout: order has no payment collection')
    for (const collection of collections) {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.paymentCollectionId, collection.id))
        .orderBy(asc(payments.createdAt), asc(payments.id))
        .limit(1)
      if (payment) return { collection, payment }
    }
    throw new Error('checkout: order has no authorized payment')
  }

  /** Same resolution, keyed by the payment itself (`/admin/payments/:id/*`). */
  async function resolveByPayment(paymentId: string) {
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
    if (!payment) throw new Error(`checkout: payment '${paymentId}' not found`)
    const [collection] = await db.select().from(paymentCollections).where(eq(paymentCollections.id, payment.paymentCollectionId)).limit(1)
    if (!collection) throw new Error('checkout: payment has no collection')
    return { collection, payment }
  }

  async function captureOrder(orderId: string, input: { amount?: number; createdBy?: string | null }) {
    await doCapture(await resolvePayment(orderId), input)
    // getOrder reads via the plain `db` handle — must run AFTER the tx commits
    // (same-connection deadlock otherwise, see cart.ts).
    return (await getOrder(orderId))!
  }

  /** Capture a precise payment (an order with several collections has several). */
  async function capturePayment(paymentId: string, input: { amount?: number; createdBy?: string | null }) {
    const resolved = await resolveByPayment(paymentId)
    await doCapture(resolved, input)
    return resolved.collection.orderId ? await getOrder(resolved.collection.orderId) : null
  }

  async function doCapture(
    { collection, payment }: { collection: typeof paymentCollections.$inferSelect; payment: typeof payments.$inferSelect },
    input: { amount?: number; createdBy?: string | null },
  ) {
    const orderId = collection.orderId
    const amount = input.amount ?? payment.amount
    const before = await collectionAmounts(db, collection.id)
    // Pre-validate BEFORE the external provider call: never move money at the
    // provider only to have the in-tx guard reject it afterwards (money moved,
    // no DB trace). The in-tx guards in payment.ts stay the final authority.
    if (payment.canceledAt) throw new Error('checkout: cannot capture a canceled payment')
    const capturedSoFar = (await paymentCapturedRefunded(db, payment.id)).captured
    if (capturedSoFar + amount > payment.amount) {
      throw new Error(`checkout: capture ${amount} exceeds capturable amount ${payment.amount - capturedSoFar}`)
    }
    // Provider call outside the tx.
    const provider = providers.get('payment', payment.providerId)
    const result = await provider.capture(payment.data, amount)
    await db.transaction(async (tx) => {
      await insertCapture(tx, { paymentId: payment.id, amount, createdBy: input.createdBy ?? null })
      if (payment.sessionId) await tx.update(paymentSessions).set({ status: result.status, data: result.data, updatedAt: new Date() }).where(eq(paymentSessions.id, payment.sessionId))
      const after = await collectionAmounts(tx, collection.id)
      // Partial vs full capture (nit): status reflects how much of the target is captured.
      await tx.update(paymentCollections).set({ status: after.capturedAmount >= collection.amount ? 'captured' : 'partially_captured', updatedAt: new Date() }).where(eq(paymentCollections.id, collection.id))
      if (orderId) {
        await tx.insert(orderTransactions).values({ id: pygId('ordtxn'), orderId, amount, currencyCode: collection.currencyCode, reference: 'capture', referenceId: payment.id })
        await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'payment.captured', payload: { capturedBefore: before.capturedAmount, capturedAfter: after.capturedAmount, amount } })
      }
    })
  }

  async function refundOrder(orderId: string, input: { amount: number; note?: string | null; refundReasonId?: string | null; createdBy?: string | null }) {
    await doRefund(await resolvePayment(orderId), input)
    return (await getOrder(orderId))!
  }

  /** Refund a precise payment (`/admin/payments/:id/refund`). */
  async function refundPayment(paymentId: string, input: { amount: number; note?: string | null; refundReasonId?: string | null; createdBy?: string | null }) {
    const resolved = await resolveByPayment(paymentId)
    await doRefund(resolved, input)
    return resolved.collection.orderId ? await getOrder(resolved.collection.orderId) : null
  }

  async function doRefund(
    { collection, payment }: { collection: typeof paymentCollections.$inferSelect; payment: typeof payments.$inferSelect },
    input: { amount: number; note?: string | null; refundReasonId?: string | null; createdBy?: string | null },
  ) {
    const orderId = collection.orderId
    const before = await collectionAmounts(db, collection.id)
    // Pre-validate BEFORE the external provider call (see captureOrder).
    const { captured, refunded } = await paymentCapturedRefunded(db, payment.id)
    if (input.amount > captured - refunded) {
      throw new Error(`checkout: refund ${input.amount} exceeds refundable amount ${captured - refunded}`)
    }
    const provider = providers.get('payment', payment.providerId)
    await provider.refund(payment.data, input.amount)
    await db.transaction(async (tx) => {
      await insertRefund(tx, { paymentId: payment.id, amount: input.amount, note: input.note ?? null, refundReasonId: input.refundReasonId ?? null, createdBy: input.createdBy ?? null })
      const after = await collectionAmounts(tx, collection.id)
      await tx.update(paymentCollections).set({ status: after.refundedAmount >= after.capturedAmount && after.capturedAmount > 0 ? 'refunded' : 'partially_refunded', updatedAt: new Date() }).where(eq(paymentCollections.id, collection.id))
      if (orderId) {
        // Signed negative in the append-only ledger.
        await tx.insert(orderTransactions).values({ id: pygId('ordtxn'), orderId, amount: -input.amount, currencyCode: collection.currencyCode, reference: 'refund', referenceId: payment.id })
        await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'payment.refunded', payload: { refundedBefore: before.refundedAmount, refundedAfter: after.refundedAmount, amount: input.amount } })
      }
    })
  }

  async function cancelOrder(orderId: string, input: { createdBy?: string | null } = {}) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order) return null
    if (order.status === 'completed') throw new Error('checkout: cannot cancel a completed order')
    if (order.status === 'canceled') return order // already canceled, idempotent

    // Active-fulfillment guard: only canceled fulfillments allow
    // a cancel — a shipped/packed one means goods have left / are committed.
    const activeFulfillments = await db.select({ id: fulfillments.id }).from(fulfillments).where(and(eq(fulfillments.orderId, orderId), isNull(fulfillments.canceledAt)))
    if (activeFulfillments.length) throw new Error('checkout: cannot cancel an order with active fulfillments — cancel them first')

    // EVERY collection of the order (an edit/exchange may have opened
    // additional ones) — both for the refund-first guard and the cancellation.
    const collections = await db.select().from(paymentCollections).where(eq(paymentCollections.orderId, orderId))
    const orderPayments = collections.length
      ? await db.select().from(payments).where(inArray(payments.paymentCollectionId, collections.map((c) => c.id)))
      : []
    if (collections.length) {
      const amounts = await orderCollectionAmounts(db, orderId)
      // Refund-first: cancelling must never strand captured funds.
      if (amounts.capturedAmount > amounts.refundedAmount) {
        throw new Error('checkout: cannot cancel an order with captured funds not fully refunded — refund first')
      }
    }

    const row = await db.transaction(async (tx) => {
      // Release reservations for this order's line items (pre-fulfillment, pure DB).
      const lines = await tx.select({ id: orderLineItems.id }).from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
      if (lines.length) await tx.delete(reservationItems).where(inArray(reservationItems.lineItemId, lines.map((l) => l.id)))
      if (collections.length) {
        const ids = collections.map((c) => c.id)
        // Mark all payments canceled so a later capture is refused
        // (insertCapture rejects a canceled payment).
        await tx.update(payments).set({ canceledAt: new Date(), updatedAt: new Date() }).where(inArray(payments.paymentCollectionId, ids))
        await tx.update(paymentCollections).set({ status: 'canceled', updatedAt: new Date() }).where(inArray(paymentCollections.id, ids))
      }
      const [r] = await tx.update(orders).set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, orderId)).returning()
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'order.canceled', payload: { by: input.createdBy ?? null } })
      await emitDomainEvent(tx, 'order.canceled', { orderId })
      return r
    })

    // Best-effort void of every external authorization hold, outside the tx, AFTER
    // the commit, logged (mirror of the TX2' compensation path).
    for (const payment of orderPayments) {
      const provider = providers.get('payment', payment.providerId)
      try {
        await provider.cancel(payment.data)
        await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'payment.hold_voided', payload: { paymentId: payment.id } })
      } catch {
        await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'payment.void_failed', payload: { paymentId: payment.id } })
      }
    }
    return row
  }

  /**
   * Archive / un-archive an order (reversible). Refuses a canceled order.
   * Un-archive returns to 'pending' (the only post-placement lifecycle state
   * Pygmalion produces); stash the prior status in metadata if richer
   * restoration is ever needed.
   */
  async function archiveOrder(orderId: string, input: { archived?: boolean; createdBy?: string | null } = {}) {
    const archived = input.archived ?? true
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order) return null
    if (order.status === 'canceled') throw new Error('checkout: cannot archive a canceled order')
    const nextStatus = archived ? 'archived' : 'pending'
    return db.transaction(async (tx) => {
      const [row] = await tx.update(orders).set({ status: nextStatus, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning()
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: archived ? 'order.archived' : 'order.unarchived', payload: { by: input.createdBy ?? null } })
      await emitDomainEvent(tx, archived ? 'order.archived' : 'order.updated', { orderId })
      return row
    })
  }

  return { completeCart, getOrder, listOrders, countOrders, listOrderEvents, captureOrder, capturePayment, refundOrder, refundPayment, cancelOrder, archiveOrder }
}

export type CheckoutService = ReturnType<typeof createCheckoutService>

// --- helpers ------------------------------------------------------------------

async function snapshotAddress(tx: PygmalionDatabase, a: Record<string, string | null>): Promise<string | null> {
  // Nothing meaningful to snapshot -> no address row.
  if (!Object.values(a).some((v) => v)) return null
  const [row] = await tx.insert(orderAddresses).values({ id: pygId('oaddr'), ...a }).returning()
  return row.id
}

/**
 * Order payment status derivation (single source of truth). Priority matches
 * Medusa v2: canceled > refunded > captured > authorized > awaiting > not_paid.
 */
export function derivePaymentStatus(input: {
  target: number
  authorizedAmount: number
  capturedAmount: number
  refundedAmount: number
  canceled: boolean
}): string {
  const { target, authorizedAmount, capturedAmount, refundedAmount, canceled } = input
  if (canceled) return 'canceled'
  if (refundedAmount > 0) return refundedAmount >= capturedAmount ? 'refunded' : 'partially_refunded'
  if (capturedAmount > 0) return capturedAmount >= target ? 'captured' : 'partially_captured'
  if (authorizedAmount > 0) return authorizedAmount >= target ? 'authorized' : 'partially_authorized'
  return 'not_paid'
}

/**
 * Order fulfillment status derivation (single source of truth). DERIVED from
 * per-line fulfilled/shipped/delivered aggregates (SUM over non-canceled
 * fulfillment_items), NEVER a stored mutable column. Priority matches Medusa
 * v2: delivered > shipped > fulfilled, each with a `partially_*` variant, with
 * the guard "any unit not fully progressed ⇒ never the 100% state".
 */
export function deriveFulfillmentStatus(
  lines: { quantity: number; fulfilled: number; shipped: number; delivered: number }[],
): string {
  const total = lines.reduce((a, l) => a + l.quantity, 0)
  if (total === 0) return 'not_fulfilled'
  const fulfilled = lines.reduce((a, l) => a + l.fulfilled, 0)
  const shipped = lines.reduce((a, l) => a + l.shipped, 0)
  const delivered = lines.reduce((a, l) => a + l.delivered, 0)
  if (delivered >= total) return 'delivered'
  if (delivered > 0) return 'partially_delivered'
  if (shipped >= total) return 'shipped'
  if (shipped > 0) return 'partially_shipped'
  if (fulfilled >= total) return 'fulfilled'
  if (fulfilled > 0) return 'partially_fulfilled'
  return 'not_fulfilled'
}
