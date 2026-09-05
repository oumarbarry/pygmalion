import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { stockLocations, reservationItems } from '../schema/inventory'
import {
  fulfillmentItems,
  fulfillmentLabels,
  fulfillments,
  orderEvents,
  orderLineItems,
  orders,
  type Fulfillment,
} from '../schema/orders'
import { createFulfillmentInput, shipFulfillmentInput, type CreateFulfillmentInput, type ShipFulfillmentInput } from '../validation/orders'
import { createInventoryService } from './inventory'
import { deriveFulfillmentStatus } from './checkout'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

/**
 * Fulfillment execution service. Creating a fulfillment decrements
 * `stocked_quantity` and reduces the matching reservation AT CREATION, inside
 * one transaction (internal-only, no external call). Canceling a not-yet-shipped
 * fulfillment re-increments stock and recreates the reservation. Order-level
 * `fulfillment_status` is DERIVED via `deriveFulfillmentStatus`.
 *
 * ponytail: deliberately assumes a 1:1 variant↔inventory-item link (the auto-created one,
 * requiredQuantity=1): kit fulfillment (one line spanning several inventory
 * items) records a single fulfillment_item against the first reserved item.
 * Upgrade path: one fulfillment_item per (line, inventory item) if kits ship.
 */
export function createFulfillmentsService(ctx: ServiceContext) {
  const { db } = ctx

  async function loadFulfillment(id: string): Promise<Fulfillment | null> {
    const [row] = await db.select().from(fulfillments).where(eq(fulfillments.id, id)).limit(1)
    return row ?? null
  }

  async function get(id: string) {
    const f = await loadFulfillment(id)
    if (!f) return null
    const items = await db.select().from(fulfillmentItems).where(eq(fulfillmentItems.fulfillmentId, id))
    const labels = await db.select().from(fulfillmentLabels).where(eq(fulfillmentLabels.fulfillmentId, id))
    return { ...f, items, labels, status: fulfillmentStatus(f) }
  }

  async function listByOrder(orderId: string) {
    const rows = await db.select().from(fulfillments).where(eq(fulfillments.orderId, orderId)).orderBy(asc(fulfillments.createdAt))
    return Promise.all(
      rows.map(async (f) => ({
        ...f,
        status: fulfillmentStatus(f),
        items: await db.select().from(fulfillmentItems).where(eq(fulfillmentItems.fulfillmentId, f.id)),
      })),
    )
  }

  /** Derived order fulfillment status — aggregates over NON-canceled fulfillment items. */
  async function orderFulfillmentStatus(orderId: string): Promise<string> {
    const lines = await db.select({ id: orderLineItems.id, quantity: orderLineItems.quantity }).from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
    const fitems = await db
      .select({
        lineItemId: fulfillmentItems.lineItemId,
        quantity: fulfillmentItems.quantity,
        canceledAt: fulfillments.canceledAt,
        shippedAt: fulfillments.shippedAt,
        deliveredAt: fulfillments.deliveredAt,
      })
      .from(fulfillmentItems)
      .innerJoin(fulfillments, eq(fulfillmentItems.fulfillmentId, fulfillments.id))
      .where(eq(fulfillments.orderId, orderId))
    const active = fitems.filter((f) => !f.canceledAt)
    return deriveFulfillmentStatus(
      lines.map((l) => {
        const forLine = active.filter((f) => f.lineItemId === l.id)
        return {
          quantity: l.quantity,
          fulfilled: forLine.reduce((a, f) => a + f.quantity, 0),
          shipped: forLine.filter((f) => f.shippedAt).reduce((a, f) => a + f.quantity, 0),
          delivered: forLine.filter((f) => f.deliveredAt).reduce((a, f) => a + f.quantity, 0),
        }
      }),
    )
  }

  async function create(orderId: string, input: CreateFulfillmentInput) {
    const data = createFulfillmentInput.parse(input)
    // Fast pre-check for a clear message; the in-tx checks below are the authority.
    const [pre] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!pre) throw new Error(`fulfillments: order '${orderId}' not found`)
    if (pre.status === 'canceled') throw new Error('fulfillments: cannot fulfill a canceled order')
    if (pre.status === 'archived') throw new Error('fulfillments: cannot fulfill an archived order')

    // Resolve origin location (single-warehouse MVP, parity with checkout).
    let locationId = data.locationId ?? null
    if (!locationId) {
      const [loc] = await db.select().from(stockLocations).where(isNull(stockLocations.deletedAt)).limit(1)
      locationId = loc?.id ?? null
    }

    const fulfillment = await db.transaction(async (tx) => {
      // Lock the order row — serializes concurrent creates (and edits) so two
      // fulfillments on the same lines can't both pass the remaining-qty check.
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
      if (!order) throw new Error(`fulfillments: order '${orderId}' not found`)
      if (order.status === 'canceled') throw new Error('fulfillments: cannot fulfill a canceled order')
      if (order.status === 'archived') throw new Error('fulfillments: cannot fulfill an archived order')

      // Validate requested quantities against each line's remaining, INSIDE the
      // lock (Σ fulfilled ≤ quantity).
      const lines = await tx.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
      const byId = new Map(lines.map((l) => [l.id, l]))
      const existing = await tx
        .select({ lineItemId: fulfillmentItems.lineItemId, quantity: fulfillmentItems.quantity, canceledAt: fulfillments.canceledAt })
        .from(fulfillmentItems)
        .innerJoin(fulfillments, eq(fulfillmentItems.fulfillmentId, fulfillments.id))
        .where(eq(fulfillments.orderId, orderId))
      const fulfilledSoFar = new Map<string, number>()
      for (const e of existing) if (!e.canceledAt) fulfilledSoFar.set(e.lineItemId, (fulfilledSoFar.get(e.lineItemId) ?? 0) + e.quantity)
      for (const item of data.items) {
        const line = byId.get(item.lineItemId)
        if (!line) throw new Error(`fulfillments: line item '${item.lineItemId}' is not on order '${orderId}'`)
        const remaining = line.quantity - (fulfilledSoFar.get(item.lineItemId) ?? 0)
        if (item.quantity > remaining) {
          throw new Error(`fulfillments: quantity ${item.quantity} exceeds remaining ${remaining} for line '${item.lineItemId}'`)
        }
      }

      const inv = createInventoryService({ db: tx })
      const [f] = await tx
        .insert(fulfillments)
        .values({
          id: pygId('ful'),
          orderId,
          locationId,
          providerId: data.providerId ?? 'manual',
          shippingOptionId: data.shippingOptionId ?? null,
          requiresShipping: data.requiresShipping ?? true,
          packedAt: new Date(),
        })
        .returning()

      for (const item of data.items) {
        const line = byId.get(item.lineItemId)!
        // Consume `quantity` from the line's reservation(s): each fulfill reduces
        // the reservation AND decrements stocked_quantity by the same amount.
        const reservations = await tx
          .select()
          .from(reservationItems)
          .where(eq(reservationItems.lineItemId, item.lineItemId))
          .orderBy(asc(reservationItems.createdAt))
        let remaining = item.quantity
        let inventoryItemId: string | null = null
        for (const res of reservations) {
          if (remaining <= 0) break
          const take = Math.min(remaining, res.quantity)
          inventoryItemId = res.inventoryItemId
          await inv.fulfill(res.id, take)
          remaining -= take
        }
        // Drift guard: a tracked line whose reservations cover LESS than the
        // fulfilled quantity means stock/reservation data is inconsistent —
        // refuse rather than record a full item with a partial decrement.
        // (No reservation at all = untracked variant / backorder — allowed.)
        if (reservations.length && remaining > 0) {
          throw new Error(`fulfillments: reservations for line '${item.lineItemId}' cover less than the requested quantity (inventory drift)`)
        }
        await tx.insert(fulfillmentItems).values({
          id: pygId('fuli'),
          fulfillmentId: f.id,
          lineItemId: item.lineItemId,
          inventoryItemId,
          title: line.title,
          sku: line.sku,
          quantity: item.quantity,
        })
      }

      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'order.fulfillment_created', payload: { fulfillmentId: f.id }, createdBy: data.createdBy ?? null })
      await emitDomainEvent(tx, 'order.fulfillment_created', { orderId, fulfillmentId: f.id })
      return f
    })

    const items = await db.select().from(fulfillmentItems).where(eq(fulfillmentItems.fulfillmentId, fulfillment.id))
    return { fulfillment, items }
  }

  async function ship(fulfillmentId: string, input: ShipFulfillmentInput) {
    const data = shipFulfillmentInput.parse(input)
    return db.transaction(async (tx) => {
      // Conditional claim: only a live, not-yet-shipped fulfillment ships (0 rows
      // = concurrent/duplicate ship — no double order_event/outbox).
      const [row] = await tx
        .update(fulfillments)
        .set({ shippedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(fulfillments.id, fulfillmentId), isNull(fulfillments.canceledAt), isNull(fulfillments.shippedAt)))
        .returning()
      if (!row) throw await shipStateError(tx, fulfillmentId)
      if (data.trackingNumber || data.trackingUrl || data.labelUrl) {
        await tx.insert(fulfillmentLabels).values({
          id: pygId('fulla'),
          fulfillmentId,
          trackingNumber: data.trackingNumber ?? null,
          trackingUrl: data.trackingUrl ?? null,
          labelUrl: data.labelUrl ?? null,
        })
      }
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: row.orderId, type: 'order.shipment_created', payload: { fulfillmentId }, createdBy: data.createdBy ?? null })
      await emitDomainEvent(tx, 'order.shipment_created', { orderId: row.orderId, fulfillmentId })
      return row
    })
  }

  async function deliver(fulfillmentId: string, input: { createdBy?: string | null } = {}) {
    return db.transaction(async (tx) => {
      // Conditional claim: only a shipped, live, not-yet-delivered fulfillment.
      const [row] = await tx
        .update(fulfillments)
        .set({ deliveredAt: new Date(), updatedAt: new Date() })
        .where(and(eq(fulfillments.id, fulfillmentId), isNull(fulfillments.canceledAt), isNotNull(fulfillments.shippedAt), isNull(fulfillments.deliveredAt)))
        .returning()
      if (!row) throw await deliverStateError(tx, fulfillmentId)
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: row.orderId, type: 'order.delivery_created', payload: { fulfillmentId }, createdBy: input.createdBy ?? null })
      await emitDomainEvent(tx, 'order.delivery_created', { orderId: row.orderId, fulfillmentId })
      return row
    })
  }

  async function cancel(fulfillmentId: string, input: { createdBy?: string | null } = {}) {
    return db.transaction(async (tx) => {
      // Conditional claim: only a live, not-shipped/delivered fulfillment cancels.
      const [row] = await tx
        .update(fulfillments)
        .set({ canceledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(fulfillments.id, fulfillmentId), isNull(fulfillments.canceledAt), isNull(fulfillments.shippedAt), isNull(fulfillments.deliveredAt)))
        .returning()
      if (!row) {
        const f = await loadFulfillmentTx(tx, fulfillmentId)
        if (!f) throw new Error(`fulfillments: '${fulfillmentId}' not found`)
        if (f.canceledAt) return f // idempotent
        throw new Error('fulfillments: cannot cancel a shipped or delivered fulfillment')
      }
      const inv = createInventoryService({ db: tx })
      const items = await tx.select().from(fulfillmentItems).where(eq(fulfillmentItems.fulfillmentId, fulfillmentId))
      for (const item of items) {
        // Restore stock + recreate the reservation for the exact inventory item
        // that was decremented (null = untracked line, nothing to restore).
        if (item.inventoryItemId && row.locationId) {
          await inv.cancelFulfillment({
            inventoryItemId: item.inventoryItemId,
            locationId: row.locationId,
            quantity: item.quantity,
            lineItemId: item.lineItemId,
          })
        }
      }
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: row.orderId, type: 'order.fulfillment_canceled', payload: { fulfillmentId }, createdBy: input.createdBy ?? null })
      await emitDomainEvent(tx, 'order.fulfillment_canceled', { orderId: row.orderId, fulfillmentId })
      return row
    })
  }

  async function loadFulfillmentTx(tx: PygmalionDatabase, id: string): Promise<Fulfillment | null> {
    const [row] = await tx.select().from(fulfillments).where(eq(fulfillments.id, id)).limit(1)
    return row ?? null
  }
  // Turn a 0-row conditional claim into a precise error message.
  async function shipStateError(tx: PygmalionDatabase, id: string): Promise<Error> {
    const f = await loadFulfillmentTx(tx, id)
    if (!f) return new Error(`fulfillments: '${id}' not found`)
    if (f.canceledAt) return new Error('fulfillments: cannot ship a canceled fulfillment')
    return new Error('fulfillments: fulfillment is already shipped')
  }
  async function deliverStateError(tx: PygmalionDatabase, id: string): Promise<Error> {
    const f = await loadFulfillmentTx(tx, id)
    if (!f) return new Error(`fulfillments: '${id}' not found`)
    if (f.canceledAt) return new Error('fulfillments: cannot deliver a canceled fulfillment')
    if (!f.shippedAt) return new Error('fulfillments: fulfillment must be shipped before it can be delivered')
    return new Error('fulfillments: fulfillment is already delivered')
  }

  return { create, ship, deliver, cancel, get, listByOrder, orderFulfillmentStatus }
}

export type FulfillmentsService = ReturnType<typeof createFulfillmentsService>

/** Single-fulfillment derived status from its timestamps (packed/shipped/delivered/canceled). */
export function fulfillmentStatus(f: Pick<Fulfillment, 'packedAt' | 'shippedAt' | 'deliveredAt' | 'canceledAt'>): string {
  if (f.canceledAt) return 'canceled'
  if (f.deliveredAt) return 'delivered'
  if (f.shippedAt) return 'shipped'
  return 'packed'
}
