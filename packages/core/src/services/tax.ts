// Tax. Consumed by cart/checkout via `TaxService.getTaxLines(items:
// TaxCalculationItem[], context: TaxCalculationContext): Promise<TaxLine[]>`.
// The rate prioritization and matching are ported as-is from Medusa v2: it is
// the parity-critical piece.
import { and, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { taxRateRules, taxRates, taxRegions, type TaxRate, type TaxRateRule, type TaxRegion } from '../schema/tax'
import {
  createTaxRateInput,
  createTaxRateRuleInput,
  createTaxRegionInput,
  updateTaxRateInput,
  updateTaxRegionInput,
  type CreateTaxRateInput,
  type CreateTaxRateRuleInput,
  type CreateTaxRegionInput,
  type UpdateTaxRateInput,
  type UpdateTaxRegionInput,
} from '../validation/tax'
import type { ServiceContext } from './context'
import type { PygmalionDatabase } from '../db/types'

// --- Provider registry (no `tax_provider` table)------------------------------

/**
 * Minimal shape `packages/nuxt`'s real `ProviderRegistry` structurally
 * satisfies (`pygmalion:providers`); core stays free of any nuxt import.
 * `get` throws for an unregistered id, which doubles as the applicative
 * validation of `tax_region.provider_id`.
 */
export interface TaxProviderRegistry {
  get<T = unknown>(type: 'tax', id: string): T
}

export interface TaxServiceContext extends ServiceContext {
  providers: TaxProviderRegistry
}

// --- TaxProvider interface + default DB-backed ("system") implementation -----

export interface TaxRateCandidate {
  id: string
  rate: number | null
  code: string
  name: string
}

/** One taxable line (item or shipping method) with the rate(s) resolved for it. */
export interface ItemTaxCalculationLine {
  itemId: string
  rates: TaxRateCandidate[]
}

export interface TaxLine {
  itemId: string
  rateId: string | null
  rate: number
  code: string
  name: string
  providerId: string
}

export interface TaxAddress {
  countryCode: string
  provinceCode?: string | null
}

export interface TaxCalculationContext {
  address: TaxAddress
  customer?: { id: string; email?: string; groups?: string[] }
  isReturn?: boolean
  additionalContext?: Record<string, unknown>
}

/**
 * Tax calculation input, merged into one array
 * instead of Medusa's `itemLines`/`shippingLines` pair: our `reference`
 * discriminant ("product" | "shipping_option") on each line already carries
 * that distinction, so a second array would just re-encode it.
 */
export interface TaxProvider {
  getIdentifier(): string
  getTaxLines(lines: ItemTaxCalculationLine[], context: TaxCalculationContext): Promise<TaxLine[]>
}

/**
 * Parity with Medusa's `system` provider: maps each resolved
 * rate 1:1 to a `TaxLine`, no external call. Registered under id `system` by
 * `@oumarbarry/pygmalion`'s plugin — third-party providers (e.g. Avalara) register
 * under their own id via the `pygmalion:providers` hook and are resolved
 * exactly the same way, by `tax_region.provider_id`.
 */
export function createSystemTaxProvider(): TaxProvider {
  return {
    getIdentifier: () => 'system',
    async getTaxLines(lines) {
      return lines.flatMap((line) =>
        line.rates.map((rate) => ({
          itemId: line.itemId,
          rateId: rate.id,
          rate: rate.rate ?? 0,
          code: rate.code,
          name: rate.name,
          providerId: 'system',
        })),
      )
    },
  }
}

// --- TaxRegion service ---------------------------------------------------------

export interface ListTaxRegionsOptions {
  limit?: number
  offset?: number
  q?: string
  countryCode?: string
  parentId?: string | null
}

export function createTaxRegionsService(ctx: TaxServiceContext) {
  async function get(id: string) {
    const [row] = await ctx.db
      .select()
      .from(taxRegions)
      .where(and(eq(taxRegions.id, id), isNull(taxRegions.deletedAt)))
      .limit(1)
    return row ?? null
  }

  return {
    async list({ limit = 20, offset = 0, q, countryCode, parentId }: ListTaxRegionsOptions = {}) {
      const filters = [isNull(taxRegions.deletedAt)]
      if (q) filters.push(ilike(taxRegions.countryCode, `%${q}%`))
      if (countryCode) filters.push(eq(taxRegions.countryCode, countryCode.toLowerCase()))
      if (parentId !== undefined) {
        filters.push(parentId === null ? isNull(taxRegions.parentId) : eq(taxRegions.parentId, parentId))
      }
      return ctx.db
        .select()
        .from(taxRegions)
        .where(and(...filters))
        .limit(limit)
        .offset(offset)
    },

    get,

    async create(input: CreateTaxRegionInput) {
      const data = createTaxRegionInput.parse(input)
      const countryCode = data.countryCode.toLowerCase()
      const provinceCode = data.provinceCode ? data.provinceCode.toLowerCase() : null
      // CK_tax_region_provider_top_level (schema) only forbids a provider on
      // a *child* region — the "province required on a child" half of
      // the rule has no plain-NOT-NULL shape (it depends on `parent_id`),
      // so it's enforced here.
      if (data.parentId) {
        if (!provinceCode) throw new Error('tax: province_code is required for a child tax region')
        if (data.providerId) throw new Error('tax: provider_id is only allowed on a top-level tax region')
      }
      // Defaults to the built-in `system` provider on a top-level region —
      // mirrors Medusa always assigning `tp_system` at creation.
      const providerId = data.parentId ? null : (data.providerId ?? 'system')
      if (providerId) {
        // Throws if unregistered (applicative validation).
        ctx.providers.get('tax', providerId)
      }
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(taxRegions)
          .values({
            id: pygId('txreg'),
            countryCode,
            provinceCode,
            providerId,
            parentId: data.parentId ?? null,
            metadata: data.metadata ?? null,
            createdBy: data.createdBy ?? null,
          })
          .returning()
        await emitDomainEvent(tx, 'tax-region.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateTaxRegionInput) {
      const data = updateTaxRegionInput.parse(input)
      if (data.providerId) {
        ctx.providers.get('tax', data.providerId)
      }
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(taxRegions)
          .set({
            ...(data.countryCode !== undefined ? { countryCode: data.countryCode.toLowerCase() } : {}),
            ...(data.provinceCode !== undefined
              ? { provinceCode: data.provinceCode ? data.provinceCode.toLowerCase() : null }
              : {}),
            ...(data.providerId !== undefined ? { providerId: data.providerId } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(taxRegions.id, id), isNull(taxRegions.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'tax-region.updated', { id: row.id })
        return row
      })
    },

    /**
     * Cascade delete of children + rates — 2-level hierarchy
     * only (country -> province), so one pass over direct
     * children covers every descendant.
     */
    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(taxRegions)
          .set({ deletedAt: new Date() })
          .where(and(eq(taxRegions.id, id), isNull(taxRegions.deletedAt)))
          .returning()
        if (!row) return null
        const children = await tx
          .select({ id: taxRegions.id })
          .from(taxRegions)
          .where(and(eq(taxRegions.parentId, id), isNull(taxRegions.deletedAt)))
        const regionIds = [id, ...children.map((c) => c.id)]
        if (children.length > 0) {
          await tx
            .update(taxRegions)
            .set({ deletedAt: new Date() })
            .where(
              inArray(
                taxRegions.id,
                children.map((c) => c.id),
              ),
            )
        }
        await tx
          .update(taxRates)
          .set({ deletedAt: new Date() })
          .where(and(inArray(taxRates.taxRegionId, regionIds), isNull(taxRates.deletedAt)))
        await emitDomainEvent(tx, 'tax-region.deleted', { id: row.id })
        return row
      })
    },
  }
}

