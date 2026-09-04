// Shipping. `price_type: calculated` is supported as a mechanism; the
// built-in `manual` provider never supports it (same as Medusa's
// `fulfillment-manual`). Config only: fulfillment_set -> service_zone ->
// geo_zone, shipping_profile (+ product link), shipping_option (+ rules).
// Fulfillment execution lives in `services/fulfillments.ts`; the
// `FulfillmentProvider.createFulfillment`/`cancelFulfillment` contract below
// is what a provider implements.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import {
  fulfillmentSets,
  geoZones,
  serviceZones,
  shippingOptionRules,
  shippingOptions,
  shippingProfileProducts,
  shippingProfiles,
  type FulfillmentSet,
  type GeoZone,
  type ServiceZone,
  type ShippingOption,
  type ShippingOptionRule,
  type ShippingProfile,
} from '../schema/fulfillment-config'
import {
  createFulfillmentSetInput,
  createServiceZoneInput,
  createShippingOptionInput,
  createShippingProfileInput,
  shippingProfileProductsInput,
  updateFulfillmentSetInput,
  updateServiceZoneInput,
  updateShippingOptionInput,
  updateShippingProfileInput,
  type CreateFulfillmentSetInput,
  type CreateServiceZoneInput,
  type CreateShippingOptionInput,
  type CreateShippingProfileInput,
  type GeoZoneInput,
  type ShippingProfileProductsInput,
  type UpdateFulfillmentSetInput,
  type UpdateServiceZoneInput,
  type UpdateShippingOptionInput,
  type UpdateShippingProfileInput,
} from '../validation/shipping'
import type { PricingService } from './pricing'
import type { ServiceContext } from './context'
import type { PygmalionDatabase } from '../db/types'

// --- FulfillmentProvider-------------------------------------------------------
// Only the 4 primitives the config layer needs. As in Medusa, every method has
// a default that throws and none is abstract: `defaultFulfillmentProvider`
// below is that default, spread into a provider that only overrides what it
// actually implements (like `createManualFulfillmentProvider`).

export interface CreateFulfillmentResult {
  data: Record<string, unknown>
}

export interface CalculatedShippingOptionPrice {
  calculatedAmount: number
  isCalculatedPriceTaxInclusive: boolean
}

export interface FulfillmentProvider {
  getIdentifier(): string
  createFulfillment(data: Record<string, unknown>): Promise<CreateFulfillmentResult>
  cancelFulfillment(data: Record<string, unknown>): Promise<CreateFulfillmentResult>
  /** Must return `true` before a `price_type: calculated` option pointing at this provider can be created. */
  canCalculate(optionData: Record<string, unknown>): Promise<boolean>
  calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<CalculatedShippingOptionPrice>
}

async function notSupported(method: string): Promise<never> {
  throw new Error(`fulfillment: '${method}' is not supported by this provider`)
}

/** Spread this into a provider, then override only what's actually implemented. */
export const defaultFulfillmentProvider: Omit<FulfillmentProvider, 'getIdentifier'> = {
  createFulfillment: () => notSupported('createFulfillment'),
  cancelFulfillment: () => notSupported('cancelFulfillment'),
  canCalculate: async () => false,
  calculatePrice: () => notSupported('calculatePrice'),
}

/**
 * Parity with Medusa's `fulfillment-manual`: no-op
 * create/cancel (`{ data: {} }`, no third-party call), `canCalculate` always
 * `false` (left on the default) — a `manual` option can only ever be
 * `price_type: flat`. Registered under id `manual` by `@oumarbarry/pygmalion`'s
 * plugin, same precedent as tax's `system` provider.
 */
export function createManualFulfillmentProvider(): FulfillmentProvider {
  return {
    getIdentifier: () => 'manual',
    ...defaultFulfillmentProvider,
    async createFulfillment() {
      return { data: {} }
    },
    async cancelFulfillment() {
      return { data: {} }
    },
  }
}

/** Same structural-typing seam as `TaxProviderRegistry` (`pygmalion:providers`). */
export interface FulfillmentProviderRegistry {
  get<T = unknown>(type: 'fulfillment', id: string): T
}

export interface ShippingServiceContext extends ServiceContext {
  pricing: Pick<PricingService, 'calculatePrices'>
  providers: FulfillmentProviderRegistry
}

// --- Cart-facing shapes (consumed by services/cart.ts::setShippingMethod) ------

