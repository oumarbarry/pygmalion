import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Customer auth tables, backing the `customer` better-auth instance (customers
 * and staff are two isolated better-auth instances). Unlike staff (auth-only,
 * `staff_*`), `customer_user` also IS the domain Customer entity: Medusa keeps
 * `Customer` separate from `auth_identity`; here `has_account` lives straight
 * on this table instead of re-introducing that split. Prefixed `customer_`.
 * Column-key contract with better-auth: see `utils/customer-auth.ts`.
 */

export const customerUser = pgTable('customer_user', {
  id: text('id').primaryKey(),
  // No default: better-auth's sign-up always supplies a name; guest rows
  // (created by `ensureGuest`, bypassing better-auth) pass '' explicitly.
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // --- Commerce profile extension: plain extra columns, not
  // written by better-auth itself (nullable/defaulted so its own insert,
  // which only knows the core fields above, never trips a NOT NULL). ---
  phone: text('phone'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  // Guest vs registered: `true` (default) for any row
  // better-auth itself creates via sign-up (a `customer_account` row with
  // credentials exists); a guest row is inserted directly by
  // `customersService.ensureGuest` with `false` and no credential at all.
  // The unique index below — ported as-is from Medusa's `(email,
  // has_account)` — lets a guest and a registered account coexist for the
  // same email as two distinct rows.
  // Deliberately not ported: Medusa's guest-upgrade-in-place (reuse the guest
  // row when that email later registers). better-auth itself refuses to sign
  // up an email that already has ANY row here (its own duplicate-email guard,
  // not scoped by has_account), so a guest row must be created for an email
  // *after* that email's public sign-up happened, not before. Reconciling the
  // two into one identity, if ever needed, is a checkout concern.
  hasAccount: boolean('has_account').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('customer_user_email_has_account_unique').on(t.email, t.hasAccount),
])

export const customerSession = pgTable('customer_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => customerUser.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('customer_session_token_unique').on(t.token)])

export const customerAccount = pgTable('customer_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => customerUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const customerVerification = pgTable('customer_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- CustomerAddress (ported field-for-field from Medusa) ------------------

export const customerAddress = pgTable('customer_address', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customerUser.id, { onDelete: 'cascade' }),
  addressName: text('address_name'),
  isDefaultShipping: boolean('is_default_shipping').notNull().default(false),
  isDefaultBilling: boolean('is_default_billing').notNull().default(false),
  company: text('company'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  address1: text('address_1'),
  address2: text('address_2'),
  city: text('city'),
  countryCode: text('country_code'),
  province: text('province'),
  postalCode: text('postal_code'),
  phone: text('phone'),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // At most one default shipping / default billing address per customer,
  // enforced at the DB level, same shape as
  // `store_currencies_default_unique`.
  uniqueIndex('customer_address_default_shipping_unique')
    .on(t.customerId).where(sql`${t.isDefaultShipping} = true`),
  uniqueIndex('customer_address_default_billing_unique')
    .on(t.customerId).where(sql`${t.isDefaultBilling} = true`),
])

// --- CustomerGroup + membership ---------------------------------------------

export const customerGroup = pgTable('customer_group', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('customer_group_name_unique').on(t.name).where(sql`${t.deletedAt} is null`),
])

export const customerGroupMember = pgTable('customer_group_member', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => customerGroup.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull().references(() => customerUser.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('customer_group_member_unique').on(t.groupId, t.customerId),
])

export type CustomerUser = typeof customerUser.$inferSelect
export type CustomerAddress = typeof customerAddress.$inferSelect
export type CustomerGroup = typeof customerGroup.$inferSelect
export type CustomerGroupMember = typeof customerGroupMember.$inferSelect
