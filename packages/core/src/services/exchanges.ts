import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { orderEvents, orderLineItems, orderTransactions, orders } from '../schema/orders'
import { exchangeItems, exchanges, returns, type Exchange } from '../schema/rma'
import { createExchangeInput, type CreateExchangeInput } from '../validation/orders'
import { createInventoryService } from './inventory'
import { inboundValue, insertReservedOutboundLinesTx, resolveAdditionTaxes } from './order-pricing'
import { insertPaymentCollection } from './payment'
import { insertReturnTx } from './returns'
import type { CheckoutService } from './checkout'
import type { TaxService } from './tax'
import type { ServiceContext } from './context'

export interface ExchangesServiceContext extends ServiceContext {
  checkout: Pick<CheckoutService, 'refundOrder'>
  tax: Pick<TaxService, 'getTaxLines'>
}

/**
 * Exchange service. Outbound = new reserved order lines (edit-addition style,
 * real tax via the tax service). Inbound = a linked Return (inbound-leg
 * pattern). `difference_due = outboundTotal − inboundValue` is the single money
 * source, settled at `complete` (once the inbound return is received): negative
 * → refund via the append-only ledger; positive → a deferred
 * `exchange_difference` transaction the derived status signals. Order totals are
 * NOT mutated: the exchange is a standalone financial object (Medusa v2
 * parity), which keeps the money reasoning in one place.
 */
