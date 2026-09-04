import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { orderEvents, orderTransactions, orders } from '../schema/orders'
import {
  captures,
  paymentCollections,
  paymentSessions,
  payments,
  refundReasons,
  refunds,
  type Payment,
  type PaymentCollection,
  type PaymentSession,
  type RefundReason,
} from '../schema/payment'
import {
  capturePaymentInput,
  createOrderPaymentCollectionInput,
  createPaymentCollectionInput,
  createPaymentSessionInput,
  createRefundReasonInput,
  markAsPaidInput,
  updateRefundReasonInput,
  refundPaymentInput,
  type CapturePaymentInput,
  type CreateOrderPaymentCollectionInput,
  type CreatePaymentCollectionInput,
  type CreatePaymentSessionInput,
  type CreateRefundReasonInput,
  type MarkAsPaidInput,
  type UpdateRefundReasonInput,
  type RefundPaymentInput,
} from '../validation/payment'
import type { PygmalionDatabase } from '../db/types'
import type { ServiceContext } from './context'

// Payment domain service.
// `data` is opaque provider state threaded initiate -> authorize -> capture...
// and persisted between calls; the service never inspects its shape.

export type PaymentData = Record<string, unknown>

export type PaymentSessionStatusValue =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'canceled'
  | 'error'
  | 'requires_more'
  | 'pending_authorization'

export interface PaymentProviderResult {
  data: PaymentData
  status: PaymentSessionStatusValue
}

export interface InitiatePaymentInput {
  amount: number
  currencyCode: string
  data?: PaymentData
  context?: Record<string, unknown>
}

export type WebhookActionType =
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'canceled'
  | 'pending'
  | 'requires_more'
  | 'not_supported'

export interface WebhookAction {
  action: WebhookActionType
  /** PaymentSession id, recovered from provider metadata. */
  sessionId?: string
  amount?: number
}

/**
 * Payment provider seam. 6 required core methods + `handleWebhook?`
 * (optional: a DB-backed provider has no webhooks). Account-holder / saved-
 * method methods (Medusa v2 parity) are optional and omitted until a consumer
 * needs them. `data` is the only state channel between Pygmalion and
 * the provider.
 */
export interface PaymentProvider {
  initiate(input: InitiatePaymentInput): Promise<PaymentProviderResult>
  authorize(data: PaymentData): Promise<PaymentProviderResult>
  capture(data: PaymentData, amount: number): Promise<PaymentProviderResult>
  refund(data: PaymentData, amount: number): Promise<PaymentProviderResult>
  cancel(data: PaymentData): Promise<PaymentProviderResult>
  getStatus(data: PaymentData): Promise<PaymentSessionStatusValue>
  handleWebhook?(payload: unknown, signature?: string): Promise<WebhookAction>
}

export interface PaymentProviderRegistry {
  get(type: 'payment', id: string): PaymentProvider
}

export interface PaymentServiceContext extends ServiceContext {
  providers: PaymentProviderRegistry
}

/**
 * Default DB-backed provider (dev + pay-on-delivery). Authorizes/captures
 * without any external call — it just threads a status flag through `data`.
 */
export function createManualPaymentProvider(): PaymentProvider {
  return {
    async initiate(input) {
      return { data: { manual: true, amount: input.amount, currencyCode: input.currencyCode }, status: 'pending' }
    },
    async authorize(data) {
      return { data: { ...data, authorized: true }, status: 'authorized' }
    },
    async capture(data, amount) {
      return { data: { ...data, captured: amount }, status: 'captured' }
    },
    async refund(data, amount) {
      return { data: { ...data, refunded: amount }, status: 'authorized' }
    },
    async cancel(data) {
      return { data: { ...data, canceled: true }, status: 'canceled' }
    },
    async getStatus(data) {
      if (data.canceled) return 'canceled'
      if (data.captured) return 'captured'
      if (data.authorized) return 'authorized'
      return 'pending'
    },
  }
}

