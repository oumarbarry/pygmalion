import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../test-utils'
import * as schema from '../schema'
import type { PygmalionDatabase } from '../db/types'
import {
  createSystemTaxProvider,
  createTaxRatesService,
  createTaxRegionsService,
  createTaxService,
  type TaxProvider,
  type TaxProviderRegistry,
  type TaxRatesService,
  type TaxRegionsService,
  type TaxService,
} from './tax'

function fakeProviderRegistry(providers: Record<string, TaxProvider>): TaxProviderRegistry {
  return {
    get<T>(type: 'tax', id: string): T {
      const p = providers[id]
      if (!p) throw new Error(`pygmalion: no ${type} provider registered with id '${id}'`)
      return p as unknown as T
    },
  }
}

let db: PygmalionDatabase
let providers: TaxProviderRegistry
let regions: TaxRegionsService
let rates: TaxRatesService
let tax: TaxService

beforeEach(async () => {
  db = await createTestDb(schema)
  providers = fakeProviderRegistry({ system: createSystemTaxProvider() })
  regions = createTaxRegionsService({ db, providers })
  rates = createTaxRatesService({ db })
  tax = createTaxService({ db, providers })
})

describe('tax regions service', () => {
  it('create returns a prefixed id, lowercases country/province, defaults provider to system', async () => {
    const r = await regions.create({ countryCode: 'US' })
    expect(r.id).toMatch(/^txreg_/)
    expect(r.countryCode).toBe('us')
    expect(r.providerId).toBe('system')
  })

  it('rejects an unregistered provider id (applicative validation)', async () => {
    await expect(regions.create({ countryCode: 'US', providerId: 'avalara' })).rejects.toThrow(/no tax provider/)
  })

  it('a child region requires province_code and forbids its own provider (CK_tax_region_provider_top_level)', async () => {
    const us = await regions.create({ countryCode: 'US' })
    await expect(regions.create({ countryCode: 'US', parentId: us.id })).rejects.toThrow(/province_code is required/)
    await expect(
      regions.create({ countryCode: 'US', provinceCode: 'CA', parentId: us.id, providerId: 'system' }),
    ).rejects.toThrow(/only allowed on a top-level/)
    const ca = await regions.create({ countryCode: 'US', provinceCode: 'CA', parentId: us.id })
    expect(ca.providerId).toBeNull()
    expect(ca.parentId).toBe(us.id)
  })

  it('only one top-level region per country (unique index)', async () => {
    await regions.create({ countryCode: 'US' })
    await expect(regions.create({ countryCode: 'US' })).rejects.toThrow()
  })

  it('remove cascades to child regions and every region’s tax rates', async () => {
    const us = await regions.create({ countryCode: 'US' })
    const ca = await regions.create({ countryCode: 'US', provinceCode: 'CA', parentId: us.id })
    const rate = await rates.create({ taxRegionId: ca.id, code: 'CA-TAX', name: 'California tax', rate: 7.25 })

    await regions.remove(us.id)
    expect(await regions.get(us.id)).toBeNull()
    expect(await regions.get(ca.id)).toBeNull()
    expect(await rates.get(rate.id)).toBeNull()
  })
})

describe('tax rates service', () => {
  it('create with nested rules, update replaces the rule set, remove soft-deletes rules too', async () => {
    const us = await regions.create({ countryCode: 'US' })
    const rate = await rates.create({
      taxRegionId: us.id,
      code: 'STANDARD',
      name: 'Standard rate',
      rate: 10,
      rules: [{ reference: 'product', referenceId: 'prod_1' }],
    })
    expect(await rates.rules(rate.id)).toHaveLength(1)

    await rates.update(rate.id, { rules: [{ reference: 'product', referenceId: 'prod_2' }] })
    const updatedRules = await rates.rules(rate.id)
    expect(updatedRules).toHaveLength(1)
    expect(updatedRules[0].referenceId).toBe('prod_2')

    await rates.remove(rate.id)
    expect(await rates.get(rate.id)).toBeNull()
    expect(await rates.rules(rate.id)).toHaveLength(0)
  })

  it('only one default rate per region (unique partial index)', async () => {
    const us = await regions.create({ countryCode: 'US' })
    await rates.create({ taxRegionId: us.id, code: 'A', name: 'A', isDefault: true })
    await expect(rates.create({ taxRegionId: us.id, code: 'B', name: 'B', isDefault: true })).rejects.toThrow()
  })

  it('addRule / removeRule round-trip', async () => {
    const us = await regions.create({ countryCode: 'US' })
    const rate = await rates.create({ taxRegionId: us.id, code: 'A', name: 'A' })
    const rule = await rates.addRule(rate.id, { reference: 'product', referenceId: 'prod_1' })
    expect(await rates.rules(rate.id)).toHaveLength(1)
    await rates.removeRule(rate.id, rule!.id)
    expect(await rates.rules(rate.id)).toHaveLength(0)
  })
})

