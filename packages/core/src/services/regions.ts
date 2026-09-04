import { and, desc, eq, ilike, inArray, isNull, notInArray } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { regionCountries, regions, type RegionCountry } from '../schema/settings'
import {
  createRegionInput,
  updateRegionInput,
  type CreateRegionInput,
  type UpdateRegionInput,
} from '../validation/settings'
import type { ServiceContext } from './context'
import type { PygmalionDatabase } from '../db/types'

// A real-world starter set (not the full ~250-row ISO 3166 list).
// Extend when a store needs to assign a region to a country not listed here.
export const COUNTRY_SEED: readonly RegionCountry[] = [
  { iso2: 'US', iso3: 'USA', numCode: '840', name: 'united states', displayName: 'United States', regionId: null, metadata: null },
  { iso2: 'CA', iso3: 'CAN', numCode: '124', name: 'canada', displayName: 'Canada', regionId: null, metadata: null },
  { iso2: 'MX', iso3: 'MEX', numCode: '484', name: 'mexico', displayName: 'Mexico', regionId: null, metadata: null },
  { iso2: 'GB', iso3: 'GBR', numCode: '826', name: 'united kingdom', displayName: 'United Kingdom', regionId: null, metadata: null },
  { iso2: 'FR', iso3: 'FRA', numCode: '250', name: 'france', displayName: 'France', regionId: null, metadata: null },
  { iso2: 'DE', iso3: 'DEU', numCode: '276', name: 'germany', displayName: 'Germany', regionId: null, metadata: null },
  { iso2: 'ES', iso3: 'ESP', numCode: '724', name: 'spain', displayName: 'Spain', regionId: null, metadata: null },
  { iso2: 'IT', iso3: 'ITA', numCode: '380', name: 'italy', displayName: 'Italy', regionId: null, metadata: null },
  { iso2: 'NL', iso3: 'NLD', numCode: '528', name: 'netherlands', displayName: 'Netherlands', regionId: null, metadata: null },
  { iso2: 'BE', iso3: 'BEL', numCode: '056', name: 'belgium', displayName: 'Belgium', regionId: null, metadata: null },
  { iso2: 'PT', iso3: 'PRT', numCode: '620', name: 'portugal', displayName: 'Portugal', regionId: null, metadata: null },
  { iso2: 'IE', iso3: 'IRL', numCode: '372', name: 'ireland', displayName: 'Ireland', regionId: null, metadata: null },
  { iso2: 'CH', iso3: 'CHE', numCode: '756', name: 'switzerland', displayName: 'Switzerland', regionId: null, metadata: null },
  { iso2: 'SE', iso3: 'SWE', numCode: '752', name: 'sweden', displayName: 'Sweden', regionId: null, metadata: null },
  { iso2: 'NO', iso3: 'NOR', numCode: '578', name: 'norway', displayName: 'Norway', regionId: null, metadata: null },
  { iso2: 'DK', iso3: 'DNK', numCode: '208', name: 'denmark', displayName: 'Denmark', regionId: null, metadata: null },
  { iso2: 'PL', iso3: 'POL', numCode: '616', name: 'poland', displayName: 'Poland', regionId: null, metadata: null },
  { iso2: 'JP', iso3: 'JPN', numCode: '392', name: 'japan', displayName: 'Japan', regionId: null, metadata: null },
  { iso2: 'CN', iso3: 'CHN', numCode: '156', name: 'china', displayName: 'China', regionId: null, metadata: null },
  { iso2: 'IN', iso3: 'IND', numCode: '356', name: 'india', displayName: 'India', regionId: null, metadata: null },
  { iso2: 'AU', iso3: 'AUS', numCode: '036', name: 'australia', displayName: 'Australia', regionId: null, metadata: null },
  { iso2: 'NZ', iso3: 'NZL', numCode: '554', name: 'new zealand', displayName: 'New Zealand', regionId: null, metadata: null },
  { iso2: 'SG', iso3: 'SGP', numCode: '702', name: 'singapore', displayName: 'Singapore', regionId: null, metadata: null },
  { iso2: 'BR', iso3: 'BRA', numCode: '076', name: 'brazil', displayName: 'Brazil', regionId: null, metadata: null },
  { iso2: 'ZA', iso3: 'ZAF', numCode: '710', name: 'south africa', displayName: 'South Africa', regionId: null, metadata: null },
]