// --- Derived amounts (SQL aggregate: never a stored counter) ------------------

async function amountsWhere(db: PygmalionDatabase, scope: SQL) {
  const [auth] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(scope)
  const [cap] = await db
    .select({ total: sql<number>`coalesce(sum(${captures.amount}), 0)::int` })
    .from(captures)
    .innerJoin(payments, eq(captures.paymentId, payments.id))
    .where(scope)
  const [ref] = await db
    .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` })
    .from(refunds)
    .innerJoin(payments, eq(refunds.paymentId, payments.id))
    .where(scope)
  return { authorizedAmount: auth?.total ?? 0, capturedAmount: cap?.total ?? 0, refundedAmount: ref?.total ?? 0 }
}

async function collectionAmounts(db: PygmalionDatabase, collectionId: string) {
  return amountsWhere(db, eq(payments.paymentCollectionId, collectionId))
}

/**
 * What the order still owes: total − already authorized − manual payments −
 * the amount of the collections still OPEN (`not_paid`/`awaiting`).
 * Subtracting the open ones is what stops two admins from opening two
 * collections for the same debt and collecting it twice. Manual payments
 * (draft `markPaid`) exist ONLY on the append-only ledger; without
 * them a manually-paid order would read as fully collectable again.
 */
async function orderOutstanding(db: PygmalionDatabase, orderId: string, total: number) {
  const { authorizedAmount } = await orderCollectionAmounts(db, orderId)
  const [open] = await db
    .select({ total: sql<number>`coalesce(sum(${paymentCollections.amount}), 0)::int` })
    .from(paymentCollections)
    .where(and(eq(paymentCollections.orderId, orderId), inArray(paymentCollections.status, ['not_paid', 'awaiting'])))
  const [manual] = await db
    .select({ total: sql<number>`coalesce(sum(${orderTransactions.amount}), 0)::int` })
    .from(orderTransactions)
    .where(and(eq(orderTransactions.orderId, orderId), eq(orderTransactions.reference, 'manual_payment')))
  return total - authorizedAmount - (open?.total ?? 0) - (manual?.total ?? 0)
}

/**
 * Same aggregates, but over EVERY payment collection of an order: an
 * order edit that raises the total, or a positive exchange difference, opens an
 * ADDITIONAL collection, so the order's derived payment status must sum them
 * all — reading a single collection would report an already-paid order as
 * unpaid (or the reverse).
 */
async function orderCollectionAmounts(db: PygmalionDatabase, orderId: string) {
  return amountsWhere(
    db,
    inArray(
      payments.paymentCollectionId,
      db.select({ id: paymentCollections.id }).from(paymentCollections).where(eq(paymentCollections.orderId, orderId)),
    ),
  )
}

async function paymentCapturedRefunded(db: PygmalionDatabase, paymentId: string) {
  const [cap] = await db
    .select({ total: sql<number>`coalesce(sum(${captures.amount}), 0)::int` })
    .from(captures)
    .where(eq(captures.paymentId, paymentId))
  const [ref] = await db
    .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` })
    .from(refunds)
    .where(eq(refunds.paymentId, paymentId))
  return { captured: cap?.total ?? 0, refunded: ref?.total ?? 0 }
}