export function createExchangesService(ctx: ExchangesServiceContext) {
  const { db, checkout, tax } = ctx

  async function get(id: string) {
    const [row] = await db.select().from(exchanges).where(eq(exchanges.id, id)).limit(1)
    if (!row) return null
    const items = await db.select().from(exchangeItems).where(eq(exchangeItems.exchangeId, id))
    const [inbound] = await db.select().from(returns).where(eq(returns.exchangeId, id)).limit(1)
    return { ...row, outboundItems: items, inboundReturn: inbound ?? null }
  }

  async function listByOrder(orderId: string): Promise<Exchange[]> {
    return db.select().from(exchanges).where(eq(exchanges.orderId, orderId)).orderBy(asc(exchanges.createdAt))
  }

  /** Cross-order list, newest first. */
  async function list({ status, limit = 50, offset = 0 }: { status?: string; limit?: number; offset?: number } = {}): Promise<Exchange[]> {
    return db
      .select()
      .from(exchanges)
      .where(status ? eq(exchanges.status, status) : undefined)
      .orderBy(desc(exchanges.createdAt), desc(exchanges.id))
      .limit(limit)
      .offset(offset)
  }

  async function create(orderId: string, input: CreateExchangeInput) {
    const data = createExchangeInput.parse(input)
    const [order0] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order0) throw new Error(`exchanges: order '${orderId}' not found`)
    // Outbound taxes resolved outside the tx (pure reads).
    const addTax = await resolveAdditionTaxes(db, tax, order0, data.outbound.map((o) => ({ variantId: o.variantId ?? null, unitPrice: o.unitPrice, quantity: o.quantity })))

    return db.transaction(async (tx) => {
      // Lock the order — serializes against edits/fulfillments/other RMA flows.
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
      if (!order) throw new Error(`exchanges: order '${orderId}' not found`)
      if (order.status === 'canceled') throw new Error('exchanges: cannot exchange on a canceled order')
      if (order.status === 'archived') throw new Error('exchanges: cannot exchange on an archived order')

      const [exchange] = await tx
        .insert(exchanges)
        .values({ id: pygId('exc'), orderId, status: 'requested', createdBy: data.createdBy ?? null })
        .returning()

      // Inbound leg = a linked Return (validates shipped-only + Σ quantities).
      const ret = await insertReturnTx(
        tx,
        orderId,
        { items: data.inbound.map((i) => ({ lineItemId: i.lineItemId, quantity: i.quantity, reasonId: i.reasonId ?? null })), locationId: data.locationId ?? null, createdBy: data.createdBy ?? null },
        { exchangeId: exchange.id },
      )

      // Outbound = new reserved order lines.
      const inserted = await insertReservedOutboundLinesTx(tx, orderId, data.outbound, addTax, { exchangeId: exchange.id })
      for (const line of inserted) {
        await tx.insert(exchangeItems).values({
          id: pygId('excitem'),
          exchangeId: exchange.id,
          lineItemId: line.lineItemId,
          variantId: line.variantId,
          title: line.title,
          sku: line.sku,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          note: line.note,
        })
      }

      const outboundTotal = inserted.reduce((a, l) => a + l.total, 0)
      const inTotal = await inboundValue(tx, data.inbound.map((i) => ({ lineItemId: i.lineItemId, quantity: i.quantity })))
      const differenceDue = outboundTotal - inTotal
      const [withDiff] = await tx.update(exchanges).set({ differenceDue, updatedAt: new Date() }).where(eq(exchanges.id, exchange.id)).returning()

      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId, type: 'order.exchange_created', payload: { exchangeId: exchange.id, returnId: ret.id, outboundTotal, inboundValue: inTotal, differenceDue }, createdBy: data.createdBy ?? null })
      await emitDomainEvent(tx, 'order.exchange_created', { orderId, exchangeId: exchange.id })
      return { exchange: withDiff, inboundReturnId: ret.id, outboundLineItemIds: inserted.map((l) => l.lineItemId) }
    })
  }

  async function complete(exchangeId: string): Promise<Exchange> {
    const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1)
    if (!exchange) throw new Error(`exchanges: '${exchangeId}' not found`)
    if (exchange.status !== 'requested') throw new Error(`exchanges: '${exchangeId}' is not in 'requested' status (is '${exchange.status}')`)
    const [inbound] = await db.select().from(returns).where(eq(returns.exchangeId, exchangeId)).limit(1)
    if (inbound && inbound.status !== 'received') throw new Error('exchanges: cannot complete — the inbound return has not been fully received')

    const diff = exchange.differenceDue ?? 0
    // Claim the status FIRST — the conditional update is what makes the refund
    // single-shot under concurrent completes (the refund itself is capped but
    // not deduplicated by the ledger).
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(exchanges)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(exchanges.id, exchangeId), eq(exchanges.status, 'requested')))
        .returning()
      if (!row) throw new Error(`exchanges: '${exchangeId}' was already completed or canceled`)
      // Positive difference: append-only ledger signal PLUS an additional
      // payment collection so the difference can actually be collected:
      // sessions/authorize/capture via the payment domain, unchanged.
      if (diff > 0) {
        const currencyCode = await orderCurrency(tx, exchange.orderId)
        await tx.insert(orderTransactions).values({ id: pygId('ordtxn'), orderId: exchange.orderId, amount: diff, currencyCode, reference: 'exchange_difference', referenceId: exchangeId })
        await insertPaymentCollection(tx, { orderId: exchange.orderId, amount: diff, currencyCode })
      }
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: exchange.orderId, type: 'order.exchange_completed', payload: { exchangeId, differenceDue: diff } })
      await emitDomainEvent(tx, 'order.exchange_completed', { orderId: exchange.orderId, exchangeId })
      return row
    })

    // Negative difference: refund via the ledger, outside the tx, AFTER the claim
    // committed. A provider failure leaves the exchange completed; the admin
    // retries via /orders/:id/refund (same recovery shape as return receive).
    if (diff < 0) {
      try {
        await checkout.refundOrder(exchange.orderId, { amount: -diff, createdBy: exchange.createdBy })
      } catch (e) {
        await db.insert(orderEvents).values({ id: pygId('ordevt'), orderId: exchange.orderId, type: 'order.exchange_refund_failed', payload: { exchangeId, amount: -diff, error: (e as Error).message } })
      }
    }
    return claimed
  }

  async function cancel(exchangeId: string): Promise<Exchange> {
    const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, exchangeId)).limit(1)
    if (!exchange) throw new Error(`exchanges: '${exchangeId}' not found`)
    if (exchange.status === 'canceled') return exchange
    if (exchange.status === 'completed') throw new Error('exchanges: cannot cancel a completed exchange')
    return db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(exchanges)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(exchanges.id, exchangeId), eq(exchanges.status, 'requested')))
        .returning()
      if (!claimed) throw new Error('exchanges: cannot cancel a completed exchange')
      // Release outbound reservations + drop the outbound order lines.
      const inv = createInventoryService({ db: tx })
      const items = await tx.select().from(exchangeItems).where(eq(exchangeItems.exchangeId, exchangeId))
      const lineIds = items.map((i) => i.lineItemId).filter((v): v is string => !!v)
      for (const id of lineIds) await inv.releaseByLineItem(id)
      if (lineIds.length) await tx.delete(orderLineItems).where(inArray(orderLineItems.id, lineIds))
      // Cancel the inbound return — conditional on status so a concurrent
      // receive (which restocks) can never be overwritten by this cancel.
      const [inbound] = await tx.select().from(returns).where(eq(returns.exchangeId, exchangeId)).limit(1)
      if (inbound) {
        await tx.update(returns).set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() }).where(and(eq(returns.id, inbound.id), eq(returns.status, 'requested')))
      }
      await tx.insert(orderEvents).values({ id: pygId('ordevt'), orderId: exchange.orderId, type: 'order.exchange_canceled', payload: { exchangeId } })
      await emitDomainEvent(tx, 'order.exchange_canceled', { orderId: exchange.orderId, exchangeId })
      return claimed
    })
  }

  return { create, complete, cancel, get, list, listByOrder }
}

export type ExchangesService = ReturnType<typeof createExchangesService>

async function orderCurrency(dbh: ServiceContext['db'], orderId: string): Promise<string> {
  const [o] = await dbh.select({ currencyCode: orders.currencyCode }).from(orders).where(eq(orders.id, orderId)).limit(1)
  return o?.currencyCode ?? 'usd'
}
