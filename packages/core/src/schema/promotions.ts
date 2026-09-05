// --- Promotions ------------------------------------------------------------
// BuyGet and all campaign budget types (spend/usage/use_by_attribute) are
// supported. `services/promotions-engine.ts` is the pure compute layer this schema
// feeds; `services/promotions.ts` is the DB-backed CRUD + candidate loader.
//
// `promotion_rule` unifies Medusa's 3 separate pivot tables (rules /
// target_rules / buy_rules) into one table + a `scope` column — same rows,
// one join instead of three (single relational schema, no per-scope
// pivot ceremony). `attribute` stays free text (not a DB enum) — the engine
// owns the closed set of attributes it knows how to resolve
// ponytail: (`promotions-engine.ts`'s `resolve*Attribute`). Add a DB enum if a module
// ever needs to extend the attribute set at runtime.
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { currencies } from './settings'

export const promotionStatus = pgEnum('promotion_status', ['draft', 'active', 'inactive'])
export const promotionType = pgEnum('promotion_type', ['standard', 'buyget'])
export const promotionRuleScope = pgEnum('promotion_rule_scope', ['eligibility', 'target', 'buy'])
export const promotionRuleOperator = pgEnum('promotion_rule_operator', ['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte'])
export const applicationMethodTarget = pgEnum('application_method_target', ['order', 'items', 'shipping'])
export const applicationMethodAllocation = pgEnum('application_method_allocation', ['each', 'across', 'once'])
export const applicationMethodValueType = pgEnum('application_method_value_type', ['fixed', 'percentage'])
export const campaignBudgetType = pgEnum('campaign_budget_type', ['spend', 'usage', 'use_by_attribute'])

// --- Campaign ---------------------------------------------------------------

export const campaigns = pgTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    campaignIdentifier: text('campaign_identifier'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('campaigns_identifier_unique').on(t.campaignIdentifier).where(sql`${t.campaignIdentifier} is not null and ${t.deletedAt} is null`),
  ],
)

export type Campaign = typeof campaigns.$inferSelect

// One budget per campaign (Medusa's `hasOne`, ported as unique FK — same
// "fuse the 1:1 into a unique index" pattern as `promotion_application_methods` below).
export const campaignBudgets = pgTable(
  'campaign_budgets',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    type: campaignBudgetType('type').notNull(),
    currencyCode: text('currency_code').references(() => currencies.code),
    // spend: cents. usage: a plain count (limit/used are unit-less then).
    limitAmount: integer('limit_amount'),
    usedAmount: integer('used_amount').notNull().default(0),
    // use_by_attribute only, e.g. `customer_id` / `customer_email` — which key
    // of the engine's `attributeValues` context map this budget is scoped by.
    attribute: text('attribute'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('campaign_budgets_campaign_id_unique').on(t.campaignId),
    check('campaign_budgets_used_nonneg', sql`${t.usedAmount} >= 0`),
  ],
)

export type CampaignBudget = typeof campaignBudgets.$inferSelect

// Per-attribute-value usage counter for `use_by_attribute` budgets (e.g. "1
// use per customer_id") — unique per (budget, value) so upserting a running
// count is a single `onConflictDoUpdate`.
export const campaignBudgetUsages = pgTable(
  'campaign_budget_usages',
  {
    id: text('id').primaryKey(),
    budgetId: text('budget_id')
      .notNull()
      .references(() => campaignBudgets.id, { onDelete: 'cascade' }),
    attributeValue: text('attribute_value').notNull(),
    used: integer('used').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('campaign_budget_usages_budget_attr_unique').on(t.budgetId, t.attributeValue)],
)

export type CampaignBudgetUsage = typeof campaignBudgetUsages.$inferSelect

// --- Promotion ----------------------------------------------------------------

export const promotions = pgTable(
  'promotions',
  {
    id: text('id').primaryKey(),
    // Partial unique index: automatic promotions
    // may have no code at all; several of those can coexist with `code IS NULL`.
    code: text('code'),
    isAutomatic: boolean('is_automatic').notNull().default(false),
    status: promotionStatus('status').notNull().default('draft'),
    type: promotionType('type').notNull().default('standard'),
    campaignId: text('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('promotions_code_unique').on(t.code).where(sql`${t.code} is not null and ${t.deletedAt} is null`),
    index('promotions_campaign_id_idx').on(t.campaignId),
  ],
)

export type Promotion = typeof promotions.$inferSelect

// 1:1 with Promotion (Medusa's `hasOne ApplicationMethod`) — unique FK instead
// of a separate cardinality-enforcing mechanism.
export const promotionApplicationMethods = pgTable(
  'promotion_application_methods',
  {
    id: text('id').primaryKey(),
    promotionId: text('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),
    target: applicationMethodTarget('target').notNull(),
    allocation: applicationMethodAllocation('allocation').notNull().default('each'),
    valueType: applicationMethodValueType('value_type').notNull(),
    // ponytail: fixed: cents. percentage: whole points 0-100 (no fractional percentages;
    // add a basis-points column if a merchant needs one).
    value: integer('value').notNull(),
    currencyCode: text('currency_code').references(() => currencies.code),
    maxQuantity: integer('max_quantity'),
    // BuyGet only.
    buyRulesMinQuantity: integer('buy_rules_min_quantity'),
    applyToQuantity: integer('apply_to_quantity'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('promotion_application_methods_promotion_id_unique').on(t.promotionId),
    check('promotion_application_methods_value_nonneg', sql`${t.value} >= 0`),
  ],
)

export type PromotionApplicationMethod = typeof promotionApplicationMethods.$inferSelect

// `scope` replaces Medusa's 3 pivot tables (see file header). `eligibility`
// rules gate the whole promotion; `target`/`buy` are BuyGet's two halves
// (`target` doubles as the plain "which lines does a standard promo touch"
// set for non-BuyGet promotions too).
export const promotionRules = pgTable(
  'promotion_rules',
  {
    id: text('id').primaryKey(),
    promotionId: text('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),
    scope: promotionRuleScope('scope').notNull(),
    attribute: text('attribute').notNull(),
    operator: promotionRuleOperator('operator').notNull().default('eq'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('promotion_rules_promotion_id_idx').on(t.promotionId)],
)

export type PromotionRule = typeof promotionRules.$inferSelect

// Multi-value OR set for one rule (eq/in test set membership).
export const promotionRuleValues = pgTable(
  'promotion_rule_values',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => promotionRules.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
  },
  (t) => [index('promotion_rule_values_rule_id_idx').on(t.ruleId)],
)

export type PromotionRuleValue = typeof promotionRuleValues.$inferSelect