export type TaxRegionsService = ReturnType<typeof createTaxRegionsService>

// --- TaxRate (+ TaxRateRule) service ------------------------------------------

export interface ListTaxRatesOptions {
  limit?: number
  offset?: number
  q?: string
  taxRegionId?: string
  isDefault?: boolean
}

async function insertRules(
  tx: PygmalionDatabase,
  taxRateId: string,
  rules: CreateTaxRateInput['rules'],
) {
  if (!rules || rules.length === 0) return
  await tx.insert(taxRateRules).values(
    rules.map((r) => ({
      id: pygId('txrule'),
      taxRateId,
      reference: r.reference,
      referenceId: r.referenceId,
      metadata: r.metadata ?? null,
    })),
  )
}

export function createTaxRatesService(ctx: ServiceContext) {
  async function get(id: string) {
    const [row] = await ctx.db
      .select()
      .from(taxRates)
      .where(and(eq(taxRates.id, id), isNull(taxRates.deletedAt)))
      .limit(1)
    return row ?? null
  }

  async function rules(taxRateId: string) {
    return ctx.db
      .select()
      .from(taxRateRules)
      .where(and(eq(taxRateRules.taxRateId, taxRateId), isNull(taxRateRules.deletedAt)))
  }

  return {
    async list({ limit = 20, offset = 0, q, taxRegionId, isDefault }: ListTaxRatesOptions = {}) {
      const filters = [isNull(taxRates.deletedAt)]
      if (q) filters.push(ilike(taxRates.name, `%${q}%`))
      if (taxRegionId) filters.push(eq(taxRates.taxRegionId, taxRegionId))
      if (isDefault !== undefined) filters.push(eq(taxRates.isDefault, isDefault))
      return ctx.db
        .select()
        .from(taxRates)
        .where(and(...filters))
        .limit(limit)
        .offset(offset)
    },

    get,
    rules,

    async create(input: CreateTaxRateInput) {
      const data = createTaxRateInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(taxRates)
          .values({
            id: pygId('txr'),
            taxRegionId: data.taxRegionId,
            code: data.code,
            name: data.name,
            rate: data.rate ?? null,
            isDefault: data.isDefault ?? false,
            isCombinable: data.isCombinable ?? false,
            metadata: data.metadata ?? null,
            createdBy: data.createdBy ?? null,
          })
          .returning()
        await insertRules(tx, row.id, data.rules)
        await emitDomainEvent(tx, 'tax-rate.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateTaxRateInput) {
      const data = updateTaxRateInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(taxRates)
          .set({
            ...(data.code !== undefined ? { code: data.code } : {}),
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.rate !== undefined ? { rate: data.rate } : {}),
            ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
            ...(data.isCombinable !== undefined ? { isCombinable: data.isCombinable } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(taxRates.id, id), isNull(taxRates.deletedAt)))
          .returning()
        if (!row) return null
        // Replace-set: soft-delete then recreate.
        if (data.rules !== undefined) {
          await tx
            .update(taxRateRules)
            .set({ deletedAt: new Date() })
            .where(and(eq(taxRateRules.taxRateId, row.id), isNull(taxRateRules.deletedAt)))
          await insertRules(tx, row.id, data.rules)
        }
        await emitDomainEvent(tx, 'tax-rate.updated', { id: row.id })
        return row
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(taxRates)
          .set({ deletedAt: new Date() })
          .where(and(eq(taxRates.id, id), isNull(taxRates.deletedAt)))
          .returning()
        if (!row) return null
        await tx
          .update(taxRateRules)
          .set({ deletedAt: new Date() })
          .where(and(eq(taxRateRules.taxRateId, row.id), isNull(taxRateRules.deletedAt)))
        await emitDomainEvent(tx, 'tax-rate.deleted', { id: row.id })
        return row
      })
    },

    async addRule(taxRateId: string, input: CreateTaxRateRuleInput) {
      const data = createTaxRateRuleInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [rate] = await tx
          .select({ id: taxRates.id })
          .from(taxRates)
          .where(and(eq(taxRates.id, taxRateId), isNull(taxRates.deletedAt)))
          .limit(1)
        if (!rate) return null
        const [row] = await tx
          .insert(taxRateRules)
          .values({
            id: pygId('txrule'),
            taxRateId,
            reference: data.reference,
            referenceId: data.referenceId,
            metadata: data.metadata ?? null,
            createdBy: data.createdBy ?? null,
          })
          .returning()
        await emitDomainEvent(tx, 'tax-rate-rule.created', { id: row.id })
        return row
      })
    },

    async removeRule(taxRateId: string, ruleId: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(taxRateRules)
          .set({ deletedAt: new Date() })
          .where(
            and(eq(taxRateRules.id, ruleId), eq(taxRateRules.taxRateId, taxRateId), isNull(taxRateRules.deletedAt)),
          )
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'tax-rate-rule.deleted', { id: row.id })
        return row
      })
    },
  }
}