// --- getTaxLines: priority resolution-----------------------------------------
//
// Every test seeds a US country region + a US/CA province region (child of
// the country region) and asserts which rate wins among lower-priority
// decoys, so each test proves the *ranking*, not just that a rate exists.

async function seedRegions() {
  const us = await regions.create({ countryCode: 'US' })
  const ca = await regions.create({ countryCode: 'US', provinceCode: 'CA', parentId: us.id })
  return { us, ca }
}

describe('getTaxLines: priority levels 1-7', () => {
  it('level 1: direct product/shipping_option match + province region beats a province default and a country direct match', async () => {
    const { us, ca } = await seedRegions()
    await rates.create({ taxRegionId: ca.id, code: 'CA-DEFAULT', name: 'CA default', isDefault: true }) // level 3
    await rates.create({
      taxRegionId: us.id,
      code: 'US-DIRECT',
      name: 'US direct',
      rules: [{ reference: 'product', referenceId: 'prod_1' }],
    }) // level 4
    await rates.create({
      taxRegionId: ca.id,
      code: 'CA-DIRECT',
      name: 'CA direct',
      rules: [{ reference: 'product', referenceId: 'prod_1' }],
    }) // level 1 — winner

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'US', provinceCode: 'CA' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].code).toBe('CA-DIRECT')
  })

  it('level 2: product_type match + province region beats a province default', async () => {
    const { ca } = await seedRegions()
    await rates.create({ taxRegionId: ca.id, code: 'CA-DEFAULT', name: 'CA default', isDefault: true }) // level 3
    await rates.create({
      taxRegionId: ca.id,
      code: 'CA-TYPE',
      name: 'CA product type',
      rules: [{ reference: 'product_type', referenceId: 'type_1' }],
    }) // level 2 — winner

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_unmatched', productTypeId: 'type_1' }],
      { address: { countryCode: 'US', provinceCode: 'CA' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].code).toBe('CA-TYPE')
  })

  it('level 3: is_default + province region beats a direct match at the country region', async () => {
    const { us, ca } = await seedRegions()
    await rates.create({
      taxRegionId: us.id,
      code: 'US-DIRECT',
      name: 'US direct',
      rules: [{ reference: 'product', referenceId: 'prod_1' }],
    }) // level 4
    await rates.create({ taxRegionId: ca.id, code: 'CA-DEFAULT', name: 'CA default', isDefault: true }) // level 3 — winner

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'US', provinceCode: 'CA' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].code).toBe('CA-DEFAULT')
  })

  it('level 4: direct product/shipping_option match + country region beats a country default (no province in scope)', async () => {
    const { us } = await seedRegions()
    await rates.create({ taxRegionId: us.id, code: 'US-DEFAULT', name: 'US default', isDefault: true }) // level 6
    await rates.create({
      taxRegionId: us.id,
      code: 'US-DIRECT',
      name: 'US direct',
      rules: [{ reference: 'product', referenceId: 'prod_1' }],
    }) // level 4 — winner

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'US' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].code).toBe('US-DIRECT')
  })

  it('level 5: product_type match + country region beats a country default (no province in scope)', async () => {
    const { us } = await seedRegions()
    await rates.create({ taxRegionId: us.id, code: 'US-DEFAULT', name: 'US default', isDefault: true }) // level 6
    await rates.create({
      taxRegionId: us.id,
      code: 'US-TYPE',
      name: 'US product type',
      rules: [{ reference: 'product_type', referenceId: 'type_1' }],
    }) // level 5 — winner

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_unmatched', productTypeId: 'type_1' }],
      { address: { countryCode: 'US' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].code).toBe('US-TYPE')
  })

  it('level 6: is_default + country region used when nothing more specific matches', async () => {
    const { us } = await seedRegions()
    await rates.create({ taxRegionId: us.id, code: 'US-DEFAULT', name: 'US default', isDefault: true }) // level 6 — winner

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_unmatched' }],
      { address: { countryCode: 'US' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].code).toBe('US-DEFAULT')
  })

  it('level 7: no rule and no default anywhere in scope -> fallback, no tax line for that item', async () => {
    const { us } = await seedRegions()
    // A rate exists in the region but matches nothing (not default, no rule
    // targeting this item) — every candidate scores 7 and is excluded.
    await rates.create({
      taxRegionId: us.id,
      code: 'US-OTHER',
      name: 'US other',
      rules: [{ reference: 'product', referenceId: 'prod_other' }],
    })

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_unmatched' }],
      { address: { countryCode: 'US' } },
    )
    expect(lines).toEqual([])
  })

  it('no country tax region at all for the address -> []', async () => {
    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'ZZ' } },
    )
    expect(lines).toEqual([])
  })
})

