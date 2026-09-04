import type { OrdersVocabKey } from './vocabulary'
import type { PygStatusTone } from '../components/PygStatus.vue'

/**
 * The ONE place the order state machine lives on the admin side.
 *
 * Rule: the UI must never offer an invalid
 * transition. Every guard below mirrors a real server guard
 * (`packages/core/src/services/{checkout,fulfillments,returns,exchanges,
 * claims,order-edits,draft-orders}.ts`) so a button only appears when the
 * call behind it can actually succeed. Pure functions, no fetch — unit
 * tested in `order-status.test.ts`.
 */

// --- Shapes served by /api/admin/orders/:id (checkout.getOrder + route) -------

export interface OrderLine {
  id: string
  productId: string | null
  variantId: string | null
  title: string
  sku: string | null
  thumbnail: string | null
  unitPrice: number
  quantity: number
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
}

export interface FulfillmentLine {
  id: string
  lineItemId: string
  title: string
  sku: string | null
  quantity: number
}

export interface OrderFulfillment {
  id: string
  status: string
  locationId: string | null
  packedAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  canceledAt: string | null
  createdAt: string
  items: FulfillmentLine[]
}

export interface OrderPaymentCollection {
  id: string
  amount: number
  currencyCode: string
  status: string
  createdAt: string
}

export interface OrderTransaction {
  id: string
  amount: number
  currencyCode: string
  reference: string
  createdAt: string
}

export interface OrderShippingMethod {
  id: string
  name: string
  amount: number
  total: number
}

/** Row shape of `GET /api/admin/orders` (raw order, no derived status). */
export interface OrderRow {
  id: string
  displayId: number
  status: string
  email: string | null
  customerId: string | null
  currencyCode: string
  total: number
  isDraftOrder: boolean
  createdAt: string
  canceledAt: string | null
}

/** Full shape of `GET /api/admin/orders/:id`. */
/** Joined by `GET /admin/orders/:id`. */
export interface OrderAddress {
  id: string
  firstName: string | null
  lastName: string | null
  company: string | null
  address1: string | null
  address2: string | null
  postalCode: string | null
  city: string | null
  province: string | null
  countryCode: string | null
  phone: string | null
}

export interface OrderDetail extends OrderRow {
  itemsSubtotal: number
  discountTotal: number
  shippingTotal: number
  taxTotal: number
  items: OrderLine[]
  shippingMethods: OrderShippingMethod[]
  transactions: OrderTransaction[]
  paymentCollections: OrderPaymentCollection[]
  authorizedAmount: number
  capturedAmount: number
  refundedAmount: number
  paymentStatus: string
  fulfillmentStatus: string
  fulfillments: OrderFulfillment[]
  shippingAddress: OrderAddress | null
  billingAddress: OrderAddress | null
}

export interface ReturnLine {
  id: string
  lineItemId: string
  reasonId: string | null
  requestedQuantity: number
  receivedQuantity: number
  damagedQuantity: number
  note: string | null
}

export interface OrderReturn {
  id: string
  orderId: string
  exchangeId: string | null
  claimId: string | null
  status: string
  locationId: string | null
  refundAmount: number | null
  requestedAt: string
  receivedAt: string | null
  canceledAt: string | null
  createdAt: string
  items?: ReturnLine[]
}

export interface OrderExchange {
  id: string
  orderId: string
  status: string
  differenceDue: number | null
  createdAt: string
  completedAt: string | null
  canceledAt: string | null
}

export interface OrderClaim {
  id: string
  orderId: string
  type: string
  status: string
  refundAmount: number | null
  createdAt: string
  completedAt: string | null
  canceledAt: string | null
}

// --- Status -> (tone, label): icon + color + label, never color alone -------

interface StatusView {
  tone: PygStatusTone
  key: OrdersVocabKey
  icon: string
}

const ORDER_STATUS: Record<string, StatusView> = {
  pending: { tone: 'info', key: 'ordStatusPending', icon: 'i-lucide-clock' },
  completed: { tone: 'success', key: 'ordStatusCompleted', icon: 'i-lucide-circle-check' },
  canceled: { tone: 'error', key: 'ordStatusCanceled', icon: 'i-lucide-circle-x' },
  archived: { tone: 'neutral', key: 'ordStatusArchived', icon: 'i-lucide-archive' },
  draft: { tone: 'neutral', key: 'ordStatusDraft', icon: 'i-lucide-file-pen-line' },
  requires_action: { tone: 'warning', key: 'ordStatusRequiresAction', icon: 'i-lucide-triangle-alert' },
}

