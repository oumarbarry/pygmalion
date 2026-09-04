// Cart service. Every mutation recomputes and persists totals (`recalc`,
// below) inside the same transaction as the write that triggered it, never a
// separate step the caller could forget (one commerce operation = one
// Postgres transaction).
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import {
  cartLineItemAdjustments,
  cartLineItemTaxLines,
  cartLineItems,
  cartShippingMethodAdjustments,
  cartShippingMethodTaxLines,
  cartShippingMethods,
  carts,
  type Cart,
} from '../schema/cart'
// --- Promotions ---------------------------------------------------------------
import { customerGroupMember } from '../schema/customers'
import { products, productVariants } from '../schema/products'
import { regions } from '../schema/settings'
import {
  addLineItemInput,
  createCartInput,
  setCartAddressesInput,
  setCartEmailInput,
  setShippingMethodInput,
  transferCartInput,
  updateLineItemInput,
  type AddLineItemInput,
  type CreateCartInput,
  type SetCartAddressesInput,
  type SetCartEmailInput,
  type SetShippingMethodInput,
  type TransferCartInput,
  type UpdateLineItemInput,
} from '../validation/cart'
import { cartPromotionCodesInput, type CartPromotionCodesInput } from '../validation/promotions'
import { base, initCartTotalsState, shipping, sum, tax } from './cart-totals'
import type { PricingService } from './pricing'
import type { ShippingCartAddress, ShippingService } from './shipping'
import { applyCartPromotions } from './promotions'
import { createTaxService, type TaxAddress, type TaxProviderRegistry } from './tax'
import type { ServiceContext } from './context'
import type { PygmalionDatabase } from '../db/types'

/**
 * Cart only needs `calculatePrices` off pricing — deep-module dependency, not
 * the full service. Tax is different: `recalc` runs inside a transaction, and
 * a `TaxService` built ahead of time is bound to the plain (non-transactional)
 * `db` handle it was constructed with — calling it from inside an open
 * transaction on the SAME underlying connection deadlocks (PGlite/pg both
 * serialize per-connection). So cart takes the provider `registry` instead
 * and builds a tax service scoped to the live `tx` right where it's used
 * (`recalc`, below) — cheap (no state), and the only way to keep the tax
 * lookup inside the same transaction as the totals it writes.
 */
export interface CartServiceContext extends ServiceContext {
  pricing: Pick<PricingService, 'calculatePrices'>
  providers: TaxProviderRegistry
  // --- Shipping ----------------------------------------------------------------
  // Only `resolveForCart` — deep-module dependency, same shape as `pricing`
  // above. `setShippingMethod` calls it OUTSIDE the transaction it opens (same
  // "bound to the plain `db` handle" reasoning as `ctx.pricing` in `addItem`).
  shipping: Pick<ShippingService, 'resolveForCart'>
}

// --- Snapshot resolution (frozen at add-to-cart time) ------------------------

async function resolveVariantSnapshot(db: PygmalionDatabase, variantId: string) {
  const [row] = await db
    .select({
      productId: productVariants.productId,
      variantTitle: productVariants.title,
      sku: productVariants.sku,
      variantThumbnail: productVariants.thumbnail,
      productTitle: products.title,
      productThumbnail: products.thumbnail,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt), isNull(products.deletedAt)))
    .limit(1)
  if (!row) return null
  // Only one `title` column on the line item (deliberate simplification):
  // fold product + variant title together, skipping the variant half when
  // it's the no-op default a single-variant product gets (`products.ts`
  // pattern: `variants.create(id, { title: 'Default' })`).
  const title = row.variantTitle && row.variantTitle !== 'Default' ? `${row.productTitle} — ${row.variantTitle}` : row.productTitle
  return { ...row, title }
}

// --- Full nested read (GET /store/carts/:id response shape) ------------------

