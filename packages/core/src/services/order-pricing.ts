import { eq, inArray } from 'drizzle-orm'
import { pygId } from '../id'
import { orderAddresses, orderLineItems, type Order } from '../schema/orders'
import { productVariants } from '../schema/products'
import { createInventoryService } from './inventory'
import type { TaxService } from './tax'
import type { PygmalionDatabase } from '../db/types'

/** An added order line for tax resolution — the shared shape across order edits,
 * exchange outbound, and claim replacement lines. */
export interface AddedLine {
  variantId: string | null
  unitPrice: number
  quantity: number
}

/**
 * Tax amount (cents) for each added line, resolved against the order's shipping
 * address + region via the tax service, same rates/rounding as the cart
 * pipeline: `taxTotal = round(subtotal × rate/100)`, non-tax-inclusive. Returns
 * 0 for a line when the order has no shipping address / no matching tax region.
 * Pure reads, safe to call outside a tx. Extracted from order-edits so exchange +
 * claim outbound lines carry real tax too.
 */
export async function resolveAdditionTaxes(
  db: PygmalionDatabase,
  tax: Pick<TaxService, 'getTaxLines'>,
  order: Order,
  additions: AddedLine[],
): Promise<number[]> {
  if (!additions.length) return []
  const address = order.shippingAddressId
    ? (await db.select().from(orderAddresses).where(eq(orderAddresses.id, order.shippingAddressId)).limit(1))[0]
    : undefined
  return resolveAdditionTaxesForAddress(db, tax, address ? { countryCode: address.countryCode, province: address.province } : null, additions)
}

/**
 * Same as `resolveAdditionTaxes` but takes the address directly, for callers
 * (draft orders) that price lines BEFORE the order/address rows exist. Pure
 * reads: call outside the tx (the tax service holds its own db handle).
 */
export async function resolveAdditionTaxesForAddress(
  db: PygmalionDatabase,
  tax: Pick<TaxService, 'getTaxLines'>,
  address: { countryCode: string | null; province: string | null } | null,
  additions: AddedLine[],
): Promise<number[]> {
  if (!additions.length) return []
  if (!address?.countryCode) return additions.map(() => 0)

  // Resolve productId for variant-backed lines (custom lines pass null — only an
  // is_default region rate applies to them, which is correct).
  const variantIds = additions.map((a) => a.variantId).filter((v): v is string => !!v)
  const variants = variantIds.length
    ? await db.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants).where(inArray(productVariants.id, variantIds))
    : []
  const productByVariant = new Map(variants.map((v) => [v.id, v.productId]))

  const items = additions.map((a, i) => ({
    id: `add_${i}`,
    reference: 'product',
    referenceId: (a.variantId ? productByVariant.get(a.variantId) : '') ?? '',
  }))
  const lines = await tax.getTaxLines(items, { address: { countryCode: address.countryCode, provinceCode: address.province } })
  const rateByItem = new Map<string, number>()
  for (const l of lines) rateByItem.set(l.itemId, (rateByItem.get(l.itemId) ?? 0) + l.rate)
  return additions.map((a, i) => Math.round((a.unitPrice * a.quantity * (rateByItem.get(`add_${i}`) ?? 0)) / 100))
}

export interface OutboundLine {
  variantId?: string | null
  title: string
  sku?: string | null
  unitPrice: number
  quantity: number
  note?: string | null
}

export interface InsertedOutboundLine {
  lineItemId: string
  variantId: string | null
  title: string
  sku: string | null
  unitPrice: number
  quantity: number
  note: string | null
  subtotal: number
  taxTotal: number
  total: number
}

/**
 * Insert outbound (replacement) lines as real `order_line_items` and reserve the
 * managed variants — the shared "edit-addition"-style materialization used by
 * exchange and claim outbound. Tags each line with `metadata` (exchangeId /
 * claimId) so it stays identifiable + fulfillable. `addTax[i]` is the resolved
 * tax for line i (from `resolveAdditionTaxes`). Must run inside the caller's tx.
 */
export async function insertReservedOutboundLinesTx(
  tx: PygmalionDatabase,
  orderId: string,
  outbound: OutboundLine[],
  addTax: number[],
  tag: Record<string, unknown>,
): Promise<InsertedOutboundLine[]> {
  if (!outbound.length) return []
  const inv = createInventoryService({ db: tx })
  const [loc] = await inv.locations.list({ limit: 1 })
  const inserted: InsertedOutboundLine[] = []
  for (let i = 0; i < outbound.length; i++) {
    const o = outbound[i]
    const id = pygId('oli')
    const subtotal = o.unitPrice * o.quantity
    const taxTotal = addTax[i] ?? 0
    await tx.insert(orderLineItems).values({
      id,
      orderId,
      variantId: o.variantId ?? null,
      title: o.title,
      sku: o.sku ?? null,
      unitPrice: o.unitPrice,
      quantity: o.quantity,
      subtotal,
      discountTotal: 0,
      taxTotal,
      total: subtotal + taxTotal,
      metadata: tag,
    })
    if (o.variantId) {
      if (!loc) throw new Error('order-pricing: no stock location configured to reserve outbound lines against')
      await inv.reserveVariants({ locationId: loc.id, items: [{ variantId: o.variantId, quantity: o.quantity, lineItemId: id }] })
    }
    inserted.push({ lineItemId: id, variantId: o.variantId ?? null, title: o.title, sku: o.sku ?? null, unitPrice: o.unitPrice, quantity: o.quantity, note: o.note ?? null, subtotal, taxTotal, total: subtotal + taxTotal })
  }
  return inserted
}

/** Proportional refundable value (line total, tax incl.) of returned units per line. */
export async function inboundValue(
  dbh: PygmalionDatabase,
  inbound: { lineItemId: string; quantity: number }[],
): Promise<number> {
  if (!inbound.length) return 0
  const ids = [...new Set(inbound.map((i) => i.lineItemId))]
  const lines = await dbh.select().from(orderLineItems).where(inArray(orderLineItems.id, ids))
  const byId = new Map(lines.map((l) => [l.id, l]))
  let total = 0
  for (const i of inbound) {
    const line = byId.get(i.lineItemId)
    if (!line) continue
    const perUnit = line.quantity ? Math.round(line.total / line.quantity) : 0
    total += perUnit * i.quantity
  }
  return total
}