export type TaxRatesService = ReturnType<typeof createTaxRatesService>

// --- getTaxLines: the priority resolution (ported as-is from Medusa)----------

export interface TaxCalculationItem {
  id: string
  /** "product" | "shipping_option" — matched against `tax_rate_rule.reference`. */
  reference: string
  referenceId: string
  /** Secondary match against a "product_type" rule — items only. */
  productTypeId?: string | null
}

/**
 * `prioritizeRates`: lower score wins, 7 = no match at
 * all (excluded). Named 1-7 exactly as documented: 1/4 = direct reference
 * match, 2/5 = product_type match, 3/6 = `is_default`, province beats country
 * (1-3 vs 4-6) at equal match kind.
 */
function rateRank(
  rules: TaxRateRule[],
  isDefault: boolean,
  isProvinceRegion: boolean,
  item: TaxCalculationItem,
): number {
  const direct = rules.some((r) => r.reference === item.reference && r.referenceId === item.referenceId)
  if (direct) return isProvinceRegion ? 1 : 4
  const typeMatch =
    item.productTypeId != null && rules.some((r) => r.reference === 'product_type' && r.referenceId === item.productTypeId)
  if (typeMatch) return isProvinceRegion ? 2 : 5
  if (isDefault) return isProvinceRegion ? 3 : 6
  return 7
}

