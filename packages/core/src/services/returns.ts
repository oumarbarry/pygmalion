import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { fulfillmentItems, fulfillments, orderEvents, orderLineItems, orders } from '../schema/orders'
import { returnItems, returnReasons, returns, type Return, type ReturnReason } from '../schema/rma'
import {
  createReturnReasonInput,
  receiveReturnInput,
  requestReturnInput,
  updateReturnReasonInput,
  type CreateReturnReasonInput,
  type ReceiveReturnInput,
  type RequestReturnInput,
  type UpdateReturnReasonInput,
} from '../validation/orders'
import { createInventoryService } from './inventory'
import type { CheckoutService } from './checkout'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

export interface ReturnsServiceContext extends ServiceContext {
  // Refund on full receipt goes through the append-only payment ledger.
  // Called OUTSIDE the receive tx: refundOrder makes a provider call.
  checkout: Pick<CheckoutService, 'refundOrder'>
}

/**
 * Returns service. A `return` is requested on SHIPPED
 * lines only (Σ requested ≤ shipped − already returned), received partially or
 * fully (each receive re-increments resellable stock via the inventory service,
 * in the tx), and refunded through the payment ledger. Concurrency law:
 * request locks the order row; receive locks the return row FIRST, validates +
 * applies under the lock. The inbound leg of an exchange/claim is a return
 * created via `insertReturnTx` with `exchangeId`/`claimId` set (the inbound
 * leg is a Return).
 */