export interface ListRegionsOptions {
  limit?: number
  offset?: number
  q?: string
}

/** Replace-set semantics: assigns `iso2s` to `regionId`, unassigns everyone else. */
async function replaceRegionCountries(
  db: PygmalionDatabase,
  regionId: string,
  iso2s: string[],
): Promise<void> {
  if (iso2s.length > 0) {
    const found = await db
      .select({ iso2: regionCountries.iso2 })
      .from(regionCountries)
      .where(inArray(regionCountries.iso2, iso2s))
    const missing = iso2s.filter((c) => !found.some((f) => f.iso2 === c))
    if (missing.length > 0) {
      throw new Error(`regions: unknown country code(s): ${missing.join(', ')}`)
    }
    await db.update(regionCountries).set({ regionId }).where(inArray(regionCountries.iso2, iso2s))
  }
  // Unassign countries previously on this region that are not in the new set.
  await db
    .update(regionCountries)
    .set({ regionId: null })
    .where(
      iso2s.length > 0
        ? and(eq(regionCountries.regionId, regionId), notInArray(regionCountries.iso2, iso2s))
        : eq(regionCountries.regionId, regionId),
    )
}

export function createRegionsService(ctx: ServiceContext) {
  return {
    async list({ limit = 20, offset = 0, q }: ListRegionsOptions = {}) {
      const where = q
        ? and(isNull(regions.deletedAt), ilike(regions.name, `%${q}%`))
        : isNull(regions.deletedAt)
      return ctx.db
        .select()
        .from(regions)
        .where(where)
        .orderBy(desc(regions.createdAt), desc(regions.id))
        .limit(limit)
        .offset(offset)
    },

    async get(id: string) {
      const [row] = await ctx.db
        .select()
        .from(regions)
        .where(and(eq(regions.id, id), isNull(regions.deletedAt)))
        .limit(1)
      return row ?? null
    },

    async countries(regionId: string) {
      return ctx.db.select().from(regionCountries).where(eq(regionCountries.regionId, regionId))
    },

    async create(input: CreateRegionInput) {
      const data = createRegionInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(regions)
          .values({
            id: pygId('reg'),
            name: data.name,
            currencyCode: data.currencyCode,
            automaticTaxes: data.automaticTaxes ?? true,
            metadata: data.metadata ?? null,
          })
          .returning()
        if (data.countries) {
          await replaceRegionCountries(tx, row.id, data.countries)
        }
        await emitDomainEvent(tx, 'region.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateRegionInput) {
      const data = updateRegionInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(regions)
          .set({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.currencyCode !== undefined ? { currencyCode: data.currencyCode } : {}),
            ...(data.automaticTaxes !== undefined ? { automaticTaxes: data.automaticTaxes } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(regions.id, id), isNull(regions.deletedAt)))
          .returning()
        if (!row) return null
        if (data.countries) {
          await replaceRegionCountries(tx, row.id, data.countries)
        }
        await emitDomainEvent(tx, 'region.updated', { id: row.id })
        return row
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        // App-level guard mirroring the DB-level FK RESTRICT on
        // region_country.region_id: refuse rather than silently orphan.
        const [stillAssigned] = await tx
          .select({ iso2: regionCountries.iso2 })
          .from(regionCountries)
          .where(eq(regionCountries.regionId, id))
          .limit(1)
        if (stillAssigned) {
          throw new Error('regions: cannot delete a region with countries assigned')
        }
        const [row] = await tx
          .update(regions)
          .set({ deletedAt: new Date() })
          .where(and(eq(regions.id, id), isNull(regions.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'region.deleted', { id: row.id })
        return row
      })
    },

    // Idempotent world-country catalog seed (like currencies). Never touches
    // `regionId` on conflict, so re-running it never undoes an assignment.
    async seedCountries() {
      if (COUNTRY_SEED.length === 0) return
      await ctx.db
        .insert(regionCountries)
        .values(COUNTRY_SEED as RegionCountry[])
        .onConflictDoNothing({ target: regionCountries.iso2 })
    },
  }
}

export type RegionsService = ReturnType<typeof createRegionsService>
