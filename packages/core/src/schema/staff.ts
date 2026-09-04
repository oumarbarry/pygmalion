import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Staff auth tables, backing the `staff` better-auth instance (customers and
 * staff are two isolated better-auth instances).
 * Column sets mirror what better-auth's core schema + `admin`/`api-key`
 * plugins require (verified against `better-auth@1.6.23` /
 * `@better-auth/api-key@1.6.23` via `getSchema()` introspection), prefixed
 * `staff_`. Table/column names are free (better-auth maps by JS
 * property key, not by db name) — only the property keys on the object
 * passed to `drizzleAdapter({ schema })` must match better-auth's field
 * names exactly; see `utils/auth.ts`.
 */

export const staffUser = pgTable('staff_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Fixed role set (owner/manager/fulfiller) — enforced at the app layer via
  // the access-control statements in utils/auth.ts, not a DB enum, so the
  // set stays a code-level (not DB-migration-level) concern per arbitrage.
  role: text('role'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('staff_user_email_unique').on(t.email)])

export const staffSession = pgTable('staff_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => staffUser.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('staff_session_token_unique').on(t.token)])

export const staffAccount = pgTable('staff_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => staffUser.id, { onDelete: 'cascade' }),
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

export const staffVerification = pgTable('staff_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// `@better-auth/api-key` model ("apikey"): secret keys (`sk_`) for machine
// access to `/api/admin/**` and publishable keys (`pk_`), distinguished by
// `prefix`. Sales-channel scoping lives in `publishable_key_sales_channel`.
export const staffApiKey = pgTable('staff_api_key', {
  id: text('id').primaryKey(),
  configId: text('config_id').notNull().default('default'),
  name: text('name'),
  start: text('start'),
  referenceId: text('reference_id').notNull().references(() => staffUser.id, { onDelete: 'cascade' }),
  prefix: text('prefix'),
  key: text('key').notNull(),
  refillInterval: integer('refill_interval'),
  refillAmount: integer('refill_amount'),
  lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
  enabled: boolean('enabled').default(true),
  rateLimitEnabled: boolean('rate_limit_enabled').default(true),
  rateLimitTimeWindow: integer('rate_limit_time_window').default(86_400_000),
  rateLimitMax: integer('rate_limit_max').default(10),
  requestCount: integer('request_count').default(0),
  remaining: integer('remaining'),
  lastRequest: timestamp('last_request', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  permissions: text('permissions'),
  metadata: text('metadata'),
})

// Pygmalion-owned invite table (NOT a better-auth model — no plugin covers
// invite/token/expiry). Accept is atomic: validated here, then the better-auth
// user is created with its role in one call (utils/auth.ts `acceptStaffInvite`
// helper lives in the accept route since services/staff.ts isn't owned by
// this task — see api/admin/invites/accept.post.ts).
export const staffInvite = pgTable('staff_invite', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  role: text('role').notNull(),
  token: text('token').notNull(),
  invitedBy: text('invited_by').references(() => staffUser.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('staff_invite_token_unique').on(t.token),
  // At most one live (pending) invite per email, mirrors Medusa's
  // `invite.email` unique-active constraint.
  uniqueIndex('staff_invite_email_pending_unique')
    .on(t.email)
    .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
])

export type StaffUser = typeof staffUser.$inferSelect
export type StaffSession = typeof staffSession.$inferSelect
export type StaffInvite = typeof staffInvite.$inferSelect