export interface ShippingCartAddress {
  countryCode: string
  province?: string | null
  city?: string | null
  postalCode?: string | null
}

export interface ShippingCartLine {
  productId: string | null
  unitPrice: number
  quantity: number
}

export interface ShippingCartContext {
  currencyCode: string
  regionId?: string | null
  address: ShippingCartAddress | null
  items: ShippingCartLine[]
}

export interface EligibleShippingOption {
  id: string
  name: string
  priceType: 'flat' | 'calculated'
  amount: number
  isTaxInclusive: boolean
  providerId: string
}

// --- Matching helpers (pure, unit-tested directly) ------------------------------

/** `type=country` matches any address in that country (already pre-filtered by country); province/city/zip narrow further. */
export function geoZoneMatches(
  zone: Pick<GeoZone, 'type' | 'provinceCode' | 'city' | 'postalExpression'>,
  address: { province: string | null; city: string | null; postalCode: string | null },
): boolean {
  if (zone.type === 'country') return true
  const province = address.province ? address.province.toLowerCase() : null
  if (zone.type === 'province') return zone.provinceCode === province
  if (zone.type === 'city') {
    return zone.provinceCode === province && (zone.city ?? '').toLowerCase() === (address.city ?? '').toLowerCase()
  }
  // zip
  if (zone.provinceCode && zone.provinceCode !== province) return false
  const expr = zone.postalExpression
  if (!expr || !address.postalCode) return false
  if (expr.codes && expr.codes.includes(address.postalCode)) return true
  if (expr.prefix && address.postalCode.startsWith(expr.prefix)) return true
  return false
}

/** ET strict rule matching against a cart-derived numeric context — `item_total` (cents) / `item_count` are the two attributes cart matching resolves. */
export function ruleMatches(rule: Pick<ShippingOptionRule, 'attribute' | 'operator' | 'value'>, context: Record<string, number>): boolean {
  const actual = context[rule.attribute]
  if (actual === undefined) return false
  const value = rule.value
  const scalar = Array.isArray(value) ? value[0] : value
  switch (rule.operator) {
    case 'eq':
      return actual === scalar
    case 'ne':
      return actual !== scalar
    case 'gt':
      return actual > scalar
    case 'gte':
      return actual >= scalar
    case 'lt':
      return actual < scalar
    case 'lte':
      return actual <= scalar
    case 'in':
      return Array.isArray(value) && value.includes(actual)
    default:
      return false
  }
}

function validateGeoZoneInput(z: GeoZoneInput): void {
  if (z.type !== 'country' && !z.provinceCode) {
    throw new Error(`shipping: provinceCode is required for a '${z.type}' geo zone`)
  }
  if (z.type === 'city' && !z.city) {
    throw new Error("shipping: city is required for a 'city' geo zone")
  }
  if (z.type === 'zip' && !z.postalExpression) {
    throw new Error("shipping: postalExpression is required for a 'zip' geo zone")
  }
}

async function insertGeoZones(tx: PygmalionDatabase, serviceZoneId: string, zones: GeoZoneInput[]) {
  if (!zones.length) return
  for (const z of zones) validateGeoZoneInput(z)
  await tx.insert(geoZones).values(
    zones.map((z) => ({
      id: pygId('geozone'),
      serviceZoneId,
      type: z.type,
      countryCode: z.countryCode,
      provinceCode: z.provinceCode ?? null,
      city: z.city ?? null,
      postalExpression: z.postalExpression ?? null,
    })),
  )
}

