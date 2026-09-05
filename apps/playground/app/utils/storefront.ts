import type { ShopTextKey } from './shop-text'

/**
 * Storefront-side helpers. Pure functions, no fetch — unit tested next door.
 *
 * Named `storefront.ts` rather than `money.ts`/`order-status.ts` on purpose:
 * the `@oumarbarry/pygmalion-admin` layer already auto-imports files with those names, and
 * two layers exporting the same basename shadow each other.
 */

/**
 * Minor units -> what a shopper reads. The integer comes from the API and
 * is only ever DIVIDED for display — the storefront never adds, discounts or
 * taxes anything itself.
 *
 * The exponent comes from `Intl`, so a 0-decimal currency (JPY, XOF) doesn't
 * print a hundred times its price. The `@oumarbarry/pygmalion-admin` layer has its own
 * `currencyExponent` and Nuxt would auto-import it here — deliberately not
 * used: a storefront util silently depending on another layer's auto-import
 * is coupling you only discover when it breaks outside Nuxt (it did, in this
 * file's own unit test).
 */
function exponent(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale = 'en-US',
): string {
  if (amount === null || amount === undefined) return '—'
  const code = (currency ?? 'eur').toUpperCase()
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount / 10 ** exponent(code))
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`
  }
}

/** Cheapest variant of a listing row — the "à partir de" price under a card. */
export function priceFrom(variants: { calculatedPrice?: { calculatedAmount: number | null } | null }[] | undefined): number | null {
  const amounts = (variants ?? [])
    .map((v) => v.calculatedPrice?.calculatedAmount)
    .filter((a): a is number => typeof a === 'number')
  return amounts.length ? Math.min(...amounts) : null
}

// --- Order status, in a shopper's words ---------------------------------------
// The admin has its own vocabulary (merchant-facing). A shopper reads a
// different sentence about the same row: not "fulfillment_status: shipped" but
// "shipped". Each status maps to a `shop-text` key (the page renders it in the
// shopper's language) and a tone, so a badge can colour itself.


export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'
export interface StatusDisplay {
  key: ShopTextKey
  tone: StatusTone
}

const ORDER: Record<string, StatusDisplay> = {
  pending: { key: 'statusOrderPending', tone: 'info' },
  completed: { key: 'statusOrderCompleted', tone: 'success' },
  canceled: { key: 'statusOrderCanceled', tone: 'error' },
  archived: { key: 'statusOrderArchived', tone: 'neutral' },
  requires_action: { key: 'statusOrderRequiresAction', tone: 'warning' },
}

const PAYMENT: Record<string, StatusDisplay> = {
  not_paid: { key: 'statusPaymentAwaiting', tone: 'warning' },
  awaiting: { key: 'statusPaymentAwaiting', tone: 'warning' },
  authorized: { key: 'statusPaymentAuthorized', tone: 'info' },
  partially_authorized: { key: 'statusPaymentPartiallyAuthorized', tone: 'warning' },
  captured: { key: 'statusPaymentCaptured', tone: 'success' },
  partially_captured: { key: 'statusPaymentPartiallyCaptured', tone: 'warning' },
  refunded: { key: 'statusPaymentRefunded', tone: 'neutral' },
  partially_refunded: { key: 'statusPaymentPartiallyRefunded', tone: 'warning' },
  canceled: { key: 'statusPaymentCanceled', tone: 'error' },
}

const SHIPMENT: Record<string, StatusDisplay> = {
  not_fulfilled: { key: 'statusShipmentPreparing', tone: 'info' },
  partially_fulfilled: { key: 'statusShipmentPreparing', tone: 'info' },
  fulfilled: { key: 'statusShipmentReady', tone: 'info' },
  partially_shipped: { key: 'statusShipmentPartiallyShipped', tone: 'info' },
  shipped: { key: 'statusShipmentShipped', tone: 'success' },
  partially_delivered: { key: 'statusShipmentPartiallyDelivered', tone: 'success' },
  delivered: { key: 'statusShipmentDelivered', tone: 'success' },
  canceled: { key: 'statusShipmentCanceled', tone: 'error' },
}

const UNKNOWN: StatusDisplay = { key: 'statusUnknown', tone: 'neutral' }

export const orderLabel = (s: string): StatusDisplay => ORDER[s] ?? UNKNOWN
export const paymentLabel = (s: string): StatusDisplay => PAYMENT[s] ?? UNKNOWN
export const shipmentLabel = (s: string): StatusDisplay => SHIPMENT[s] ?? UNKNOWN

/**
 * The one line a customer actually wants on an order card: where the parcel
 * is, unless something more urgent (cancelled, unpaid) outranks it.
 */
export function orderHeadline(order: { status: string; paymentStatus: string; fulfillmentStatus?: string }): StatusDisplay {
  if (order.status === 'canceled' || order.status === 'archived') return orderLabel(order.status)
  if (order.paymentStatus === 'not_paid' || order.paymentStatus === 'awaiting') return paymentLabel(order.paymentStatus)
  return shipmentLabel(order.fulfillmentStatus ?? 'not_fulfilled')
}

/**
 * Which variant a set of chosen option values points at.
 *
 * The picker is driven by the product's OPTIONS (two selects, "Midnight blue" /
 * "Large"), and the cart needs a variant id. A variant carries exactly one
 * value per option, so the match is a set comparison: `null` while the
 * shopper hasn't chosen everything yet, which is what disables "Add to cart".
 */
export function variantForOptions<V extends { optionValueIds: string[] }>(
  variants: V[],
  chosen: Record<string, string>,
  optionCount: number,
): V | null {
  const wanted = Object.values(chosen).filter(Boolean)
  if (wanted.length < optionCount) return null
  return variants.find((v) => wanted.every((id) => v.optionValueIds.includes(id))) ?? null
}

/**
 * A 404 is not a failure, it's an answer: the thing isn't there.
 *
 * `AsyncState` renders `error` before `empty`, so a page that hands it a 404
 * shows the generic "something went wrong" text plus the server's own message
 * ("Product not found") and a retry button that can only fail again: a dead
 * end. Pages that can legitimately 404 route the 404 to their `empty` state
 * instead, which already says it in the shopper's language and offers the way
 * out.
 */
export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 404
}