function toCandidate(rate: TaxRate): TaxRateCandidate {
  return { id: rate.id, rate: rate.rate, code: rate.code, name: rate.name }
}

export function createTaxService(ctx: TaxServiceContext) {
  return {
    /**
     * Resolve applicable tax lines for a set of items/shipping lines against
     * an address, in eight steps. Returns `[]` when the address has
     * no matching country tax region (step 2) — no error, just no tax.
     */
    async getTaxLines(items: TaxCalculationItem[], context: TaxCalculationContext): Promise<TaxLine[]> {
      if (items.length === 0) return []
      const countryCode = context.address.countryCode.toLowerCase()
      const provinceCode = context.address.provinceCode ? context.address.provinceCode.toLowerCase() : null

      const candidateRegions: TaxRegion[] = await ctx.db
        .select()
        .from(taxRegions)
        .where(
          and(
            isNull(taxRegions.deletedAt),
            or(
              and(eq(taxRegions.countryCode, countryCode), isNull(taxRegions.provinceCode)),
              provinceCode
                ? and(eq(taxRegions.countryCode, countryCode), eq(taxRegions.provinceCode, provinceCode))
                : undefined,
            ),
          ),
        )

      const countryRegion = candidateRegions.find((r) => r.provinceCode === null) ?? null
      // No country-level region for this address -> no tax (step 2).
      if (!countryRegion) return []
      const provinceRegion = candidateRegions.find((r) => r.provinceCode !== null) ?? null
      const regionIds = [countryRegion.id, ...(provinceRegion ? [provinceRegion.id] : [])]

      const rates: TaxRate[] = await ctx.db
        .select()
        .from(taxRates)
        .where(and(isNull(taxRates.deletedAt), inArray(taxRates.taxRegionId, regionIds)))

      const rateIds = rates.map((r) => r.id)
      const rules: TaxRateRule[] =
        rateIds.length === 0
          ? []
          : await ctx.db
              .select()
              .from(taxRateRules)
              .where(and(isNull(taxRateRules.deletedAt), inArray(taxRateRules.taxRateId, rateIds)))

      const rulesByRate = new Map<string, TaxRateRule[]>()
      for (const rule of rules) {
        const list = rulesByRate.get(rule.taxRateId) ?? []
        list.push(rule)
        rulesByRate.set(rule.taxRateId, list)
      }

      const lines: ItemTaxCalculationLine[] = []
      for (const item of items) {
        const scored = rates
          .map((rate) => ({
            rate,
            rank: rateRank(
              rulesByRate.get(rate.id) ?? [],
              rate.isDefault,
              rate.taxRegionId === (provinceRegion?.id ?? null),
              item,
            ),
          }))
          .filter((s) => s.rank < 7)
          .sort((a, b) => a.rank - b.rank)
        const best = scored[0]
        if (!best) continue

        const itemRates = [toCandidate(best.rate)]
        // Combinable: cumulate with the best rate of the *parent* (country)
        // region (step 6), only possible when the winning rate
        // is itself at the province level (country regions have no parent).
        if (best.rate.isCombinable && best.rate.taxRegionId === provinceRegion?.id && countryRegion) {
          const parentScored = rates
            .filter((r) => r.taxRegionId === countryRegion.id)
            .map((rate) => ({ rate, rank: rateRank(rulesByRate.get(rate.id) ?? [], rate.isDefault, false, item) }))
            .filter((s) => s.rank < 7)
            .sort((a, b) => a.rank - b.rank)
          if (parentScored[0]) itemRates.push(toCandidate(parentScored[0].rate))
        }
        lines.push({ itemId: item.id, rates: itemRates })
      }

      if (lines.length === 0) return []

      // Provider resolved from the country region (step 7; a
      // province region can never carry its own, CHECK-enforced).
      const providerId = countryRegion.providerId ?? 'system'
      const provider = ctx.providers.get<TaxProvider>('tax', providerId)
      return provider.getTaxLines(lines, context)
    },
  }
}

export type TaxService = ReturnType<typeof createTaxService>