export function createPaymentService(ctx: PaymentServiceContext) {
  const { db, providers } = ctx

  async function createCollection(input: CreatePaymentCollectionInput): Promise<PaymentCollection> {
    const data = createPaymentCollectionInput.parse(input)
    return db.transaction(async (tx) => insertPaymentCollection(tx, data))
  }

  /**
   * Additional collection on an order. `amount` defaults to the
   * outstanding amount (order total − already authorized across every
   * collection) and is capped by it: an admin can never open a collection for
   * more than the order actually owes.
   */
  async function createCollectionForOrder(input: CreateOrderPaymentCollectionInput): Promise<PaymentCollection> {
    const data = createOrderPaymentCollectionInput.parse(input)
    const [order] = await db
      .select({ total: orders.total, currencyCode: orders.currencyCode, status: orders.status })
      .from(orders)
      .where(eq(orders.id, data.orderId))
      .limit(1)
    if (!order) throw new Error(`payment: order '${data.orderId}' not found`)
    if (order.status === 'canceled') throw new Error('payment: cannot collect on a canceled order')
    const outstanding = await orderOutstanding(db, data.orderId, order.total)
    if (outstanding <= 0) throw new Error('payment: order has nothing outstanding to collect')
    const amount = data.amount ?? outstanding
    if (amount > outstanding) throw new Error(`payment: amount ${amount} exceeds the outstanding ${outstanding}`)
    return db.transaction(async (tx) =>
      insertPaymentCollection(tx, { orderId: data.orderId, amount, currencyCode: order.currencyCode }),
    )
  }

  /**
   * Manual collection of a payment (Medusa v2's `mark-as-paid`): one session,
   * one authorization, one full capture, through the shared helpers
   * (`insertAuthorization`/`insertCapture` and their caps), never a raw insert.
   *
   * Concurrency: the collection is CLAIMED by a conditional
   * UPDATE (`not_paid|awaiting` → `authorized`) BEFORE any money moves, so two
   * concurrent calls produce exactly one authorization + one capture. Provider
   * calls run outside the tx; a provider failure releases the claim.
   */
  async function markAsPaid(collectionId: string, input: MarkAsPaidInput | Record<string, never> = {}) {
    const data = markAsPaidInput.parse(input)
    const [collection] = await db.select().from(paymentCollections).where(eq(paymentCollections.id, collectionId)).limit(1)
    if (!collection) throw new Error(`payment: collection '${collectionId}' not found`)
    if (collection.amount <= 0) throw new Error('payment: cannot mark a zero-amount collection as paid')

    // #1 CLAIM — first statement, before any money movement.
    const [claimed] = await db
      .update(paymentCollections)
      .set({ status: 'authorized', updatedAt: new Date() })
      .where(and(eq(paymentCollections.id, collectionId), inArray(paymentCollections.status, ['not_paid', 'awaiting'])))
      .returning()
    if (!claimed) throw new Error(`payment: collection '${collectionId}' is not payable (status '${collection.status}')`)

    const provider = providers.get('payment', data.providerId)
    const sessionId = pygId('payses')
    let init: PaymentProviderResult
    let auth: PaymentProviderResult
    let cap: PaymentProviderResult
    try {
      init = await provider.initiate({ amount: claimed.amount, currencyCode: claimed.currencyCode, context: { sessionId, manual: true } })
      auth = await provider.authorize(init.data)
      cap = await provider.capture(auth.data, claimed.amount)
    } catch (e) {
      // Release the claim so the admin can retry (conditional: never clobber a
      // status someone else moved on).
      await db
        .update(paymentCollections)
        .set({ status: collection.status, updatedAt: new Date() })
        .where(and(eq(paymentCollections.id, collectionId), eq(paymentCollections.status, 'authorized')))
      throw e
    }

    await db.transaction(async (tx) => {
      await tx.insert(paymentSessions).values({
        id: sessionId,
        paymentCollectionId: claimed.id,
        providerId: data.providerId,
        amount: claimed.amount,
        currencyCode: claimed.currencyCode,
        status: 'captured',
        data: cap.data,
        authorizedAt: new Date(),
      })
      const payment = await insertAuthorization(tx, { sessionId, amount: claimed.amount, data: auth.data })
      await insertCapture(tx, { paymentId: payment.id, amount: claimed.amount, createdBy: data.createdBy ?? null })
      await tx
        .update(paymentCollections)
        .set({ status: 'captured', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(paymentCollections.id, claimed.id))
      // Order-level append-only ledger + before/after event when the
      // collection belongs to an order.
      if (claimed.orderId) {
        await tx.insert(orderTransactions).values({
          id: pygId('ordtxn'),
          orderId: claimed.orderId,
          amount: claimed.amount,
          currencyCode: claimed.currencyCode,
          reference: 'capture',
          referenceId: payment.id,
        })
        await tx.insert(orderEvents).values({
          id: pygId('ordevt'),
          orderId: claimed.orderId,
          type: 'payment.captured',
          payload: { paymentCollectionId: claimed.id, capturedBefore: 0, capturedAfter: claimed.amount, amount: claimed.amount, manual: true },
          createdBy: data.createdBy ?? null,
        })
      }
    })
    return (await getCollection(claimed.id))!
  }

  async function createSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
    const data = createPaymentSessionInput.parse(input)
    const [collection] = await db.select().from(paymentCollections).where(eq(paymentCollections.id, data.collectionId)).limit(1)
    if (!collection) throw new Error('payment: collection not found')
    const provider = providers.get('payment', data.providerId)
    // Session id generated up front so the provider can stamp it as
    // correlation metadata (Stripe puts it on the PaymentIntent → webhook
    // recovers the session from it). initiate is a provider call — run it
    // OUTSIDE the tx (no external call inside an open transaction).
    const sessionId = pygId('payses')
    const result = await provider.initiate({
      amount: collection.amount,
      currencyCode: collection.currencyCode,
      context: { ...(data.context ?? {}), sessionId },
    })
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(paymentSessions)
        .values({
          id: sessionId,
          paymentCollectionId: collection.id,
          providerId: data.providerId,
          amount: collection.amount,
          currencyCode: collection.currencyCode,
          status: result.status,
          data: result.data,
          context: data.context ?? null,
        })
        .returning()
      await tx
        .update(paymentCollections)
        .set({ status: 'awaiting', updatedAt: new Date() })
        .where(eq(paymentCollections.id, collection.id))
      await emitDomainEvent(tx, 'payment-session.created', { id: row.id, collectionId: collection.id })
      return row
    })
  }

  // --- Refund reasons (CRUD referential) ---
  // Same shape as return reasons (soft delete).

  const reasons = {
    async list(): Promise<RefundReason[]> {
      return db.select().from(refundReasons).where(isNull(refundReasons.deletedAt)).orderBy(asc(refundReasons.code))
    },
    async get(id: string): Promise<RefundReason | null> {
      const [row] = await db.select().from(refundReasons).where(and(eq(refundReasons.id, id), isNull(refundReasons.deletedAt))).limit(1)
      return row ?? null
    },
    async create(input: CreateRefundReasonInput): Promise<RefundReason> {
      const data = createRefundReasonInput.parse(input)
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(refundReasons)
          .values({ id: pygId('refr'), code: data.code, label: data.label, description: data.description ?? null, metadata: data.metadata ?? null })
          .returning()
        await emitDomainEvent(tx, 'refund-reason.created', { id: row.id })
        return row
      })
    },
    async update(id: string, input: UpdateRefundReasonInput): Promise<RefundReason | null> {
      const data = updateRefundReasonInput.parse(input)
      const [row] = await db
        .update(refundReasons)
        .set({
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(refundReasons.id, id), isNull(refundReasons.deletedAt)))
        .returning()
      return row ?? null
    },
    async remove(id: string): Promise<RefundReason | null> {
      const [row] = await db
        .update(refundReasons)
        .set({ deletedAt: new Date() })
        .where(and(eq(refundReasons.id, id), isNull(refundReasons.deletedAt)))
        .returning()
      return row ?? null
    },
  }

  /** Admin payment list — newest first, optionally scoped to one order. */
  async function listPayments({ orderId, limit = 20, offset = 0 }: { orderId?: string; limit?: number; offset?: number } = {}) {
    const rows = await db
      .select({ payment: payments, orderId: paymentCollections.orderId })
      .from(payments)
      .innerJoin(paymentCollections, eq(payments.paymentCollectionId, paymentCollections.id))
      .where(orderId ? eq(paymentCollections.orderId, orderId) : undefined)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(limit)
      .offset(offset)
    return Promise.all(
      rows.map(async (r) => ({ ...r.payment, orderId: r.orderId, ...(await paymentCapturedRefunded(db, r.payment.id)) })),
    )
  }

  async function getPayment(id: string) {
    const [row] = await db
      .select({ payment: payments, orderId: paymentCollections.orderId })
      .from(payments)
      .innerJoin(paymentCollections, eq(payments.paymentCollectionId, paymentCollections.id))
      .where(eq(payments.id, id))
      .limit(1)
    if (!row) return null
    const captureRows = await db.select().from(captures).where(eq(captures.paymentId, id)).orderBy(asc(captures.createdAt))
    const refundRows = await db.select().from(refunds).where(eq(refunds.paymentId, id)).orderBy(asc(refunds.createdAt))
    return { ...row.payment, orderId: row.orderId, captures: captureRows, refunds: refundRows, ...(await paymentCapturedRefunded(db, id)) }
  }

  async function getCollection(id: string) {
    const [collection] = await db.select().from(paymentCollections).where(eq(paymentCollections.id, id)).limit(1)
    if (!collection) return null
    const sessions = await db.select().from(paymentSessions).where(eq(paymentSessions.paymentCollectionId, id))
    const paymentRows = await db.select().from(payments).where(eq(payments.paymentCollectionId, id))
    const amounts = await collectionAmounts(db, id)
    return { ...collection, sessions, payments: paymentRows, ...amounts }
  }

  async function getCollectionForCart(cartId: string) {
    const [collection] = await db
      .select()
      .from(paymentCollections)
      .where(eq(paymentCollections.cartId, cartId))
      .orderBy(sql`${paymentCollections.createdAt} desc`)
      .limit(1)
    return collection ?? null
  }

  /**
   * Record an authorization = one Payment row (the checkout's TX2 calls the
   * tx-aware helper below directly; this wrapper is the standalone entry).
   */
  async function recordAuthorization(input: { sessionId: string; amount: number }): Promise<Payment> {
    return db.transaction(async (tx) => insertAuthorization(tx, input))
  }

  async function capture(input: { paymentId: string } & CapturePaymentInput): Promise<void> {
    const data = capturePaymentInput.parse(input)
    await db.transaction(async (tx) => insertCapture(tx, { paymentId: input.paymentId, ...data }))
  }

  async function refund(input: { paymentId: string } & RefundPaymentInput): Promise<void> {
    const data = refundPaymentInput.parse(input)
    await db.transaction(async (tx) => insertRefund(tx, { paymentId: input.paymentId, ...data }))
  }

  async function cancel(paymentId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(payments).set({ canceledAt: new Date(), updatedAt: new Date() }).where(eq(payments.id, paymentId))
      await emitDomainEvent(tx, 'payment.canceled', { id: paymentId })
    })
  }

  return {
    collections: {
      create: createCollection,
      createForOrder: createCollectionForOrder,
      markAsPaid,
      get: getCollection,
      forCart: getCollectionForCart,
      listByOrder: (orderId: string) =>
        db.select().from(paymentCollections).where(eq(paymentCollections.orderId, orderId)).orderBy(asc(paymentCollections.createdAt)),
    },
    payments: {
      list: listPayments,
      get: getPayment,
    },
    reasons,
    sessions: { create: createSession },
    recordAuthorization,
    capture,
    refund,
    cancel,
    amounts: (id: string) => collectionAmounts(db, id),
  }
}