export function createShippingService(ctx: ShippingServiceContext) {
  // --- FulfillmentSet ----------------------------------------------------------

  async function getFulfillmentSet(id: string): Promise<FulfillmentSet | null> {
    const [row] = await ctx.db.select().from(fulfillmentSets).where(and(eq(fulfillmentSets.id, id), isNull(fulfillmentSets.deletedAt))).limit(1)
    return row ?? null
  }

  async function createFulfillmentSet(input: CreateFulfillmentSetInput) {
    const data = createFulfillmentSetInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx.insert(fulfillmentSets).values({ id: pygId('fuset'), name: data.name, metadata: data.metadata ?? null }).returning()
      await emitDomainEvent(tx, 'fulfillment-set.created', { id: row.id })
      return row
    })
  }

  async function updateFulfillmentSet(id: string, input: UpdateFulfillmentSetInput) {
    const data = updateFulfillmentSetInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(fulfillmentSets)
        .set({ ...(data.name !== undefined ? { name: data.name } : {}), ...(data.metadata !== undefined ? { metadata: data.metadata } : {}), updatedAt: new Date() })
        .where(and(eq(fulfillmentSets.id, id), isNull(fulfillmentSets.deletedAt)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'fulfillment-set.updated', { id: row.id })
      return row
    })
  }

  async function removeFulfillmentSet(id: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx.update(fulfillmentSets).set({ deletedAt: new Date() }).where(and(eq(fulfillmentSets.id, id), isNull(fulfillmentSets.deletedAt))).returning()
      if (!row) return null
      const zones = await tx.select({ id: serviceZones.id }).from(serviceZones).where(and(eq(serviceZones.fulfillmentSetId, id), isNull(serviceZones.deletedAt)))
      if (zones.length) {
        await tx
          .update(serviceZones)
          .set({ deletedAt: new Date() })
          .where(inArray(serviceZones.id, zones.map((z) => z.id)))
      }
      await emitDomainEvent(tx, 'fulfillment-set.deleted', { id: row.id })
      return row
    })
  }

  // --- ServiceZone (+ inline GeoZones) ------------------------------------------

  async function getServiceZone(id: string): Promise<ServiceZone | null> {
    const [row] = await ctx.db.select().from(serviceZones).where(and(eq(serviceZones.id, id), isNull(serviceZones.deletedAt))).limit(1)
    return row ?? null
  }

  async function listGeoZones(serviceZoneId: string): Promise<GeoZone[]> {
    return ctx.db.select().from(geoZones).where(eq(geoZones.serviceZoneId, serviceZoneId))
  }

  async function createServiceZone(fulfillmentSetId: string, input: CreateServiceZoneInput) {
    const data = createServiceZoneInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [set] = await tx.select({ id: fulfillmentSets.id }).from(fulfillmentSets).where(and(eq(fulfillmentSets.id, fulfillmentSetId), isNull(fulfillmentSets.deletedAt))).limit(1)
      if (!set) throw new Error('shipping: fulfillment set not found')
      const [row] = await tx.insert(serviceZones).values({ id: pygId('svczone'), fulfillmentSetId, name: data.name, metadata: data.metadata ?? null }).returning()
      await insertGeoZones(tx, row.id, data.geoZones ?? [])
      await emitDomainEvent(tx, 'service-zone.created', { id: row.id, fulfillmentSetId })
      return row
    })
  }

  async function updateServiceZone(id: string, input: UpdateServiceZoneInput) {
    const data = updateServiceZoneInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(serviceZones)
        .set({ ...(data.name !== undefined ? { name: data.name } : {}), ...(data.metadata !== undefined ? { metadata: data.metadata } : {}), updatedAt: new Date() })
        .where(and(eq(serviceZones.id, id), isNull(serviceZones.deletedAt)))
        .returning()
      if (!row) return null
      if (data.geoZones !== undefined) {
        await tx.delete(geoZones).where(eq(geoZones.serviceZoneId, id))
        await insertGeoZones(tx, id, data.geoZones)
      }
      await emitDomainEvent(tx, 'service-zone.updated', { id: row.id })
      return row
    })
  }

  async function removeServiceZone(id: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx.update(serviceZones).set({ deletedAt: new Date() }).where(and(eq(serviceZones.id, id), isNull(serviceZones.deletedAt))).returning()
      if (!row) return null
      await tx.delete(geoZones).where(eq(geoZones.serviceZoneId, id))
      await tx.update(shippingOptions).set({ deletedAt: new Date() }).where(and(eq(shippingOptions.serviceZoneId, id), isNull(shippingOptions.deletedAt)))
      await emitDomainEvent(tx, 'service-zone.deleted', { id: row.id })
      return row
    })
  }

  // --- ShippingProfile (+ product link) -----------------------------------------

  async function getShippingProfile(id: string): Promise<ShippingProfile | null> {
    const [row] = await ctx.db.select().from(shippingProfiles).where(and(eq(shippingProfiles.id, id), isNull(shippingProfiles.deletedAt))).limit(1)
    return row ?? null
  }

  async function getDefaultProfile(): Promise<ShippingProfile | null> {
    const [row] = await ctx.db.select().from(shippingProfiles).where(and(eq(shippingProfiles.isDefault, true), isNull(shippingProfiles.deletedAt))).limit(1)
    return row ?? null
  }

  /** Boot-time idempotent seed (plan: "shipping_profile défaut") — same shape as `salesChannels.ensureDefaultChannel`. */
  async function ensureDefaultProfile(): Promise<ShippingProfile> {
    const existing = await getDefaultProfile()
    if (existing) return existing
    return ctx.db.transaction(async (tx) => {
      const race = await tx.select().from(shippingProfiles).where(and(eq(shippingProfiles.isDefault, true), isNull(shippingProfiles.deletedAt))).limit(1)
      if (race[0]) return race[0]
      const [row] = await tx.insert(shippingProfiles).values({ id: pygId('shipprof'), name: 'Default Shipping Profile', isDefault: true }).returning()
      await emitDomainEvent(tx, 'shipping-profile.created', { id: row.id })
      return row
    })
  }

  async function createShippingProfile(input: CreateShippingProfileInput) {
    const data = createShippingProfileInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      if (data.isDefault) {
        await tx.update(shippingProfiles).set({ isDefault: false }).where(eq(shippingProfiles.isDefault, true))
      }
      const [row] = await tx
        .insert(shippingProfiles)
        .values({ id: pygId('shipprof'), name: data.name, isDefault: data.isDefault ?? false, metadata: data.metadata ?? null })
        .returning()
      await emitDomainEvent(tx, 'shipping-profile.created', { id: row.id })
      return row
    })
  }

  async function updateShippingProfile(id: string, input: UpdateShippingProfileInput) {
    const data = updateShippingProfileInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      if (data.isDefault) {
        await tx.update(shippingProfiles).set({ isDefault: false }).where(and(eq(shippingProfiles.isDefault, true), isNull(shippingProfiles.deletedAt)))
      }
      const [row] = await tx
        .update(shippingProfiles)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(shippingProfiles.id, id), isNull(shippingProfiles.deletedAt)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'shipping-profile.updated', { id: row.id })
      return row
    })
  }

  async function removeShippingProfile(id: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx.update(shippingProfiles).set({ deletedAt: new Date() }).where(and(eq(shippingProfiles.id, id), isNull(shippingProfiles.deletedAt))).returning()
      if (!row) return null
      await tx.delete(shippingProfileProducts).where(eq(shippingProfileProducts.shippingProfileId, id))
      await emitDomainEvent(tx, 'shipping-profile.deleted', { id: row.id })
      return row
    })
  }

  /** `add` reassigns each product's profile (one profile per product max, PK on `productId`); `remove` unlinks — same shape/semantics as `collections.updateProducts`. */
  async function updateProfileProducts(shippingProfileId: string, input: ShippingProfileProductsInput) {
    const data = shippingProfileProductsInput.parse(input)
    const add = data.add ?? []
    const remove = data.remove ?? []
    return ctx.db.transaction(async (tx) => {
      if (add.length > 0) {
        await tx
          .insert(shippingProfileProducts)
          .values(add.map((productId) => ({ productId, shippingProfileId })))
          .onConflictDoUpdate({ target: shippingProfileProducts.productId, set: { shippingProfileId } })
      }
      if (remove.length > 0) {
        await tx
          .delete(shippingProfileProducts)
          .where(and(eq(shippingProfileProducts.shippingProfileId, shippingProfileId), inArray(shippingProfileProducts.productId, remove)))
      }
      await emitDomainEvent(tx, 'shipping-profile.products-updated', { shippingProfileId, add, remove })
    })
  }

  async function listProfileProductIds(shippingProfileId: string): Promise<string[]> {
    const rows = await ctx.db.select({ productId: shippingProfileProducts.productId }).from(shippingProfileProducts).where(eq(shippingProfileProducts.shippingProfileId, shippingProfileId))
    return rows.map((r) => r.productId)
  }

  /** productId -> its resolved profile id (explicit link, else the default profile if one exists, else `null`). */
  async function resolveProductProfiles(productIds: string[]): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>()
    if (!productIds.length) return result
    const links = await ctx.db.select().from(shippingProfileProducts).where(inArray(shippingProfileProducts.productId, productIds))
    const linked = new Map(links.map((l) => [l.productId, l.shippingProfileId]))
    const needsDefault = productIds.some((id) => !linked.has(id))
    const defaultProfile = needsDefault ? await getDefaultProfile() : null
    for (const id of productIds) result.set(id, linked.get(id) ?? defaultProfile?.id ?? null)
    return result
  }

  // --- ShippingOption (+ rules) --------------------------------------------------

  async function getShippingOption(id: string): Promise<ShippingOption | null> {
    const [row] = await ctx.db.select().from(shippingOptions).where(and(eq(shippingOptions.id, id), isNull(shippingOptions.deletedAt))).limit(1)
    return row ?? null
  }

  async function listShippingOptionRules(shippingOptionId: string): Promise<ShippingOptionRule[]> {
    return ctx.db.select().from(shippingOptionRules).where(eq(shippingOptionRules.shippingOptionId, shippingOptionId))
  }

  async function insertRules(tx: PygmalionDatabase, shippingOptionId: string, rules: CreateShippingOptionInput['rules']) {
    if (!rules?.length) return
    await tx.insert(shippingOptionRules).values(
      rules.map((r) => ({ id: pygId('shiprule'), shippingOptionId, attribute: r.attribute, operator: r.operator ?? 'eq', value: r.value })),
    )
  }

  /** `canCalculate(data)` must return `true` before a `calculated` option can point at a provider — validated at create/update, not left for the first cart lookup to discover. */
  async function assertCanCalculate(providerId: string, data: Record<string, unknown> | null) {
    const provider = ctx.providers.get<FulfillmentProvider>('fulfillment', providerId)
    const ok = await provider.canCalculate(data ?? {})
    if (!ok) throw new Error(`shipping: provider '${providerId}' does not support calculated pricing`)
  }

  async function createShippingOptionRow(input: CreateShippingOptionInput) {
    const data = createShippingOptionInput.parse(input)
    const providerId = data.providerId ?? 'manual'
    // Throws if unregistered — applicative validation, same pattern as tax_region.provider_id.
    ctx.providers.get('fulfillment', providerId)
    const priceType = data.priceType ?? 'flat'
    if (priceType === 'calculated') await assertCanCalculate(providerId, data.data ?? null)

    return ctx.db.transaction(async (tx) => {
      const [zone] = await tx.select({ id: serviceZones.id }).from(serviceZones).where(and(eq(serviceZones.id, data.serviceZoneId), isNull(serviceZones.deletedAt))).limit(1)
      if (!zone) throw new Error('shipping: service zone not found')
      const [profile] = await tx.select({ id: shippingProfiles.id }).from(shippingProfiles).where(and(eq(shippingProfiles.id, data.shippingProfileId), isNull(shippingProfiles.deletedAt))).limit(1)
      if (!profile) throw new Error('shipping: shipping profile not found')
      const [row] = await tx
        .insert(shippingOptions)
        .values({
          id: pygId('shipopt'),
          name: data.name,
          serviceZoneId: data.serviceZoneId,
          shippingProfileId: data.shippingProfileId,
          providerId,
          priceType,
          data: data.data ?? null,
          metadata: data.metadata ?? null,
        })
        .returning()
      await insertRules(tx, row.id, data.rules)
      await emitDomainEvent(tx, 'shipping-option.created', { id: row.id })
      return row
    })
  }

  async function updateShippingOptionRow(id: string, input: UpdateShippingOptionInput) {
    const data = updateShippingOptionInput.parse(input)
    const current = await getShippingOption(id)
    if (!current) return null
    const nextProviderId = data.providerId ?? current.providerId
    const nextPriceType = data.priceType ?? current.priceType
    const nextData = data.data !== undefined ? data.data : current.data
    if (data.providerId !== undefined) ctx.providers.get('fulfillment', nextProviderId)
    if (nextPriceType === 'calculated') await assertCanCalculate(nextProviderId, nextData)

    return ctx.db.transaction(async (tx) => {
      if (data.serviceZoneId !== undefined) {
        const [zone] = await tx.select({ id: serviceZones.id }).from(serviceZones).where(and(eq(serviceZones.id, data.serviceZoneId), isNull(serviceZones.deletedAt))).limit(1)
        if (!zone) throw new Error('shipping: service zone not found')
      }
      if (data.shippingProfileId !== undefined) {
        const [profile] = await tx.select({ id: shippingProfiles.id }).from(shippingProfiles).where(and(eq(shippingProfiles.id, data.shippingProfileId), isNull(shippingProfiles.deletedAt))).limit(1)
        if (!profile) throw new Error('shipping: shipping profile not found')
      }
      const [row] = await tx
        .update(shippingOptions)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.serviceZoneId !== undefined ? { serviceZoneId: data.serviceZoneId } : {}),
          ...(data.shippingProfileId !== undefined ? { shippingProfileId: data.shippingProfileId } : {}),
          ...(data.providerId !== undefined ? { providerId: data.providerId } : {}),
          ...(data.priceType !== undefined ? { priceType: data.priceType } : {}),
          ...(data.data !== undefined ? { data: data.data } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(shippingOptions.id, id), isNull(shippingOptions.deletedAt)))
        .returning()
      if (!row) return null
      if (data.rules !== undefined) {
        await tx.delete(shippingOptionRules).where(eq(shippingOptionRules.shippingOptionId, id))
        await insertRules(tx, id, data.rules)
      }
      await emitDomainEvent(tx, 'shipping-option.updated', { id: row.id })
      return row
    })
  }

  async function removeShippingOption(id: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx.update(shippingOptions).set({ deletedAt: new Date() }).where(and(eq(shippingOptions.id, id), isNull(shippingOptions.deletedAt))).returning()
      if (!row) return null
      await tx.delete(shippingOptionRules).where(eq(shippingOptionRules.shippingOptionId, id))
      await emitDomainEvent(tx, 'shipping-option.deleted', { id: row.id })
      return row
    })
  }

  async function replaceShippingOptionRules(id: string, rules: CreateShippingOptionInput['rules']) {
    const option = await getShippingOption(id)
    if (!option) return null
    return ctx.db.transaction(async (tx) => {
      await tx.delete(shippingOptionRules).where(eq(shippingOptionRules.shippingOptionId, id))
      await insertRules(tx, id, rules)
      await emitDomainEvent(tx, 'shipping-option.updated', { id })
      return listShippingOptionRules(id)
    })
  }

  // --- Cart matching (the point of this whole file) ------------------------------

  /**
   * Eligible options for a cart: geo zone matches the address (zone
   * hierarchy), the option's shipping profile matches every cart item's
   * resolved product profile, every `shippingOptionRule` on the option
   * matches, and a price resolves (flat via `pricing.calculatePrices`,
   * calculated via the provider's `calculatePrice`). No address -> `[]`
   * (an option is always zone-scoped, same "no address, nothing resolves"
   * precedent as `TaxService.getTaxLines`).
   */
  async function listOptionsForCart(cart: ShippingCartContext): Promise<EligibleShippingOption[]> {
    if (!cart.address) return []
    const countryCode = cart.address.countryCode.toLowerCase()
    const address = { province: cart.address.province ?? null, city: cart.address.city ?? null, postalCode: cart.address.postalCode ?? null }

    const candidateZones = await ctx.db.select().from(geoZones).where(eq(geoZones.countryCode, countryCode))
    const matchingServiceZoneIds = [...new Set(candidateZones.filter((z) => geoZoneMatches(z, address)).map((z) => z.serviceZoneId))]
    if (!matchingServiceZoneIds.length) return []

    const options = await ctx.db
      .select()
      .from(shippingOptions)
      .where(and(isNull(shippingOptions.deletedAt), inArray(shippingOptions.serviceZoneId, matchingServiceZoneIds)))
    if (!options.length) return []

    // Profile filter: every cart item must resolve to the SAME profile as the
    // option (MVP simplification — one shipping method per cart, `schema/cart.ts`
    // header). An empty resolved set (no items, or none resolve to a profile
    // at all) imposes no constraint.
    const productIds = [...new Set(cart.items.map((i) => i.productId).filter((id): id is string => id !== null))]
    const profileByProduct = await resolveProductProfiles(productIds)
    const cartProfileIds = new Set([...profileByProduct.values()].filter((id): id is string => id !== null))

    const optionIds = options.map((o) => o.id)
    const rules = optionIds.length ? await ctx.db.select().from(shippingOptionRules).where(inArray(shippingOptionRules.shippingOptionId, optionIds)) : []
    const rulesByOption = new Map<string, ShippingOptionRule[]>()
    for (const r of rules) {
      const list = rulesByOption.get(r.shippingOptionId) ?? []
      list.push(r)
      rulesByOption.set(r.shippingOptionId, list)
    }
    const ruleContext = {
      item_total: cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      item_count: cart.items.reduce((sum, i) => sum + i.quantity, 0),
    }

    const eligible = options.filter((o) => {
      if (cartProfileIds.size > 0 && !(cartProfileIds.size === 1 && cartProfileIds.has(o.shippingProfileId))) return false
      const optionRules = rulesByOption.get(o.id) ?? []
      return optionRules.every((r) => ruleMatches(r, ruleContext))
    })
    if (!eligible.length) return []

    const flat = eligible.filter((o) => o.priceType === 'flat')
    const priceMap = flat.length
      ? await ctx.pricing.calculatePrices(flat.map((o) => o.id), { currencyCode: cart.currencyCode, regionId: cart.regionId ?? undefined }, { entity: 'shipping_option' })
      : new Map()

    const result: EligibleShippingOption[] = []
    for (const o of eligible) {
      if (o.priceType === 'flat') {
        const price = priceMap.get(o.id)
        if (!price || price.calculatedAmount === null) continue // no price for this currency -> invisible, not an error
        result.push({ id: o.id, name: o.name, priceType: 'flat', amount: price.calculatedAmount, isTaxInclusive: price.isCalculatedPriceTaxInclusive, providerId: o.providerId })
      } else {
        const provider = ctx.providers.get<FulfillmentProvider>('fulfillment', o.providerId)
        const calc = await provider.calculatePrice(o.data ?? {}, {}, { cart })
        result.push({ id: o.id, name: o.name, priceType: 'calculated', amount: calc.calculatedAmount, isTaxInclusive: calc.isCalculatedPriceTaxInclusive, providerId: o.providerId })
      }
    }
    return result
  }

  /**
   * The real lookup `services/cart.ts::setShippingMethod` calls when the
   * caller supplies a `shippingOptionId` (see
   * `schema/cart.ts` header) — reuses `listOptionsForCart` so "eligible for
   * this cart" is defined in exactly one place. Throws (not `null`) so the
   * route surfaces a clear 422 rather than silently accepting a mismatched id.
   */
  async function resolveForCart(cart: ShippingCartContext, shippingOptionId: string) {
    const options = await listOptionsForCart(cart)
    const found = options.find((o) => o.id === shippingOptionId)
    if (!found) throw new Error(`shipping: option '${shippingOptionId}' is not eligible for this cart`)
    return { shippingOptionId: found.id, name: found.name, amount: found.amount, isTaxInclusive: found.isTaxInclusive }
  }

  return {
    fulfillmentSets: {
      async list({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}) {
        return ctx.db.select().from(fulfillmentSets).where(isNull(fulfillmentSets.deletedAt)).orderBy(asc(fulfillmentSets.createdAt)).limit(limit).offset(offset)
      },
      get: getFulfillmentSet,
      create: createFulfillmentSet,
      update: updateFulfillmentSet,
      remove: removeFulfillmentSet,
    },
    serviceZones: {
      async list(fulfillmentSetId: string) {
        return ctx.db.select().from(serviceZones).where(and(eq(serviceZones.fulfillmentSetId, fulfillmentSetId), isNull(serviceZones.deletedAt))).orderBy(asc(serviceZones.createdAt))
      },
      get: getServiceZone,
      geoZones: listGeoZones,
      create: createServiceZone,
      update: updateServiceZone,
      remove: removeServiceZone,
    },
    profiles: {
      async list({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}) {
        return ctx.db.select().from(shippingProfiles).where(isNull(shippingProfiles.deletedAt)).orderBy(asc(shippingProfiles.createdAt)).limit(limit).offset(offset)
      },
      get: getShippingProfile,
      getDefault: getDefaultProfile,
      ensureDefault: ensureDefaultProfile,
      create: createShippingProfile,
      update: updateShippingProfile,
      remove: removeShippingProfile,
      updateProducts: updateProfileProducts,
      listProductIds: listProfileProductIds,
      resolveForProducts: resolveProductProfiles,
    },
    options: {
      async list({ limit = 20, offset = 0, serviceZoneId }: { limit?: number; offset?: number; serviceZoneId?: string } = {}) {
        const filters = [isNull(shippingOptions.deletedAt)]
        if (serviceZoneId) filters.push(eq(shippingOptions.serviceZoneId, serviceZoneId))
        return ctx.db.select().from(shippingOptions).where(and(...filters)).orderBy(asc(shippingOptions.createdAt)).limit(limit).offset(offset)
      },
      get: getShippingOption,
      rules: listShippingOptionRules,
      create: createShippingOptionRow,
      update: updateShippingOptionRow,
      remove: removeShippingOption,
      replaceRules: replaceShippingOptionRules,
    },
    listOptionsForCart,
    resolveForCart,
  }
}

export type ShippingService = ReturnType<typeof createShippingService>
