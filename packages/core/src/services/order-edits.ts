import { and, eq, inArray } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import {
  fulfillmentItems,
  fulfillments,
  orderEdits,
  orderEvents,
  orderLineItems,
  orders,
  type Order,
  type OrderEdit,
  type OrderEditChanges,
  type OrderLineItem,
} from '../schema/orders'
import { requestOrderEditInput, type RequestOrderEditInput } from '../validation/orders'
import { createInventoryService } from './inventory'
import { resolveAdditionTaxes } from './order-pricing'
import { insertPaymentCollection } from './payment'
import type { TaxService } from './tax'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

export interface OrderEditsServiceContext extends ServiceContext {
  // Tax service: reads tax config only, called outside the tx to price added
  // lines (an added line in a taxed region must carry tax).
  tax: Pick<TaxService, 'getTaxLines'>
}

/**
 * Order edit service (request → confirm). An `order_edit` row holds the
 * working set of line deltas (jsonb) while `status='requested'`. `preview` is a
 * PURE in-memory projection: ZERO writes to the order before confirm.
 * `confirm` applies the deltas, recomputes the persisted totals, adjusts
 * inventory reservations, and records an order_event with before/after amounts,
 * all in ONE transaction (internal-only, no external call).
 *
 * Concurrency: confirm CLAIMS the edit with a conditional UPDATE
 * (`status='requested'` → `'confirmed'`) as the first statement in the tx, then
 * locks the order row `for update`, then re-reads lines + the fulfilled-units
 * guard INSIDE the tx — so a concurrent double-confirm applies the deltas once.
 *
 * Deliberate simplification: added-line taxes use the tax service (real rates); a quantity
 * UPDATE scales the line's existing tax/discount proportionally (linear under a
 * flat rate); promotions are NOT re-run (that needs the cart engine). Upgrade
 * path: re-run the promo service here if edit-time discount accuracy matters.
 */
