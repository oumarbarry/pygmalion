import type { PygmalionServices } from '@oumarbarry/pygmalion'
import { catalogFor, type DemoCatalog, type DemoLocale, type SeedProduct } from './catalog'

/**
 * The demo shop, seeded from `catalog.ts` (`pnpm dev` must open on a real
 * store, not an empty admin). One language per run: English unless asked
 * (`DEMO_LOCALE=fr`, or `{ locale }` from the seed route).
 *
 * IDEMPOTENT step by step, not with one global "already seeded?" flag: every
 * block looks up its own row by handle / name / code before creating it. A run
 * interrupted halfway (or a catalogue that grew since the last boot) is fixed
 * by simply booting again, which is the only behaviour that survives a
 * developer editing `catalog.ts`. Name lookups use the language being seeded.
 *
 * Runs in dev only (see `plugin.ts`) — E2E suites call it explicitly through
 * `POST /api/_demo/seed` so a suite that wants an empty store still gets one.
 */

const FREE_SHIPPING_THRESHOLD = 8000 // minor units, in whichever currency the cart is

/** The default language: `DEMO_LOCALE=fr` for French, anything else is English. */
export function demoLocale(): DemoLocale {
  return process.env.DEMO_LOCALE === 'fr' ? 'fr' : 'en'
}

export const promoCodeFor = (locale: DemoLocale): string => catalogFor(locale).promoCode
/** The code of the English default. */
export const PROMO_CODE = promoCodeFor('en')

export interface SeedResult {
  products: number
  regions: number
  collections: number
  categories: number
  shippingOptions: number
  promotions: number
}

export async function seedDemoStore(
  services: PygmalionServices,
  options: { locale?: DemoLocale } = {},
): Promise<SeedResult> {
  const catalog = catalogFor(options.locale ?? demoLocale())
  await services.currencies.seed()

  // --- Store, regions, taxes -------------------------------------------------
  const store = await services.stores.ensure()
  await services.stores.update(store.id, { name: catalog.storeName })
  await services.stores.setSupportedCurrencies(store.id, [
    { code: 'eur', isDefault: true },
    { code: 'usd' },
  ])

  const regionIds = new Map<string, string>()
  for (const r of catalog.regions) {
    const [existing] = await services.regions.list({ q: r.name, limit: 1 })
    const region = existing ?? (await services.regions.create({ ...r, countries: [...r.countries] }))
    regionIds.set(r.currencyCode, region.id)
  }
  // The default region is what a first-time visitor is priced in.
  await services.stores.update(store.id, { defaultRegionId: regionIds.get('eur') })

  for (const t of catalog.tax) {
    const [existing] = await services.taxRegions.list({ countryCode: t.countryCode, limit: 1 })
    const taxRegion = existing ?? (await services.taxRegions.create({ countryCode: t.countryCode }))
    const rates = await services.taxRates.list({ taxRegionId: taxRegion.id, limit: 5 })
    if (!rates.some((r) => r.code === t.code)) {
      await services.taxRates.create({
        taxRegionId: taxRegion.id,
        code: t.code,
        name: t.name,
        rate: t.rate,
        isDefault: true,
      })
    }
  }

  // --- Taxonomy --------------------------------------------------------------
  const collectionIds = new Map<string, string>()
  for (const c of catalog.collections) {
    const [existing] = await services.collections.list({ q: c.title, limit: 1 })
    const row = existing ?? (await services.collections.create({ title: c.title, handle: c.handle }))
    collectionIds.set(c.handle, row.id)
  }

  const categoryIds = new Map<string, string>()
  for (const c of catalog.categories) {
    const [existing] = await services.categories.list({ q: c.name, limit: 1 })
    const row =
      existing ??
      (await services.categories.create({
        name: c.name,
        handle: c.handle,
        description: c.description,
        parentCategoryId: c.parent ? categoryIds.get(c.parent) : null,
        isActive: true,
      }))
    categoryIds.set(c.handle, row.id)
  }

  // --- Warehouse -------------------------------------------------------------
  const [existingLocation] = await services.inventory.locations.list({ limit: 1 })
  const location = existingLocation ?? (await services.inventory.locations.create({ name: catalog.locationName }))
  await services.stores.update(store.id, { defaultLocationId: location.id })

  // --- Catalogue -------------------------------------------------------------
  for (const p of catalog.products) {
    await seedProduct(services, p, { collectionIds, categoryIds, locationId: location.id })
  }

  // --- Shipping --------------------------------------------------------------
  const shippingOptionCount = await seedShipping(services, catalog)

  // --- Promotions ------------------------------------------------------------
  const promotionCount = await seedPromotions(services, catalog.promoCode)

  return {
    products: catalog.products.length,
    regions: catalog.regions.length,
    collections: catalog.collections.length,
    categories: catalog.categories.length,
    shippingOptions: shippingOptionCount,
    promotions: promotionCount,
  }
}

// --- One product: rows, options, variants, prices, images, stock -------------