export function createReturnsService(ctx: ReturnsServiceContext) {
  const { db, checkout } = ctx

  // --- Return reasons (admin CRUD referential) --------------------------------

  const reasons = {
    async list(): Promise<ReturnReason[]> {
      return db.select().from(returnReasons).where(isNull(returnReasons.deletedAt)).orderBy(asc(returnReasons.value))
    },
    async get(id: string): Promise<ReturnReason | null> {
      const [row] = await db.select().from(returnReasons).where(and(eq(returnReasons.id, id), isNull(returnReasons.deletedAt))).limit(1)
      return row ?? null
    },
    async create(input: CreateReturnReasonInput): Promise<ReturnReason> {
      const data = createReturnReasonInput.parse(input)
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(returnReasons)
          .values({
            id: pygId('rr'),
            value: data.value,
            label: data.label,
            description: data.description ?? null,
            parentReturnReasonId: data.parentReturnReasonId ?? null,
            metadata: data.metadata ?? null,
          })
          .returning()
        await emitDomainEvent(tx, 'return-reason.created', { id: row.id })
        return row
      })
    },
    async update(id: string, input: UpdateReturnReasonInput): Promise<ReturnReason | null> {
      const data = updateReturnReasonInput.parse(input)
      const [row] = await db
        .update(returnReasons)
        .set({
          ...(data.value !== undefined ? { value: data.value } : {}),
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(returnReasons.id, id), isNull(returnReasons.deletedAt)))
        .returning()
      return row ?? null
    },
    async remove(id: string): Promise<ReturnReason | null> {
      const [row] = await db
        .update(returnReasons)
        .set({ deletedAt: new Date() })
        .where(and(eq(returnReasons.id, id), isNull(returnReasons.deletedAt)))
        .returning()
      return row ?? null
    },
  }

  // --- Reads ------------------------------------------------------------------

  async function get(id: string) {
    const [row] = await db.select().from(returns).where(eq(returns.id, id)).limit(1)
    if (!row) return null
    const items = await db.select().from(returnItems).where(eq(returnItems.returnId, id))
    return { ...row, items }
  }

  async function listByOrder(orderId: string): Promise<Return[]> {
    return db.select().from(returns).where(eq(returns.orderId, orderId)).orderBy(asc(returns.createdAt))
  }

  /** Cross-order list: the admin "returns in
   * progress" tab needs all of them, newest first, optionally by status. */
  async function list({ status, limit = 50, offset = 0 }: { status?: string; limit?: number; offset?: number } = {}): Promise<Return[]> {
    return db
      .select()
      .from(returns)
      .where(status ? eq(returns.status, status) : undefined)
      .orderBy(desc(returns.createdAt), desc(returns.id))
      .limit(limit)
      .offset(offset)
  }

  // --- Request ----------------------------------------------------------------

  async function request(orderId: string, input: RequestReturnInput): Promise<Return> {
    const data = requestReturnInput.parse(input)
    return db.transaction(async (tx) => insertReturnTx(tx, orderId, data, {}))
  }

  // --- Receive ----------------------------------------------------------------

  async function receive(returnId: string, input: ReceiveReturnInput) {
    const data = receiveReturnInput.parse(input)
    const applied = await db.transaction(async (tx) => {
      // Lock the return row FIRST — serializes concurrent receives on it.
      const [ret] = await tx.select().from(returns).where(eq(returns.id, returnId)).for('update')
      if (!ret) throw new Error(`returns: '${returnId}' not found`)
      if (ret.status === 'canceled') throw new Error('returns: cannot receive a canceled return')

      const items = await tx.select().from(returnItems).where(eq(returnItems.returnId, returnId))
      const byLine = new Map(items.map((i) => [i.lineItemId, i]))
      const invByLine = await fulfillmentInventoryByLine(tx, ret.orderId)

      const inv = createInventoryService({ db: tx })
      for (const rcv of data.items) {
        const item = byLine.get(rcv.lineItemId)
        if (!item) throw new Error(`returns: line '${rcv.lineItemId}' is not on return '${returnId}'`)
        const damaged = rcv.damagedQuantity ?? 0
        if (damaged > rcv.receivedQuantity) throw new Error('returns: damaged quantity cannot exceed received quantity')
        if (item.receivedQuantity + rcv.receivedQuantity > item.requestedQuantity) {
          throw new Error(`returns: received ${item.receivedQuantity + rcv.receivedQuantity} exceeds requested ${item.requestedQuantity} for line '${rcv.lineItemId}'`)
        }
        await tx
          .update(returnItems)
          .set({ receivedQuantity: item.receivedQuantity + rcv.receivedQuantity, damagedQuantity: item.damagedQuantity + damaged })
          .where(eq(returnItems.id, item.id))
        // Re-increment resellable stock (received − damaged); untracked lines skip.
        const resellable = rcv.receivedQuantity - damaged
        const invRef = invByLine.get(rcv.lineItemId)
        if (resellable > 0 && invRef) {
          await inv.incrementStock({ inventoryItemId: invRef.inventoryItemId, locationId: ret.locationId ?? invRef.locationId, quantity: resellable })
        }
      }

      const after = await tx.select().from(returnItems).where(eq(returnItems.returnId, returnId))
      const totalRequested = after.reduce((a, i) => a + i.requestedQuantity, 0)
      const totalReceived = after.reduce((a, i) => a + i.receivedQuantity, 0)
      const wasReceived = ret.status === 'received'
      const nextStatus = totalReceived >= totalRequested ? 'received' : 'partially_received'
      const [updated] = await tx
        .update(returns)
        .set({ status: nextStatus, receivedAt: nextStatus === 'received' ? new Date() : ret.receivedAt, updatedAt: new Date() })
        .where(eq(returns.id, returnId))
        .returning()

      await tx.insert(orderEvents).values({
        id: pygId('ordevt'),
        orderId: ret.orderId,
        type: 'order.return_received',
        payload: { returnId, receivedBefore: ret.status, receivedAfter: nextStatus, totalReceived, totalRequested },
        createdBy: data.createdBy ?? null,
      })
      await emitDomainEvent(tx, 'order.return_received', { orderId: ret.orderId, returnId })
      return { ret: updated, newlyReceived: !wasReceived && nextStatus === 'received' }
    })

    // Refund on full receipt — HORS tx (provider call), best-effort. A failure
    // leaves the received return intact; the admin retries via /orders/:id/refund.
    if (applied.newlyReceived && applied.ret.refundAmount && applied.ret.refundAmount > 0) {
      try {
        await checkout.refundOrder(applied.ret.orderId, { amount: applied.ret.refundAmount, createdBy: applied.ret.createdBy })
      } catch (e) {
        await db.insert(orderEvents).values({
          id: pygId('ordevt'),
          orderId: applied.ret.orderId,
          type: 'order.return_refund_failed',
          payload: { returnId, amount: applied.ret.refundAmount, error: (e as Error).message },
        })
      }
    }
    return applied.ret
  }

  // --- Cancel -----------------------------------------------------------------

  async function cancel(returnId: string): Promise<Return> {
    const [ret] = await db.select().from(returns).where(eq(returns.id, returnId)).limit(1)
    if (!ret) throw new Error(`returns: '${returnId}' not found`)
    if (ret.status === 'canceled') return ret
    if (ret.exchangeId || ret.claimId) throw new Error('returns: this return is the inbound leg of an exchange/claim — cancel that instead')
    if (ret.status !== 'requested') throw new Error('returns: cannot cancel a return that has already received units')
    // Conditional claim: only a still-requested return flips to canceled.
    const [row] = await db
      .update(returns)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(returns.id, returnId), eq(returns.status, 'requested')))
      .returning()
    if (!row) throw new Error('returns: cannot cancel a return that has already received units')
    await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId: ret.orderId, type: 'order.return_canceled', payload: { returnId } })
    return row
  }

  /**
   * How many units of each line the customer may still send back — exactly the
   * quantity `insertReturnTx` would accept (shipped − already requested). The
   * storefront needs it to offer a return only where one can succeed, instead
   * of showing a button that 422s.
   */
  async function returnableByLine(orderId: string): Promise<Map<string, number>> {
    const shipped = await shippedByLine(db, orderId)
    const returned = await returnedByLine(db, orderId)
    const map = new Map<string, number>()
    for (const [lineItemId, qty] of shipped) map.set(lineItemId, Math.max(0, qty - (returned.get(lineItemId) ?? 0)))
    return map
  }

  return { reasons, request, receive, cancel, get, list, listByOrder, returnableByLine }
}

export type ReturnsService = ReturnType<typeof createReturnsService>

// --- shared helpers (also used by exchanges + claims for the inbound leg) -----