export function createOrderEditsService(ctx: OrderEditsServiceContext) {
  const { db, tax } = ctx

  async function get(id: string): Promise<OrderEdit | null> {
    const [row] = await db.select().from(orderEdits).where(eq(orderEdits.id, id)).limit(1)
    return row ?? null
  }

  /** Sum of already-fulfilled (non-canceled) quantity per line item on the order. */
  async function fulfilledByLine(dbh: PygmalionDatabase, orderId: string): Promise<Map<string, number>> {
    const rows = await dbh
      .select({ lineItemId: fulfillmentItems.lineItemId, quantity: fulfillmentItems.quantity, canceledAt: fulfillments.canceledAt })
      .from(fulfillmentItems)
      .innerJoin(fulfillments, eq(fulfillmentItems.fulfillmentId, fulfillments.id))
      .where(eq(fulfillments.orderId, orderId))
    const map = new Map<string, number>()
    for (const r of rows) if (!r.canceledAt) map.set(r.lineItemId, (map.get(r.lineItemId) ?? 0) + r.quantity)
    return map
  }

  /** Added-line taxes via the shared helper (order-pricing.ts) — real region rates. */
  async function additionTaxes(order: Order, changes: OrderEditChanges): Promise<number[]> {
    return resolveAdditionTaxes(db, tax, order, changes.additions)
  }

  async function request(orderId: string, input: RequestOrderEditInput): Promise<OrderEdit> {
    const data = requestOrderEditInput.parse(input)
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order) throw new Error(`order-edits: order '${orderId}' not found`)
    if (order.status === 'canceled') throw new Error('order-edits: cannot edit a canceled order')
    if (order.status === 'archived') throw new Error('order-edits: cannot edit an archived order')

    // One active edit at a time (business rule).
    const [active] = await db.select().from(orderEdits).where(and(eq(orderEdits.orderId, orderId), eq(orderEdits.status, 'requested'))).limit(1)
    if (active) throw new Error('order-edits: an edit is already active (requested) for this order')

    const lines = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
    const byId = new Map(lines.map((l) => [l.id, l]))
    const fulfilled = await fulfilledByLine(db, orderId)

    const touched = [...(data.updates ?? []).map((u) => u.lineItemId), ...(data.removals ?? [])]
    for (const lineItemId of touched) {
      const line = byId.get(lineItemId)
      if (!line) throw new Error(`order-edits: line item '${lineItemId}' is not on order '${orderId}'`)
      if ((fulfilled.get(lineItemId) ?? 0) > 0) {
        throw new Error(`order-edits: cannot modify line '${lineItemId}' — it already has fulfilled units`)
      }
    }

    const changes: OrderEditChanges = {
      additions: (data.additions ?? []).map((a) => ({ variantId: a.variantId ?? null, title: a.title, sku: a.sku ?? null, unitPrice: a.unitPrice, quantity: a.quantity })),
      updates: data.updates ?? [],
      removals: data.removals ?? [],
    }
    const [row] = await db
      .insert(orderEdits)
      .values({ id: pygId('ordedit'), orderId, status: 'requested', changes, createdBy: data.createdBy ?? null })
      .returning()
    return row
  }

  /** Pure in-memory projection of the order after the edit, NO writes. */
  async function preview(editId: string) {
    const edit = await get(editId)
    if (!edit) throw new Error(`order-edits: '${editId}' not found`)
    const [order] = await db.select().from(orders).where(eq(orders.id, edit.orderId)).limit(1)
    if (!order) throw new Error(`order-edits: order '${edit.orderId}' not found`)
    const lines = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, edit.orderId))
    const addTax = await additionTaxes(order, edit.changes)
    return projectEdit(order.shippingTotal, lines, edit.changes, addTax)
  }

  async function confirm(editId: string) {
    const edit = await get(editId)
    if (!edit) throw new Error(`order-edits: '${editId}' not found`)
    // Fast pre-check for a clear message; the conditional claim in the tx is the authority.
    if (edit.status !== 'requested') throw new Error(`order-edits: edit '${editId}' is not in 'requested' status (is '${edit.status}')`)

    const [order0] = await db.select().from(orders).where(eq(orders.id, edit.orderId)).limit(1)
    if (!order0) throw new Error(`order-edits: order '${edit.orderId}' not found`)
    // Added-line taxes resolved outside the tx (pure reads; tax config isn't mutated here).
    const addTax = await additionTaxes(order0, edit.changes)

    return db.transaction(async (tx) => {
      // #1 CLAIM the edit conditionally — first statement, serializes double-confirm.
      const [claimed] = await tx
        .update(orderEdits)
        .set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(orderEdits.id, edit.id), eq(orderEdits.status, 'requested')))
        .returning()
      if (!claimed) throw new Error(`order-edits: edit '${editId}' is not in 'requested' status (already confirmed/canceled or a concurrent confirm won)`)

      // Lock the order row — serializes this edit against fulfillments + other edits.
      const [order] = await tx.select().from(orders).where(eq(orders.id, edit.orderId)).for('update')
      if (!order) throw new Error(`order-edits: order '${edit.orderId}' not found`)

      // Re-read lines + the fulfilled-units guard INSIDE the tx (fresh, locked state).
      const lines = await tx.select().from(orderLineItems).where(eq(orderLineItems.orderId, edit.orderId))
      const byId = new Map(lines.map((l) => [l.id, l]))
      const fulfilled = await fulfilledByLine(tx, edit.orderId)
      const touched = [...edit.changes.updates.map((u) => u.lineItemId), ...edit.changes.removals]
      for (const lineItemId of touched) {
        if (!byId.get(lineItemId)) throw new Error(`order-edits: line item '${lineItemId}' no longer exists`)
        if ((fulfilled.get(lineItemId) ?? 0) > 0) throw new Error(`order-edits: cannot modify line '${lineItemId}' — it already has fulfilled units`)
      }

      const projection = projectEdit(order.shippingTotal, lines, edit.changes, addTax)
      const inv = createInventoryService({ db: tx })

      // Removals: drop the line + release its reservations.
      if (edit.changes.removals.length) {
        for (const lineItemId of edit.changes.removals) await inv.releaseByLineItem(lineItemId)
        await tx.delete(orderLineItems).where(inArray(orderLineItems.id, edit.changes.removals))
      }

      // Updates: recompute the line amounts + re-reserve the new quantity.
      for (const u of edit.changes.updates) {
        const line = byId.get(u.lineItemId)!
        const p = scaleLine(line, u.quantity)
        await tx
          .update(orderLineItems)
          .set({ quantity: u.quantity, subtotal: p.subtotal, discountTotal: p.discountTotal, taxTotal: p.taxTotal, total: p.total })
          .where(eq(orderLineItems.id, u.lineItemId))
        await inv.releaseByLineItem(u.lineItemId)
        if (line.variantId) await inv.reserveVariants({ locationId: await reserveLocation(tx), items: [{ variantId: line.variantId, quantity: u.quantity, lineItemId: u.lineItemId }] })
      }

      // Additions: insert new lines (with resolved tax) + reserve managed variants.
      for (let i = 0; i < edit.changes.additions.length; i++) {
        const a = edit.changes.additions[i]
        const id = pygId('oli')
        const subtotal = a.unitPrice * a.quantity
        const taxTotal = addTax[i] ?? 0
        await tx.insert(orderLineItems).values({
          id,
          orderId: edit.orderId,
          variantId: a.variantId,
          title: a.title,
          sku: a.sku,
          unitPrice: a.unitPrice,
          quantity: a.quantity,
          subtotal,
          discountTotal: 0,
          taxTotal,
          total: subtotal + taxTotal,
        })
        if (a.variantId) await inv.reserveVariants({ locationId: await reserveLocation(tx), items: [{ variantId: a.variantId, quantity: a.quantity, lineItemId: id }] })
      }

      const [updated] = await tx
        .update(orders)
        .set({
          itemsSubtotal: projection.itemsSubtotal,
          discountTotal: projection.discountTotal,
          taxTotal: projection.taxTotal,
          total: projection.total,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, edit.orderId))
        .returning()

      // An edit that RAISES the total leaves the difference uncollected: open
      // an additional payment collection for it, in THIS tx: the debt
      // and the means to collect it commit together. Sessions/authorize/capture
      // then go through the payment domain unchanged.
      const outstanding = projection.total - order.total
      if (outstanding > 0) {
        await insertPaymentCollection(tx, { orderId: edit.orderId, amount: outstanding, currencyCode: order.currencyCode })
      }

      // Before/after amounts of a financial mutation.
      await tx.insert(orderEvents).values({
        id: pygId('ordevt'),
        orderId: edit.orderId,
        type: 'order.edited',
        payload: {
          orderEditId: edit.id,
          totalBefore: order.total,
          totalAfter: projection.total,
          itemsSubtotalBefore: order.itemsSubtotal,
          itemsSubtotalAfter: projection.itemsSubtotal,
        },
        createdBy: edit.createdBy,
      })
      await emitDomainEvent(tx, 'order.updated', { orderId: edit.orderId, orderEditId: edit.id })
      return updated
    })
  }

  async function cancel(editId: string): Promise<OrderEdit> {
    const edit = await get(editId)
    if (!edit) throw new Error(`order-edits: '${editId}' not found`)
    if (edit.status === 'confirmed') throw new Error('order-edits: cannot cancel a confirmed edit')
    // Conditional cancel: only a still-requested edit flips to canceled (idempotent otherwise).
    const [row] = await db
      .update(orderEdits)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orderEdits.id, editId), eq(orderEdits.status, 'requested')))
      .returning()
    return row ?? edit
  }

  // First active stock location (single-warehouse MVP, parity with checkout/fulfillments).
  async function reserveLocation(tx: PygmalionDatabase): Promise<string> {
    const inv = createInventoryService({ db: tx })
    const [loc] = await inv.locations.list({ limit: 1 })
    if (!loc) throw new Error('order-edits: no stock location configured to reserve against')
    return loc.id
  }

  return { request, preview, confirm, cancel, get }
}