async function seedProduct(
  services: PygmalionServices,
  p: SeedProduct,
  ctx: { collectionIds: Map<string, string>; categoryIds: Map<string, string>; locationId: string },
): Promise<void> {
  const [existing] = await services.products.list({ handle: p.handle, status: 'published', limit: 1 })
  if (existing) return

  const product = await services.products.create({
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    handle: p.handle,
    material: p.material ?? null,
    status: 'published',
    thumbnail: `/demo/${p.images[0]}`,
  })

  await services.products.images.add(product.id, {
    images: p.images.map((file, rank) => ({ url: `/demo/${file}`, rank })),
  })

  // Options first: a variant references option VALUE ids, and the service
  // refuses a variant that doesn't pick exactly one value per option.
  const valueIds = new Map<string, string>()
  for (const option of p.options ?? []) {
    const created = await services.products.options.create(product.id, {
      title: option.title,
      values: option.values.map((value, rank) => ({ value, rank })),
    })
    for (const v of created.values) valueIds.set(`${option.title}:${v.value}`, v.id)
  }

  for (const [rank, v] of p.variants.entries()) {
    const variant = await services.products.variants.create(product.id, {
      title: v.title,
      sku: v.sku,
      variantRank: rank,
      manageInventory: true,
      optionValueIds: (v.optionValues ?? []).map((value, i) => valueIds.get(`${p.options![i].title}:${value}`)!),
    })

    await services.pricing.batchPrices({
      create: [
        { variantId: variant.id, currencyCode: 'eur', amount: v.eur },
        { variantId: variant.id, currencyCode: 'usd', amount: v.usd },
      ],
    })

    // Stock: one inventory item per variant, stocked at the single warehouse.
    const item = await services.inventory.items.create({ sku: v.sku, title: `${p.title} — ${v.title}` })
    await services.inventory.items.linkVariant(variant.id, { inventoryItemId: item.id })
    await services.inventory.levels.upsert(item.id, ctx.locationId, { stockedQuantity: v.stock })
  }

  if (p.collection) {
    await services.collections.updateProducts(ctx.collectionIds.get(p.collection)!, { add: [product.id] })
  }
  await services.categories.updateProducts(ctx.categoryIds.get(p.category)!, { add: [product.id] })
}

// --- Shipping: one zone covering both regions, priced in both currencies -----

async function seedShipping(services: PygmalionServices, catalog: DemoCatalog): Promise<number> {
  const profile = await services.shipping.profiles.ensureDefault()
  const [existingSet] = await services.shipping.fulfillmentSets.list({ limit: 1 })
  const set = existingSet ?? (await services.shipping.fulfillmentSets.create({ name: catalog.fulfillmentSetName }))

  const zones = await services.shipping.serviceZones.list(set.id)
  const zone =
    zones[0] ??
    (await services.shipping.serviceZones.create(set.id, {
      name: catalog.zoneName,
      // One zone, every country both regions ship to: a shipping option carries
      // a price per currency, so splitting per region would only duplicate rows.
      geoZones: catalog.regions.flatMap((r) => r.countries).map((c) => ({ type: 'country' as const, countryCode: c.toLowerCase() })),
    }))

  const existingOptions = await services.shipping.options.list({ serviceZoneId: zone.id, limit: 20 })
  for (const opt of catalog.shipping) {
    if (existingOptions.some((o) => o.name === opt.name)) continue
    const option = await services.shipping.options.create({
      name: opt.name,
      serviceZoneId: zone.id,
      shippingProfileId: profile.id,
      priceType: 'flat',
    })
    await services.pricing.batchPrices({
      create: [
        { shippingOptionId: option.id, currencyCode: 'eur', amount: opt.eur },
        { shippingOptionId: option.id, currencyCode: 'usd', amount: opt.usd },
      ],
    })
  }
  return catalog.shipping.length
}

// --- Promotions: one automatic, one code -------------------------------------

async function seedPromotions(services: PygmalionServices, promoCode: string): Promise<number> {
  const existing = await services.promotions.list({ limit: 50 })
  const has = (code: string | null, automatic = false) =>
    existing.some((p) => (automatic ? p.isAutomatic && !p.code : p.code === code))

  // Automatic: free shipping past a threshold. `cart_subtotal` is in the cart's
  // own minor units, so the same 8000 reads as 80 € or $80 — deliberate for a
  // demo; a real store would run one promotion per currency.
  if (!has(null, true)) {
    await services.promotions.create({
      isAutomatic: true,
      status: 'active',
      rules: [{ attribute: 'cart_subtotal', operator: 'gte', values: [String(FREE_SHIPPING_THRESHOLD)] }],
      applicationMethod: { target: 'shipping', allocation: 'across', valueType: 'percentage', value: 100 },
    })
  }

  if (!has(promoCode)) {
    await services.promotions.create({
      code: promoCode,
      status: 'active',
      applicationMethod: { target: 'items', allocation: 'across', valueType: 'percentage', value: 10 },
    })
  }
  return 2
}