/** Shipped (non-canceled) quantity per line item on the order. */
export async function shippedByLine(dbh: PygmalionDatabase, orderId: string): Promise<Map<string, number>> {
  const rows = await dbh
    .select({ lineItemId: fulfillmentItems.lineItemId, quantity: fulfillmentItems.quantity, canceledAt: fulfillments.canceledAt, shippedAt: fulfillments.shippedAt })
    .from(fulfillmentItems)
    .innerJoin(fulfillments, eq(fulfillmentItems.fulfillmentId, fulfillments.id))
    .where(eq(fulfillments.orderId, orderId))
  const map = new Map<string, number>()
  for (const r of rows) if (!r.canceledAt && r.shippedAt) map.set(r.lineItemId, (map.get(r.lineItemId) ?? 0) + r.quantity)
  return map
}

/** Requested-return quantity per line across non-canceled returns of the order. */
export async function returnedByLine(dbh: PygmalionDatabase, orderId: string): Promise<Map<string, number>> {
  const rows = await dbh
    .select({ lineItemId: returnItems.lineItemId, quantity: returnItems.requestedQuantity, status: returns.status })
    .from(returnItems)
    .innerJoin(returns, eq(returnItems.returnId, returns.id))
    .where(and(eq(returns.orderId, orderId), ne(returns.status, 'canceled')))
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.lineItemId, (map.get(r.lineItemId) ?? 0) + r.quantity)
  return map
}

/** Inventory item + location a line was fulfilled from (for restock at receipt). */
async function fulfillmentInventoryByLine(dbh: PygmalionDatabase, orderId: string): Promise<Map<string, { inventoryItemId: string; locationId: string }>> {
  const rows = await dbh
    .select({ lineItemId: fulfillmentItems.lineItemId, inventoryItemId: fulfillmentItems.inventoryItemId, locationId: fulfillments.locationId, canceledAt: fulfillments.canceledAt })
    .from(fulfillmentItems)
    .innerJoin(fulfillments, eq(fulfillmentItems.fulfillmentId, fulfillments.id))
    .where(eq(fulfillments.orderId, orderId))
  const map = new Map<string, { inventoryItemId: string; locationId: string }>()
  for (const r of rows) {
    if (r.canceledAt || !r.inventoryItemId || !r.locationId) continue
    if (!map.has(r.lineItemId)) map.set(r.lineItemId, { inventoryItemId: r.inventoryItemId, locationId: r.locationId })
  }
  return map
}

/**
 * Insert a return + its items under the order lock, validating that every line
 * is shipped and Σ requested ≤ shipped − already returned. Tx-aware so exchanges
 * and claims create their inbound leg in the same transaction as the outbound.
 */
export async function insertReturnTx(
  tx: PygmalionDatabase,
  orderId: string,
  data: { items: { lineItemId: string; quantity: number; reasonId?: string | null; note?: string | null }[]; locationId?: string | null; refundAmount?: number | null; createdBy?: string | null },
  link: { exchangeId?: string; claimId?: string },
): Promise<Return> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
  if (!order) throw new Error(`returns: order '${orderId}' not found`)
  if (order.status === 'canceled') throw new Error('returns: cannot return a canceled order')
  if (order.status === 'archived') throw new Error('returns: cannot return an archived order')

  const lines = await tx.select({ id: orderLineItems.id }).from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
  const lineIds = new Set(lines.map((l) => l.id))
  const shipped = await shippedByLine(tx, orderId)
  const alreadyReturned = await returnedByLine(tx, orderId)

  for (const item of data.items) {
    if (!lineIds.has(item.lineItemId)) throw new Error(`returns: line item '${item.lineItemId}' is not on order '${orderId}'`)
    const shippedQty = shipped.get(item.lineItemId) ?? 0
    if (shippedQty === 0) throw new Error(`returns: line '${item.lineItemId}' has not been shipped — only shipped lines can be returned`)
    const remaining = shippedQty - (alreadyReturned.get(item.lineItemId) ?? 0)
    if (item.quantity > remaining) {
      throw new Error(`returns: quantity ${item.quantity} exceeds returnable ${remaining} (shipped − already returned) for line '${item.lineItemId}'`)
    }
  }

  const [ret] = await tx
    .insert(returns)
    .values({
      id: pygId('ret'),
      orderId,
      exchangeId: link.exchangeId ?? null,
      claimId: link.claimId ?? null,
      status: 'requested',
      locationId: data.locationId ?? null,
      refundAmount: data.refundAmount ?? null,
      createdBy: data.createdBy ?? null,
    })
    .returning()

  for (const item of data.items) {
    await tx.insert(returnItems).values({
      id: pygId('retitem'),
      returnId: ret.id,
      lineItemId: item.lineItemId,
      reasonId: item.reasonId ?? null,
      requestedQuantity: item.quantity,
      note: item.note ?? null,
    })
  }

  await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'order.return_requested', payload: { returnId: ret.id, exchangeId: link.exchangeId ?? null, claimId: link.claimId ?? null }, createdBy: data.createdBy ?? null })
  await emitDomainEvent(tx, 'order.return_requested', { orderId, returnId: ret.id })
  return ret
}