const PAYMENT_STATUS: Record<string, StatusView> = {
  not_paid: { tone: 'warning', key: 'payStatusNotPaid', icon: 'i-lucide-circle-dashed' },
  awaiting: { tone: 'warning', key: 'payStatusAwaiting', icon: 'i-lucide-hourglass' },
  authorized: { tone: 'info', key: 'payStatusAuthorized', icon: 'i-lucide-hand-coins' },
  partially_authorized: { tone: 'warning', key: 'payStatusPartiallyAuthorized', icon: 'i-lucide-hand-coins' },
  captured: { tone: 'success', key: 'payStatusCaptured', icon: 'i-lucide-badge-check' },
  partially_captured: { tone: 'warning', key: 'payStatusPartiallyCaptured', icon: 'i-lucide-badge-dollar-sign' },
  refunded: { tone: 'neutral', key: 'payStatusRefunded', icon: 'i-lucide-undo-2' },
  partially_refunded: { tone: 'warning', key: 'payStatusPartiallyRefunded', icon: 'i-lucide-undo-2' },
  canceled: { tone: 'error', key: 'payStatusCanceled', icon: 'i-lucide-circle-x' },
}

const FULFILLMENT_STATUS: Record<string, StatusView> = {
  not_fulfilled: { tone: 'warning', key: 'shipStatusNotFulfilled', icon: 'i-lucide-package' },
  partially_fulfilled: { tone: 'warning', key: 'shipStatusPartiallyFulfilled', icon: 'i-lucide-package' },
  fulfilled: { tone: 'info', key: 'shipStatusFulfilled', icon: 'i-lucide-package-check' },
  partially_shipped: { tone: 'warning', key: 'shipStatusPartiallyShipped', icon: 'i-lucide-truck' },
  shipped: { tone: 'info', key: 'shipStatusShipped', icon: 'i-lucide-truck' },
  partially_delivered: { tone: 'warning', key: 'shipStatusPartiallyDelivered', icon: 'i-lucide-map-pin' },
  delivered: { tone: 'success', key: 'shipStatusDelivered', icon: 'i-lucide-house' },
  canceled: { tone: 'error', key: 'shipStatusCanceled', icon: 'i-lucide-circle-x' },
}

const RETURN_STATUS: Record<string, StatusView> = {
  requested: { tone: 'warning', key: 'retStatusRequested', icon: 'i-lucide-rotate-ccw' },
  partially_received: { tone: 'warning', key: 'retStatusPartiallyReceived', icon: 'i-lucide-package-open' },
  received: { tone: 'success', key: 'retStatusReceived', icon: 'i-lucide-package-check' },
  canceled: { tone: 'error', key: 'retStatusCanceled', icon: 'i-lucide-circle-x' },
}

const RMA_STATUS: Record<string, StatusView> = {
  requested: { tone: 'warning', key: 'rmaStatusRequested', icon: 'i-lucide-loader' },
  completed: { tone: 'success', key: 'rmaStatusCompleted', icon: 'i-lucide-circle-check' },
  canceled: { tone: 'error', key: 'rmaStatusCanceled', icon: 'i-lucide-circle-x' },
}

const UNKNOWN: StatusView = { tone: 'neutral', key: 'labelStatus', icon: 'i-lucide-circle-dashed' }

const view = (map: Record<string, StatusView>, status: string): StatusView => map[status] ?? UNKNOWN

export const orderStatusView = (s: string): StatusView => view(ORDER_STATUS, s)
export const paymentStatusView = (s: string): StatusView => view(PAYMENT_STATUS, s)
export const fulfillmentStatusView = (s: string): StatusView => view(FULFILLMENT_STATUS, s)
export const returnStatusView = (s: string): StatusView => view(RETURN_STATUS, s)
export const rmaStatusView = (s: string): StatusView => view(RMA_STATUS, s)

/** Fulfillment status derived from its own timestamps (mirrors fulfillments.ts). */
export function fulfillmentRowStatus(f: OrderFulfillment): string {
  if (f.canceledAt) return 'canceled'
  if (f.deliveredAt) return 'delivered'
  if (f.shippedAt) return 'shipped'
  return 'fulfilled'
}