async function getFull(db: PygmalionDatabase, id: string) {
  const [cart] = await db.select().from(carts).where(eq(carts.id, id)).limit(1)
  if (!cart) return null

  const items = await db.select().from(cartLineItems).where(eq(cartLineItems.cartId, id)).orderBy(asc(cartLineItems.createdAt))
  const itemIds = items.map((i) => i.id)
  const itemTaxLines = itemIds.length ? await db.select().from(cartLineItemTaxLines).where(inArray(cartLineItemTaxLines.lineItemId, itemIds)) : []
  const itemAdjustments = itemIds.length ? await db.select().from(cartLineItemAdjustments).where(inArray(cartLineItemAdjustments.lineItemId, itemIds)) : []

  const shippingMethods = await db
    .select()
    .from(cartShippingMethods)
    .where(eq(cartShippingMethods.cartId, id))
    .orderBy(asc(cartShippingMethods.createdAt))
  const smIds = shippingMethods.map((s) => s.id)
  const smTaxLines = smIds.length ? await db.select().from(cartShippingMethodTaxLines).where(inArray(cartShippingMethodTaxLines.shippingMethodId, smIds)) : []
  const smAdjustments = smIds.length
    ? await db.select().from(cartShippingMethodAdjustments).where(inArray(cartShippingMethodAdjustments.shippingMethodId, smIds))
    : []

  return {
    ...cart,
    items: items.map((i) => ({
      ...i,
      taxLines: itemTaxLines.filter((t) => t.lineItemId === i.id),
      adjustments: itemAdjustments.filter((a) => a.lineItemId === i.id),
    })),
    shippingMethods: shippingMethods.map((s) => ({
      ...s,
      taxLines: smTaxLines.filter((t) => t.shippingMethodId === s.id),
      adjustments: smAdjustments.filter((a) => a.shippingMethodId === s.id),
    })),
  }
}

export type FullCart = NonNullable<Awaited<ReturnType<typeof getFull>>>

