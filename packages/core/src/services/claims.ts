import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { orderEvents, orderLineItems, orders } from '../schema/orders'
import { claimItems, claims, returns, type Claim } from '../schema/rma'
import { createClaimInput, type CreateClaimInput } from '../validation/orders'
import { createInventoryService } from './inventory'
import { insertReservedOutboundLinesTx, resolveAdditionTaxes } from './order-pricing'
import { insertReturnTx } from './returns'
import type { CheckoutService } from './checkout'
import type { TaxService } from './tax'
import type { ServiceContext } from './context'

export interface ClaimsServiceContext extends ServiceContext {
  checkout: Pick<CheckoutService, 'refundOrder'>
  tax: Pick<TaxService, 'getTaxLines'>
}

/**
 * Claim service. Same structure as an exchange; the `type` decides the
 * outcome. `replace` → reserved outbound order lines (like an exchange).
 * `refund` → refundOrder at complete (append-only ledger). The
 * inbound leg is an optional linked Return (`return.claim_id`, leg-entrant).
 * claim_items flag the existing order lines with a reason + photos. Concurrency
 * law: order lock on create, conditional status claim on complete/cancel.
 */
export function createClaimsService(ctx: ClaimsServiceContext) {
  const { db, checkout, tax } = ctx

  async function get(id: string) {
    const [row] = await db.select().from(claims).where(eq(claims.id, id)).limit(1)
    if (!row) return null
    const items = await db.select().from(claimItems).where(eq(claimItems.claimId, id))
    const [inbound] = await db.select().from(returns).where(eq(returns.claimId, id)).limit(1)
    return { ...row, items, inboundReturn: inbound ?? null }
  }

  async function listByOrder(orderId: string): Promise<Claim[]> {
    return db.select().from(claims).where(eq(claims.orderId, orderId)).orderBy(asc(claims.createdAt))
  }

  /** Cross-order list, newest first. */
  async function list({ status, limit = 50, offset = 0 }: { status?: string; limit?: number; offset?: number } = {}): Promise<Claim[]> {
    return db
      .select()
      .from(claims)
      .where(status ? eq(claims.status, status) : undefined)
      .orderBy(desc(claims.createdAt), desc(claims.id))
      .limit(limit)
      .offset(offset)
  }

  async function create(orderId: string, input: CreateClaimInput) {
    const data = createClaimInput.parse(input)
    const [order0] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order0) throw new Error(`claims: order '${orderId}' not found`)
    const outbound = data.outbound ?? []
    const addTax = await resolveAdditionTaxes(db, tax, order0, outbound.map((o) => ({ variantId: o.variantId ?? null, unitPrice: o.unitPrice, quantity: o.quantity })))

    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
      if (!order) throw new Error(`claims: order '${orderId}' not found`)
      if (order.status === 'canceled') throw new Error('claims: cannot claim on a canceled order')
      if (order.status === 'archived') throw new Error('claims: cannot claim on an archived order')

      // Validate flagged items are on the order.
      const lines = await tx.select({ id: orderLineItems.id }).from(orderLineItems).where(eq(orderLineItems.orderId, orderId))
      const lineIds = new Set(lines.map((l) => l.id))
      for (const it of data.items) {
        if (!lineIds.has(it.lineItemId)) throw new Error(`claims: line item '${it.lineItemId}' is not on order '${orderId}'`)
      }

      const [claim] = await tx
        .insert(claims)
        .values({ id: pygId('clm'), orderId, type: data.type, status: 'requested', refundAmount: data.type === 'refund' ? data.refundAmount ?? null : null, createdBy: data.createdBy ?? null })
        .returning()

      for (const it of data.items) {
        await tx.insert(claimItems).values({
          id: pygId('clmitem'),
          claimId: claim.id,
          lineItemId: it.lineItemId,
          reason: it.reason,
          quantity: it.quantity,
          images: it.images ?? null,
          note: it.note ?? null,
        })
      }

      // Optional inbound leg = a linked Return.
      let inboundReturnId: string | undefined
      if (data.inbound?.length) {
        const ret = await insertReturnTx(
          tx,
          orderId,
          { items: data.inbound.map((i) => ({ lineItemId: i.lineItemId, quantity: i.quantity, reasonId: i.reasonId ?? null })), locationId: data.locationId ?? null, createdBy: data.createdBy ?? null },
          { claimId: claim.id },
        )
        inboundReturnId = ret.id
      }

      // Replace → reserved outbound order lines.
      const inserted = await insertReservedOutboundLinesTx(tx, orderId, outbound, addTax, { claimId: claim.id })

      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'order.claim_created', payload: { claimId: claim.id, type: claim.type, inboundReturnId: inboundReturnId ?? null }, createdBy: data.createdBy ?? null })
      await emitDomainEvent(tx, 'order.claim_created', { orderId, claimId: claim.id })
      return { claim, inboundReturnId, outboundLineItemIds: inserted.map((l) => l.lineItemId) }
    })
  }

  async function complete(claimId: string): Promise<Claim> {
    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1)
    if (!claim) throw new Error(`claims: '${claimId}' not found`)
    if (claim.status !== 'requested') throw new Error(`claims: '${claimId}' is already completed or canceled`)
    const [inbound] = await db.select().from(returns).where(eq(returns.claimId, claimId)).limit(1)
    if (inbound && inbound.status !== 'received') throw new Error('claims: cannot complete — the inbound return has not been fully received')

    // Claim the status FIRST — the conditional update makes the refund
    // single-shot under concurrent completes (the refund cap does not deduplicate).
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(claims)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(claims.id, claimId), eq(claims.status, 'requested')))
        .returning()
      if (!row) throw new Error(`claims: '${claimId}' is already completed or canceled`)
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: claim.orderId, type: 'order.claim_completed', payload: { claimId, type: claim.type, refundAmount: claim.refundAmount ?? 0 } })
      await emitDomainEvent(tx, 'order.claim_completed', { orderId: claim.orderId, claimId })
      return row
    })

    // Refund claim: ledger write outside the tx, AFTER the claim committed. A provider
    // failure leaves the claim completed; the admin retries via /orders/:id/refund.
    if (claim.type === 'refund' && claim.refundAmount && claim.refundAmount > 0) {
      try {
        await checkout.refundOrder(claim.orderId, { amount: claim.refundAmount, createdBy: claim.createdBy })
      } catch (e) {
        await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId: claim.orderId, type: 'order.claim_refund_failed', payload: { claimId, amount: claim.refundAmount, error: (e as Error).message } })
      }
    }
    return claimed
  }

  async function cancel(claimId: string): Promise<Claim> {
    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1)
    if (!claim) throw new Error(`claims: '${claimId}' not found`)
    if (claim.status === 'canceled') return claim
    if (claim.status === 'completed') throw new Error('claims: cannot cancel a completed claim')
    return db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(claims)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(claims.id, claimId), eq(claims.status, 'requested')))
        .returning()
      if (!claimed) throw new Error('claims: cannot cancel a completed claim')
      // Release outbound reservations + drop the replacement order lines
      // (tagged metadata.claimId at creation).
      const inv = createInventoryService({ db: tx })
      const outboundLines = await tx
        .select({ id: orderLineItems.id })
        .from(orderLineItems)
        .where(and(eq(orderLineItems.orderId, claim.orderId), sql`${orderLineItems.metadata}->>'claimId' = ${claimId}`))
      const claimLineIds = outboundLines.map((l) => l.id)
      for (const id of claimLineIds) await inv.releaseByLineItem(id)
      if (claimLineIds.length) await tx.delete(orderLineItems).where(inArray(orderLineItems.id, claimLineIds))
      // Cancel the inbound return — conditional on status so a concurrent
      // receive (which restocks) can never be overwritten by this cancel.
      const [inbound] = await tx.select().from(returns).where(eq(returns.claimId, claimId)).limit(1)
      if (inbound) {
        await tx.update(returns).set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() }).where(and(eq(returns.id, inbound.id), eq(returns.status, 'requested')))
      }
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: claim.orderId, type: 'order.claim_canceled', payload: { claimId } })
      await emitDomainEvent(tx, 'order.claim_canceled', { orderId: claim.orderId, claimId })
      return claimed
    })
  }

  return { create, complete, cancel, get, list, listByOrder }
}

export type ClaimsService = ReturnType<typeof createClaimsService>