export type PaymentService = ReturnType<typeof createPaymentService>

// --- tx-aware helpers (reused by checkout's TX2 and admin ops) ---------------

function assertPositiveIntAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('payment: amount must be a positive integer (cents)')
  }
}

/**
 * Insert a payment collection inside the caller's transaction. Used by the
 * order-edit confirm and the exchange complete so the additional
 * collection is committed ATOMICALLY with the change that created the debt —
 * an order can never end up with a raised total and no way to collect it.
 * Pure DB (no provider call), safe inside a tx.
 */
export async function insertPaymentCollection(
  tx: PygmalionDatabase,
  input: { cartId?: string | null; orderId?: string | null; amount: number; currencyCode: string },
): Promise<PaymentCollection> {
  const [row] = await tx
    .insert(paymentCollections)
    .values({
      id: pygId('payc'),
      cartId: input.cartId ?? null,
      orderId: input.orderId ?? null,
      amount: input.amount,
      currencyCode: input.currencyCode,
    })
    .returning()
  await emitDomainEvent(tx, 'payment-collection.created', { id: row.id, orderId: row.orderId })
  return row
}

export async function insertAuthorization(
  tx: PygmalionDatabase,
  input: { sessionId: string; amount: number; data?: PaymentData },
): Promise<Payment> {
  assertPositiveIntAmount(input.amount)
  const [session] = await tx.select().from(paymentSessions).where(eq(paymentSessions.id, input.sessionId)).limit(1)
  if (!session) throw new Error('payment: session not found')
  const [row] = await tx
    .insert(payments)
    .values({
      id: pygId('pay'),
      paymentCollectionId: session.paymentCollectionId,
      sessionId: session.id,
      amount: input.amount,
      currencyCode: session.currencyCode,
      providerId: session.providerId,
      data: input.data ?? session.data,
    })
    .returning()
  return row
}