export function createCartService(ctx: CartServiceContext) {
  // --- recalc: base -> promotions -> shipping -> tax -> sum, then persist ---
  // Steps run inline (not via `runCartTotalsPipeline`) so `promotions` below
  // can be given the real engine deps AND its full `applyCartPromotions`
  // result (adjustment rows + budget deltas) instead of just a bare state —
  // `runCartTotalsPipeline` stays the simple `TaxStepDeps`-only orchestrator
  // cart-totals.test.ts pins, untouched.

  async function recalc(tx: PygmalionDatabase, cartId: string, opts: { addCodes?: string[]; removeCodes?: string[] } = {}) {
    const [cart] = await tx.select().from(carts).where(eq(carts.id, cartId)).limit(1)
    if (!cart) throw new Error('cart: not found')

    const items = await tx.select().from(cartLineItems).where(eq(cartLineItems.cartId, cartId))
    const shippingMethods = await tx.select().from(cartShippingMethods).where(eq(cartShippingMethods.cartId, cartId))
    const address: TaxAddress | null = cart.shippingCountryCode
      ? { countryCode: cart.shippingCountryCode, provinceCode: cart.shippingProvince }
      : null

    let state = base(
      initCartTotalsState({
        currencyCode: cart.currencyCode,
        address,
        items: items.map((li) => ({
          id: li.id,
          productId: li.productId,
          unitPrice: li.unitPrice,
          quantity: li.quantity,
          isTaxInclusive: li.isTaxInclusive,
        })),
        shippingMethods: shippingMethods.map((sm) => ({
          id: sm.id,
          shippingOptionId: sm.shippingOptionId,
          amount: sm.amount,
          isTaxInclusive: sm.isTaxInclusive,
        })),
      }),
    )

    // --- Promotions: manual-code baseline recovered from the cart's CURRENT
    // adjustments (no separate "applied codes" table), merged with add/remove
    // requested this call.
    const itemIds = items.map((li) => li.id)
    const smIds = shippingMethods.map((sm) => sm.id)
    const [existingItemCodes, existingSmCodes] = await Promise.all([
      itemIds.length ? tx.select({ code: cartLineItemAdjustments.code }).from(cartLineItemAdjustments).where(inArray(cartLineItemAdjustments.lineItemId, itemIds)) : [],
      smIds.length ? tx.select({ code: cartShippingMethodAdjustments.code }).from(cartShippingMethodAdjustments).where(inArray(cartShippingMethodAdjustments.shippingMethodId, smIds)) : [],
    ])
    const baselineCodes = new Set(
      [...existingItemCodes, ...existingSmCodes].map((a) => a.code).filter((c): c is string => Boolean(c)),
    )
    const addCodes = (opts.addCodes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean)
    for (const c of addCodes) baselineCodes.add(c)
    for (const c of opts.removeCodes ?? []) baselineCodes.delete(c.trim().toUpperCase())

    const customerGroupIds = cart.customerId
      ? (await tx.select({ groupId: customerGroupMember.groupId }).from(customerGroupMember).where(eq(customerGroupMember.customerId, cart.customerId))).map((r) => r.groupId)
      : []

    const { state: afterPromotions, unknownCodes } = await applyCartPromotions(tx, {
      cartId,
      manualCodes: [...baselineCodes],
      state,
      currencyCode: cart.currencyCode,
      regionId: cart.regionId,
      customerGroupIds,
      attributeValues: cart.customerId ? { customer_id: cart.customerId } : {},
    })
    // Only a code just-requested-this-call is worth failing the request over
    // — a stale baseline code (its promotion deleted/deactivated since) is
    // silently dropped rather than breaking every later mutation on the cart.
    const requestedUnknown = addCodes.filter((c) => unknownCodes.includes(c))
    if (requestedUnknown.length) {
      throw new Error(`cart: unknown promotion code(s): ${requestedUnknown.join(', ')}`)
    }
    state = afterPromotions

    state = shipping(state)
    // Scoped to `tx` (see the `CartServiceContext` doc comment above) — never
    // hoist this to a service-level `tax` field bound to `ctx.db`.
    const taxService = createTaxService({ db: tx, providers: ctx.providers })
    state = await tax(state, { taxService })
    const result = sum(state)

    for (const li of result.items) {
      await tx
        .update(cartLineItems)
        .set({ subtotal: li.subtotal, discountTotal: li.discountTotal, taxTotal: li.taxTotal, total: li.total, updatedAt: new Date() })
        .where(eq(cartLineItems.id, li.id))
      // Delete+recreate: tax lines are always fully replaced by the latest
      // resolution, never patched.
      await tx.delete(cartLineItemTaxLines).where(eq(cartLineItemTaxLines.lineItemId, li.id))
      if (li.taxLines.length) {
        await tx.insert(cartLineItemTaxLines).values(
          li.taxLines.map((t) => ({
            id: pygId('clitl'),
            lineItemId: li.id,
            rateId: t.rateId,
            code: t.code,
            name: t.name,
            rate: t.rate,
            providerId: t.providerId,
            amount: t.amount,
          })),
        )
      }
    }

    for (const sm of result.shippingMethods) {
      await tx
        .update(cartShippingMethods)
        .set({ subtotal: sm.subtotal, discountTotal: sm.discountTotal, taxTotal: sm.taxTotal, total: sm.total, updatedAt: new Date() })
        .where(eq(cartShippingMethods.id, sm.id))
      await tx.delete(cartShippingMethodTaxLines).where(eq(cartShippingMethodTaxLines.shippingMethodId, sm.id))
      if (sm.taxLines.length) {
        await tx.insert(cartShippingMethodTaxLines).values(
          sm.taxLines.map((t) => ({
            id: pygId('csmtl'),
            shippingMethodId: sm.id,
            rateId: t.rateId,
            code: t.code,
            name: t.name,
            rate: t.rate,
            providerId: t.providerId,
            amount: t.amount,
          })),
        )
      }
    }

    await tx
      .update(carts)
      .set({
        itemsSubtotal: result.itemsSubtotal,
        shippingTotal: result.shippingTotal,
        discountTotal: result.discountTotal,
        taxTotal: result.taxTotal,
        total: result.total,
        updatedAt: new Date(),
      })
      .where(eq(carts.id, cartId))
  }

  // --- Cart -------------------------------------------------------------------

  async function create(input: CreateCartInput) {
    const data = createCartInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [region] = await tx
        .select()
        .from(regions)
        .where(and(eq(regions.id, data.regionId), isNull(regions.deletedAt)))
        .limit(1)
      if (!region) throw new Error('cart: region not found')
      const [row] = await tx
        .insert(carts)
        .values({
          id: pygId('cart'),
          token: nanoid(),
          customerId: data.customerId ?? null,
          regionId: region.id,
          currencyCode: region.currencyCode,
          salesChannelId: data.salesChannelId ?? null,
          email: data.email ?? null,
          metadata: data.metadata ?? null,
        })
        .returning()
      await emitDomainEvent(tx, 'cart.created', { id: row.id })
      return (await getFull(tx, row.id))!
    })
  }

  async function get(id: string) {
    return getFull(ctx.db, id)
  }

  // --- Line items ---------------------------------------------------------------

  async function addItem(cartId: string, input: AddLineItemInput) {
    const data = addLineItemInput.parse(input)
    // Resolved OUTSIDE the transaction on purpose: `ctx.pricing` is bound to
    // the plain `db` handle, and calling it from inside an open transaction
    // deadlocks on the same connection (see `CartServiceContext` doc comment)
    // — same reason `recalc` below builds its own tx-scoped tax service
    // instead of taking one pre-built. Both reads (cart, variant snapshot,
    // price) are read-only; only the write that follows needs to be atomic.
    const [cart] = await ctx.db.select().from(carts).where(eq(carts.id, cartId)).limit(1)
    if (!cart) return null
    const snapshot = await resolveVariantSnapshot(ctx.db, data.variantId)
    if (!snapshot) throw new Error('cart: variant not found')

    const priceMap = await ctx.pricing.calculatePrices(
      [data.variantId],
      { currencyCode: cart.currencyCode, regionId: cart.regionId, quantity: data.quantity },
      { entity: 'variant' },
    )
    const price = priceMap.get(data.variantId)!
    if (price.calculatedAmount === null) {
      throw new Error('cart: no price found for this variant in the cart currency/region')
    }
    // Narrowed here, not inline below — TS control-flow narrowing does not
    // cross into the transaction closure's function boundary.
    const unitPrice: number = price.calculatedAmount

    return ctx.db.transaction(async (tx) => {
      // Merge into an existing line for the same variant (Medusa v2 parity):
      // bump quantity + refresh the price snapshot instead of a duplicate row.
      const [existing] = await tx
        .select()
        .from(cartLineItems)
        .where(and(eq(cartLineItems.cartId, cartId), eq(cartLineItems.variantId, data.variantId)))
        .limit(1)
      if (existing) {
        await tx
          .update(cartLineItems)
          .set({
            quantity: existing.quantity + data.quantity,
            unitPrice,
            isTaxInclusive: price.isCalculatedPriceTaxInclusive,
            updatedAt: new Date(),
          })
          .where(eq(cartLineItems.id, existing.id))
      } else {
        await tx.insert(cartLineItems).values({
          id: pygId('cli'),
          cartId,
          productId: snapshot.productId,
          variantId: data.variantId,
          title: snapshot.title,
          sku: snapshot.sku,
          thumbnail: snapshot.variantThumbnail ?? snapshot.productThumbnail,
          unitPrice,
          isTaxInclusive: price.isCalculatedPriceTaxInclusive,
          quantity: data.quantity,
          metadata: data.metadata ?? null,
        })
      }

      await recalc(tx, cartId)
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  async function updateItem(cartId: string, lineItemId: string, input: UpdateLineItemInput) {
    const data = updateLineItemInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(cartLineItems)
        .set({ quantity: data.quantity, ...(data.metadata !== undefined ? { metadata: data.metadata } : {}), updatedAt: new Date() })
        .where(and(eq(cartLineItems.id, lineItemId), eq(cartLineItems.cartId, cartId)))
        .returning()
      if (!row) return null
      await recalc(tx, cartId)
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  async function removeItem(cartId: string, lineItemId: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(cartLineItems)
        .where(and(eq(cartLineItems.id, lineItemId), eq(cartLineItems.cartId, cartId)))
        .returning()
      if (!row) return null
      await recalc(tx, cartId)
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  // --- Addresses / email ---------------------------------------------------------

  async function setAddresses(cartId: string, input: SetCartAddressesInput) {
    const data = setCartAddressesInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (data.shippingAddress) {
        const a = data.shippingAddress
        Object.assign(set, {
          shippingFirstName: a.firstName ?? null,
          shippingLastName: a.lastName ?? null,
          shippingCompany: a.company ?? null,
          shippingAddress1: a.address1 ?? null,
          shippingAddress2: a.address2 ?? null,
          shippingCity: a.city ?? null,
          shippingCountryCode: a.countryCode ?? null,
          shippingProvince: a.province ?? null,
          shippingPostalCode: a.postalCode ?? null,
          shippingPhone: a.phone ?? null,
        })
      }
      if (data.billingAddress) {
        const a = data.billingAddress
        Object.assign(set, {
          billingFirstName: a.firstName ?? null,
          billingLastName: a.lastName ?? null,
          billingCompany: a.company ?? null,
          billingAddress1: a.address1 ?? null,
          billingAddress2: a.address2 ?? null,
          billingCity: a.city ?? null,
          billingCountryCode: a.countryCode ?? null,
          billingProvince: a.province ?? null,
          billingPostalCode: a.postalCode ?? null,
          billingPhone: a.phone ?? null,
        })
      }
      const [row] = await tx.update(carts).set(set).where(eq(carts.id, cartId)).returning()
      if (!row) return null
      // Shipping address changed -> the tax address the pipeline resolves
      // against changed too (`recalc` reads it fresh from the row above).
      await recalc(tx, cartId)
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  async function setEmail(cartId: string, input: SetCartEmailInput) {
    const data = setCartEmailInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(carts)
        .set({ email: data.email.trim().toLowerCase(), updatedAt: new Date() })
        .where(eq(carts.id, cartId))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  // --- Shipping method -----------------------------------------------------------
  // Single active shipping method per cart (deliberate simplification: Medusa
  // v2 allows several for split/multi-warehouse fulfillment; add that when a
  // real use case demands it): setting one replaces whatever was there.
  //
  // Shipping option seam (documented in `schema/cart.ts` + `validation/cart.ts`):
  // when the caller supplies `shippingOptionId`, it's resolved for real
  // against `shipping_option` (zone match on the cart's address, eligibility
  // rules, profile of the cart's products, price) — `name`/`amount`/
  // `isTaxInclusive` come from that resolution, never from the body. No
  // `shippingOptionId` -> manual/custom charge (`name`+`amount` trusted as
  // given; `validation/cart.ts` requires both then).

  async function setShippingMethod(cartId: string, input: SetShippingMethodInput) {
    const data = setShippingMethodInput.parse(input)
    // Resolved OUTSIDE the transaction on purpose — `ctx.shipping` is bound to
    // the plain `db` handle (same reasoning as `ctx.pricing` in `addItem`).
    const [cart] = await ctx.db.select().from(carts).where(eq(carts.id, cartId)).limit(1)
    if (!cart) return null

    let resolved: { shippingOptionId: string | null; name: string; amount: number; isTaxInclusive: boolean }
    if (data.shippingOptionId) {
      const items = await ctx.db.select().from(cartLineItems).where(eq(cartLineItems.cartId, cartId))
      const address: ShippingCartAddress | null = cart.shippingCountryCode
        ? {
            countryCode: cart.shippingCountryCode,
            province: cart.shippingProvince,
            city: cart.shippingCity,
            postalCode: cart.shippingPostalCode,
          }
        : null
      const option = await ctx.shipping.resolveForCart(
        {
          currencyCode: cart.currencyCode,
          regionId: cart.regionId,
          address,
          items: items.map((li) => ({ productId: li.productId, unitPrice: li.unitPrice, quantity: li.quantity })),
        },
        data.shippingOptionId,
      )
      resolved = option
    } else {
      // `.refine` in `setShippingMethodInput` guarantees both are set here.
      resolved = { shippingOptionId: null, name: data.name!, amount: data.amount!, isTaxInclusive: data.isTaxInclusive ?? false }
    }

    return ctx.db.transaction(async (tx) => {
      const [row] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1)
      if (!row) return null
      await tx.delete(cartShippingMethods).where(eq(cartShippingMethods.cartId, cartId))
      await tx.insert(cartShippingMethods).values({
        id: pygId('csm'),
        cartId,
        shippingOptionId: resolved.shippingOptionId,
        name: resolved.name,
        amount: resolved.amount,
        isTaxInclusive: resolved.isTaxInclusive,
      })
      await recalc(tx, cartId)
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  // --- Promotions: POST/DELETE /store/carts/:id/promotions -------------------
  // Manual codes only (an automatic promotion never needs a route — `recalc`
  // above always re-evaluates every `is_automatic` promotion on its own).

  async function applyPromotions(cartId: string, input: CartPromotionCodesInput) {
    const data = cartPromotionCodesInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1)
      if (!cart) return null
      await recalc(tx, cartId, { addCodes: data.promotionCodes })
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  async function removePromotions(cartId: string, input: CartPromotionCodesInput) {
    const data = cartPromotionCodesInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1)
      if (!cart) return null
      await recalc(tx, cartId, { removeCodes: data.promotionCodes })
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  // --- Force tax recalc (POST /store/carts/:id/taxes) -----------------------

  async function recalcTaxes(cartId: string) {
    return ctx.db.transaction(async (tx) => {
      const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1)
      if (!cart) return null
      await recalc(tx, cartId)
      await emitDomainEvent(tx, 'cart.updated', { id: cartId })
      return getFull(tx, cartId)
    })
  }

  // --- Transfer (guest -> customer, on login) -----------------------------------

  async function transferToCustomer(cartId: string, input: TransferCartInput) {
    const data = transferCartInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(carts)
        .set({ customerId: data.customerId, updatedAt: new Date() })
        .where(eq(carts.id, cartId))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'cart.customer_transferred', { id: cartId, customerId: data.customerId })
      return getFull(tx, cartId)
    })
  }

  return {
    create,
    get,
    addItem,
    updateItem,
    removeItem,
    setAddresses,
    setEmail,
    setShippingMethod,
    applyPromotions,
    removePromotions,
    recalcTaxes,
    transferToCustomer,
  }
}

export type CartService = ReturnType<typeof createCartService>
export type { Cart }