export type OrderEditsService = ReturnType<typeof createOrderEditsService>

// --- pure projection (shared by preview + confirm so they never diverge) ------

/** Scale a line's amounts to a new quantity — tax/discount scale proportionally. */
function scaleLine(line: OrderLineItem, quantity: number) {
  const subtotal = line.unitPrice * quantity
  const discountTotal = line.quantity ? Math.round((line.discountTotal * quantity) / line.quantity) : 0
  const taxTotal = line.quantity ? Math.round((line.taxTotal * quantity) / line.quantity) : 0
  return { subtotal, discountTotal, taxTotal, total: subtotal - discountTotal + taxTotal }
}

function projectEdit(shippingTotal: number, lines: OrderLineItem[], changes: OrderEditChanges, addTax: number[]) {
  const removed = new Set(changes.removals)
  const updateBy = new Map(changes.updates.map((u) => [u.lineItemId, u.quantity]))
  const projected: { subtotal: number; discountTotal: number; taxTotal: number; total: number }[] = []
  for (const line of lines) {
    if (removed.has(line.id)) continue
    const q = updateBy.get(line.id)
    projected.push(q !== undefined ? scaleLine(line, q) : { subtotal: line.subtotal, discountTotal: line.discountTotal, taxTotal: line.taxTotal, total: line.total })
  }
  changes.additions.forEach((a, i) => {
    const subtotal = a.unitPrice * a.quantity
    const taxTotal = addTax[i] ?? 0
    projected.push({ subtotal, discountTotal: 0, taxTotal, total: subtotal + taxTotal })
  })
  const itemsSubtotal = projected.reduce((s, l) => s + l.subtotal, 0)
  const discountTotal = projected.reduce((s, l) => s + l.discountTotal, 0)
  const taxTotal = projected.reduce((s, l) => s + l.taxTotal, 0)
  return { itemsSubtotal, discountTotal, taxTotal, shippingTotal, total: itemsSubtotal - discountTotal + taxTotal + shippingTotal }
}