export async function insertCapture(
  tx: PygmalionDatabase,
  input: { paymentId: string; amount: number; createdBy?: string | null },
): Promise<void> {
  assertPositiveIntAmount(input.amount)
  // Lock the payment row FIRST (FOR UPDATE) so two concurrent captures can't
  // both pass the cap under real Postgres (TOCTOU). PGlite is single-connection
  // so this is a no-op there, but the semantics are identical. Read-check-insert
  // in that order — the locked read precedes the capture insert.
  const [pay] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1).for('update')
  if (!pay) throw new Error('payment: payment not found')
  if (pay.canceledAt) throw new Error('payment: cannot capture a canceled payment')
  const { captured } = await paymentCapturedRefunded(tx, input.paymentId)
  if (captured + input.amount > pay.amount) {
    throw new Error(`payment: capture ${input.amount} exceeds capturable amount ${pay.amount - captured}`)
  }
  const [row] = await tx.insert(captures).values({ id: pygId('capt'), paymentId: input.paymentId, amount: input.amount, createdBy: input.createdBy ?? null }).returning()
  if (!pay.capturedAt) {
    await tx.update(payments).set({ capturedAt: new Date(), updatedAt: new Date() }).where(eq(payments.id, input.paymentId))
  }
  await emitDomainEvent(tx, 'payment.captured', { id: input.paymentId, captureId: row.id, amount: input.amount })
}

export async function insertRefund(
  tx: PygmalionDatabase,
  input: { paymentId: string; amount: number; note?: string | null; refundReasonId?: string | null; createdBy?: string | null },
): Promise<void> {
  assertPositiveIntAmount(input.amount)
  // Same FOR UPDATE lock as insertCapture — serialize refunds against the cap.
  const [pay] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1).for('update')
  if (!pay) throw new Error('payment: payment not found')
  const { captured, refunded } = await paymentCapturedRefunded(tx, input.paymentId)
  if (input.amount > captured - refunded) {
    throw new Error(`payment: refund ${input.amount} exceeds refundable amount ${captured - refunded}`)
  }
  const [row] = await tx
    .insert(refunds)
    .values({
      id: pygId('ref'),
      paymentId: input.paymentId,
      amount: input.amount,
      note: input.note ?? null,
      refundReasonId: input.refundReasonId ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning()
  await emitDomainEvent(tx, 'payment.refunded', { id: input.paymentId, refundId: row.id, amount: input.amount })
}

export { collectionAmounts, orderCollectionAmounts, paymentCapturedRefunded }
export type { PaymentCollection, PaymentSession, Payment }