describe('getTaxLines: is_combinable', () => {
  it('combinable province rate cumulates with the best parent (country) rate: two lines', async () => {
    const { us, ca } = await seedRegions()
    await rates.create({ taxRegionId: us.id, code: 'US-DEFAULT', name: 'US default', isDefault: true })
    await rates.create({
      taxRegionId: ca.id,
      code: 'CA-DIRECT',
      name: 'CA direct',
      isCombinable: true,
      rules: [{ reference: 'product', referenceId: 'prod_1' }],
    })

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'US', provinceCode: 'CA' } },
    )
    expect(lines.map((l) => l.code).sort()).toEqual(['CA-DIRECT', 'US-DEFAULT'])
    expect(lines.every((l) => l.itemId === 'li_1')).toBe(true)
  })

  it('non-combinable province rate does not pull in the country rate: one line only', async () => {
    const { us, ca } = await seedRegions()
    await rates.create({ taxRegionId: us.id, code: 'US-DEFAULT', name: 'US default', isDefault: true })
    await rates.create({
      taxRegionId: ca.id,
      code: 'CA-DIRECT',
      name: 'CA direct',
      isCombinable: false,
      rules: [{ reference: 'product', referenceId: 'prod_1' }],
    })

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'US', provinceCode: 'CA' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].code).toBe('CA-DIRECT')
  })
})

describe('getTaxLines: provider resolution by country region', () => {
  it('uses the system provider by default', async () => {
    const { us } = await seedRegions()
    await rates.create({ taxRegionId: us.id, code: 'US-DEFAULT', name: 'US default', isDefault: true })

    const lines = await tax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'US' } },
    )
    expect(lines[0].providerId).toBe('system')
  })

  it('resolves a custom provider registered for the country region, not the province region', async () => {
    const customProvider: TaxProvider = {
      getIdentifier: () => 'custom',
      async getTaxLines(taxLines) {
        return taxLines.flatMap((l) =>
          l.rates.map((r) => ({ itemId: l.itemId, rateId: r.id, rate: r.rate ?? 0, code: r.code, name: r.name, providerId: 'custom' })),
        )
      },
    }
    const customProviders = fakeProviderRegistry({ system: createSystemTaxProvider(), custom: customProvider })
    const customRegions = createTaxRegionsService({ db, providers: customProviders })
    const customTax = createTaxService({ db, providers: customProviders })

    const us = await customRegions.create({ countryCode: 'FR', providerId: 'custom' })
    await customRegions.create({ countryCode: 'FR', provinceCode: 'IDF', parentId: us.id })
    await rates.create({ taxRegionId: us.id, code: 'FR-DEFAULT', name: 'FR default', isDefault: true })

    const lines = await customTax.getTaxLines(
      [{ id: 'li_1', reference: 'product', referenceId: 'prod_1' }],
      { address: { countryCode: 'FR', provinceCode: 'IDF' } },
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].providerId).toBe('custom')
  })
})