// --- Per-line remaining quantities -------------------------------------------

const liveFulfillments = (order: OrderDetail) => order.fulfillments.filter((f) => !f.canceledAt)

function sumByLine(fulfillments: OrderFulfillment[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const f of fulfillments) for (const i of f.items) map.set(i.lineItemId, (map.get(i.lineItemId) ?? 0) + i.quantity)
  return map
}

/** Units still to prepare per line (quantity − Σ non-canceled fulfillment items). */
export function remainingToFulfill(order: OrderDetail): Map<string, number> {
  const fulfilled = sumByLine(liveFulfillments(order))
  return new Map(order.items.map((l) => [l.id, Math.max(0, l.quantity - (fulfilled.get(l.id) ?? 0))]))
}

/** Units already shipped per line (returns.ts `shippedByLine`). */
export function shippedByLine(order: OrderDetail): Map<string, number> {
  return sumByLine(liveFulfillments(order).filter((f) => f.shippedAt))
}

/**
 * Units a customer may still send back per line: shipped − already requested
 * on non-canceled returns (returns.ts `insertReturnTx` validation).
 */
export function returnableByLine(order: OrderDetail, returns: OrderReturn[]): Map<string, number> {
  const requested = new Map<string, number>()
  for (const r of returns) {
    if (r.status === 'canceled') continue
    for (const i of r.items ?? []) requested.set(i.lineItemId, (requested.get(i.lineItemId) ?? 0) + i.requestedQuantity)
  }
  const shipped = shippedByLine(order)
  return new Map(order.items.map((l) => [l.id, Math.max(0, (shipped.get(l.id) ?? 0) - (requested.get(l.id) ?? 0))]))
}

/** Lines whose quantity an order edit may still touch (0 fulfilled units). */
export function editableLines(order: OrderDetail): OrderLine[] {
  const fulfilled = sumByLine(liveFulfillments(order))
  return order.items.filter((l) => (fulfilled.get(l.id) ?? 0) === 0)
}

const total = (map: Map<string, number>) => [...map.values()].reduce((a, n) => a + n, 0)

// --- Money caps (integer cents, never floats) ---------------------------------

/** Authorized but not yet collected — the capture cap. */
export const capturable = (o: OrderDetail) => Math.max(0, o.authorizedAmount - o.capturedAmount)
/** Collected but not yet refunded — the refund cap (checkout.doRefund). */
export const refundable = (o: OrderDetail) => Math.max(0, o.capturedAmount - o.refundedAmount)
/** What the merchant has not pocketed yet — the honest "left to collect". */
export const leftToCollect = (o: OrderDetail) => Math.max(0, o.total - o.capturedAmount)

/**
 * What a NEW payment collection could cover. Mirrors `payment.orderOutstanding`:
 * an already-open collection (one an order edit opened by itself, for instance)
 * covers part of the debt, so offering to open another would be refused.
 */
export function outstanding(o: OrderDetail): number {
  const open = o.paymentCollections
    .filter((c) => c.status === 'not_paid' || c.status === 'awaiting')
    .reduce((a, c) => a + c.amount, 0)
  return Math.max(0, o.total - o.authorizedAmount - open)
}

// --- The state machine: what the merchant may do right now --------------------

export interface OrderAbilities {
  canShip: boolean
  canCapture: boolean
  canRefund: boolean
  canReturn: boolean
  canExchange: boolean
  canClaim: boolean
  canEdit: boolean
  canCancel: boolean
  /** Why cancel is impossible, in plain language (null when it is possible). */
  cancelBlocked: OrdersVocabKey | null
  canArchive: boolean
  canUnarchive: boolean
  canCollectMore: boolean
}

