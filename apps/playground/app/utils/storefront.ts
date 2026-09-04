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

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  const code = (currency ?? 'eur').toUpperCase()
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: code }).format(amount / 10 ** exponent(code))
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

// --- Order status, in plain French -------------------------------------------
// The admin has its own vocabulary (merchant-facing). A shopper reads a
// different sentence about the same row: not "fulfillment_status: shipped" but
// "expédiée". Tone is a tuple so a badge can colour itself.

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

const ORDER: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'En cours de traitement', tone: 'info' },
  completed: { label: 'Terminée', tone: 'success' },
  canceled: { label: 'Annulée', tone: 'error' },
  archived: { label: 'Archivée', tone: 'neutral' },
  requires_action: { label: 'Action requise', tone: 'warning' },
}

const PAYMENT: Record<string, { label: string; tone: StatusTone }> = {
  not_paid: { label: 'Paiement en attente', tone: 'warning' },
  awaiting: { label: 'Paiement en attente', tone: 'warning' },
  authorized: { label: 'Paiement autorisé', tone: 'info' },
  partially_authorized: { label: 'Paiement partiel', tone: 'warning' },
  captured: { label: 'Payée', tone: 'success' },
  partially_captured: { label: 'Partiellement payée', tone: 'warning' },
  refunded: { label: 'Remboursée', tone: 'neutral' },
  partially_refunded: { label: 'Partiellement remboursée', tone: 'warning' },
  canceled: { label: 'Paiement annulé', tone: 'error' },
}

const SHIPMENT: Record<string, { label: string; tone: StatusTone }> = {
  not_fulfilled: { label: 'En préparation', tone: 'info' },
  partially_fulfilled: { label: 'En préparation', tone: 'info' },
  fulfilled: { label: 'Prête à partir', tone: 'info' },
  partially_shipped: { label: 'Partiellement expédiée', tone: 'info' },
  shipped: { label: 'Expédiée', tone: 'success' },
  partially_delivered: { label: 'Partiellement livrée', tone: 'success' },
  delivered: { label: 'Livrée', tone: 'success' },
  canceled: { label: 'Expédition annulée', tone: 'error' },
}

const UNKNOWN = { label: 'Statut inconnu', tone: 'neutral' as StatusTone }

export const orderLabel = (s: string) => ORDER[s] ?? UNKNOWN
export const paymentLabel = (s: string) => PAYMENT[s] ?? UNKNOWN
export const shipmentLabel = (s: string) => SHIPMENT[s] ?? UNKNOWN

/**
 * The one line a customer actually wants on an order card: where the parcel
 * is, unless something more urgent (cancelled, unpaid) outranks it.
 */
export function orderHeadline(order: { status: string; paymentStatus: string; fulfillmentStatus?: string }) {
  if (order.status === 'canceled' || order.status === 'archived') return orderLabel(order.status)
  if (order.paymentStatus === 'not_paid' || order.paymentStatus === 'awaiting') return paymentLabel(order.paymentStatus)
  return shipmentLabel(order.fulfillmentStatus ?? 'not_fulfilled')
}

/**
 * Which variant a set of chosen option values points at.
 *
 * The picker is driven by the product's OPTIONS (two selects, "Bleu nuit" /
 * "Grande"), and the cart needs a variant id. A variant carries exactly one
 * value per option, so the match is a set comparison — `null` while the
 * shopper hasn't chosen everything yet, which is what disables "Ajouter".
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
 * shows "Ça n'a pas fonctionné" plus the server's own English message
 * ("Product not found") and a Réessayer button that can only fail again — a
 * dead end, in the wrong language (§S7). Pages that can legitimately 404 route
 * the 404 to their `empty` state instead, which already says it in French and
 * offers the way out.
 */
export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 404
}