export function orderAbilities(order: OrderDetail, returns: OrderReturn[] = []): OrderAbilities {
  const live = order.status !== 'canceled' && order.status !== 'archived' && order.status !== 'draft'
  const hasActiveFulfillment = liveFulfillments(order).length > 0
  const returnable = total(returnableByLine(order, returns))
  const dead = order.status === 'canceled' || order.status === 'archived'

  // Mirrors checkout.cancelOrder's three refusals, in the order it checks them.
  const cancelBlocked: OrdersVocabKey | null = dead
    ? null
    : order.status === 'completed' ? 'whyNoCancelCompleted'
      : hasActiveFulfillment ? 'whyNoCancelFulfillments'
        : refundable(order) > 0 ? 'whyNoCancelCaptured'
          : null

  return {
    canShip: live && total(remainingToFulfill(order)) > 0,
    canCapture: live && capturable(order) > 0,
    canRefund: order.status !== 'draft' && refundable(order) > 0,
    canReturn: live && returnable > 0,
    canExchange: live && returnable > 0,
    canClaim: live && order.items.length > 0,
    canEdit: live && editableLines(order).length > 0,
    canCancel: !dead && cancelBlocked === null,
    cancelBlocked,
    canArchive: !dead && order.status !== 'draft',
    canUnarchive: order.status === 'archived',
    canCollectMore: live && outstanding(order) > 0,
  }
}

/** Return abilities (returns.ts `receive` / `cancel` guards). */
export function returnAbilities(ret: OrderReturn) {
  return {
    canReceive: ret.status === 'requested' || ret.status === 'partially_received',
    // A leg of an exchange/claim is canceled through its parent, never directly.
    canCancel: ret.status === 'requested' && !ret.exchangeId && !ret.claimId,
  }
}

/** Units still receivable on a return line. */
export function receivableByLine(ret: OrderReturn): Map<string, number> {
  return new Map((ret.items ?? []).map((i) => [i.lineItemId, Math.max(0, i.requestedQuantity - i.receivedQuantity)]))
}

/**
 * Exchange/claim completion needs its inbound return fully received
 * (exchanges.complete / claims.complete).
 */
export function rmaAbilities(status: string, inbound: OrderReturn | null) {
  const open = status === 'requested'
  return {
    canComplete: open && (!inbound || inbound.status === 'received'),
    completeBlocked: open && inbound && inbound.status !== 'received' ? ('whyNoExchangeComplete' as OrdersVocabKey) : null,
    canCancel: open,
  }
}

/**
 * The single most useful next action, for the "Prochaine étape" card (a
 * merchant should never wonder what to do). Order matters: money in, then
 * goods out, then closing the loop.
 */
export type NextStep = 'capture' | 'ship' | 'deliver' | 'receiveReturn' | null

export function nextStep(order: OrderDetail, returns: OrderReturn[] = []): NextStep {
  if (order.status === 'canceled' || order.status === 'archived' || order.status === 'draft') return null
  if (returns.some((r) => r.status === 'requested' || r.status === 'partially_received')) return 'receiveReturn'
  if (capturable(order) > 0) return 'capture'
  if (total(remainingToFulfill(order)) > 0) return 'ship'
  if (liveFulfillments(order).some((f) => f.shippedAt && !f.deliveredAt)) return 'deliver'
  return null
}

/** Fulfillment row abilities (fulfillments.ts conditional claims). */
export function fulfillmentAbilities(f: OrderFulfillment) {
  return {
    canShip: !f.canceledAt && !f.shippedAt,
    canDeliver: !f.canceledAt && !!f.shippedAt && !f.deliveredAt,
    canCancel: !f.canceledAt && !f.shippedAt && !f.deliveredAt,
  }
}

/** A payment collection can be marked paid while it is neither paid nor dead. */
export const collectionCanBeMarkedPaid = (c: OrderPaymentCollection) =>
  c.status !== 'captured' && c.status !== 'canceled' && c.status !== 'refunded'

// --- List tabs (by ACTION, not entity status) ---------------------------------

export type OrderTab = 'toShip' | 'toCollect' | 'returns' | 'all'

/** Which action bucket an order falls in (list tabs + dashboard counts). */
export function matchesTab(order: OrderDetail, tab: OrderTab, hasOpenReturn: boolean): boolean {
  if (tab === 'all') return true
  if (tab === 'returns') return hasOpenReturn
  const live = order.status !== 'canceled' && order.status !== 'archived' && order.status !== 'draft'
  if (!live) return false
  if (tab === 'toCollect') return leftToCollect(order) > 0
  return total(remainingToFulfill(order)) > 0
}

/** Free-text match over number / email (the list endpoint takes no `q`). */
export function matchesSearch(order: OrderRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return String(order.displayId).includes(q) || (order.email ?? '').toLowerCase().includes(q) || order.id.toLowerCase().includes(q)
}
