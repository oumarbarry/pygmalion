/**
 * Staff auth: stable interface consumed by api-key sales-channel scoping and
 * by the customers instance. Do not change these signatures without checking
 * both.
 *
 *   staffAuth(): the boot-lazy `staff` better-auth instance (admin + api-key
 *     plugins, basePath `/api/admin/auth`). `staffAuth().api.getSession({headers})`
 *     resolves EITHER a cookie session OR an `x-api-key` header (the api-key
 *     plugin's `enableSessionForAPIKeys` folds both into one call); this is
 *     the one auth check `/api/admin/**` needs.
 *   createAuthInstance(db, config): the generic factory both staff and
 *     customers instances build on; wraps `drizzleAdapter` wiring so each
 *     instance only supplies its own schema/plugins/basePath. `customer-auth.ts`
 *     calls this directly to build `customerAuth`.
 *   requirePermission(event, resource, operation): throws 403 unless the
 *     staff role resolved by `middleware/admin-auth.ts` (`event.context.staff`)
 *     is allowed the operation on the resource. Call from any `/api/admin/**`
 *     route that needs finer-than-401 gating.
 *   staffAccessControl / staffRoles: the access-control statement + 3 fixed
 *     roles (owner/manager/fulfiller), exported so callers
 *     can introspect (e.g. to validate an invite's requested role).
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { createAccessControl } from 'better-auth/plugins/access'
import { apiKey } from '@better-auth/api-key'
import { createError, type H3Event } from 'h3'
import { pygId, type PygmalionDatabase } from '@oumarbarry/pygmalion-core'
import { staffAccount, staffApiKey, staffSession, staffUser, staffVerification } from '@oumarbarry/pygmalion-core/schema'
import { getPygmalionContext } from '../context'

// --- Generic instance factory (shared with customer-auth.ts) ----------------

export interface AuthInstanceConfig extends Omit<BetterAuthOptions, 'database'> {
  /** Model name -> Drizzle table, e.g. `{ user: staffUser, session: staffSession }`. */
  schema: Record<string, unknown>
}

// Generic over `Options` (not just `AuthInstanceConfig`) so the literal
// plugin array passed at each call site survives into `betterAuth`'s own
// generic inference — plugin-specific endpoints (`api.createUser`,
// `api.listUsers`, api-key's `api.createApiKey`, …) only type-check when
// `betterAuth()` sees the precise plugins tuple, not the widened
// `BetterAuthPlugin[]` a non-generic parameter type would force.
export function createAuthInstance<Options extends AuthInstanceConfig>(db: PygmalionDatabase, config: Options) {
  const { schema, ...options } = config
  // Rate limiting stays on in real deployments (better-auth defaults);
  // E2E suites sign in many times in seconds and may opt out via env.
  options.rateLimit ??= process.env.PYGMALION_TEST_DISABLE_RATE_LIMIT === '1' ? { enabled: false } : undefined
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required in production (better-auth-security-best-practices)')
  }
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    // Dev-only fallback secret, never used when NODE_ENV=production (guarded above).
    secret: secret ?? 'pygmalion-dev-only-insecure-secret-do-not-use-in-prod',
    ...options,
  })
}

// --- Access control: 3 fixed roles, resource×operation in code --------------

export type StaffRole = 'owner' | 'manager' | 'fulfiller'
export type StaffResource = 'products' | 'orders' | 'customers' | 'settings' | 'staff'
export type StaffOperation = 'create' | 'read' | 'update' | 'delete'

const commerceStatements = {
  products: ['create', 'read', 'update', 'delete'],
  orders: ['create', 'read', 'update', 'delete'],
  customers: ['create', 'read', 'update', 'delete'],
  settings: ['create', 'read', 'update', 'delete'],
  // Staff/invites management — kept resource-scoped like the rest instead of
  // reusing better-auth's own `user`/`session` admin statements, so one
  // matrix (this file) is the single source of truth for `requirePermission`.
  staff: ['create', 'read', 'update', 'delete'],
} as const

export const staffAccessControl = createAccessControl(commerceStatements)

export const staffRoles: Record<StaffRole, ReturnType<typeof staffAccessControl.newRole>> = {
  owner: staffAccessControl.newRole({
    products: ['create', 'read', 'update', 'delete'],
    orders: ['create', 'read', 'update', 'delete'],
    customers: ['create', 'read', 'update', 'delete'],
    settings: ['create', 'read', 'update', 'delete'],
    staff: ['create', 'read', 'update', 'delete'],
  }),
  manager: staffAccessControl.newRole({
    products: ['create', 'read', 'update', 'delete'],
    orders: ['create', 'read', 'update', 'delete'],
    customers: ['create', 'read', 'update', 'delete'],
    settings: ['read'],
    staff: [],
  }),
  fulfiller: staffAccessControl.newRole({
    products: ['read'],
    orders: ['read', 'update'],
    customers: ['read'],
    settings: [],
    staff: [],
  }),
}

// --- The `staff` instance ----------------------------------------------------

// Named (not inlined into `staffAuth`) so `ReturnType<>` below captures the
// precise, plugin-specific instance type instead of widening through a
// generic left unresolved.
function buildStaffAuth(db: PygmalionDatabase) {
  return createAuthInstance(db, {
    basePath: '/api/admin/auth',
    // SECURITY: `/api/admin/auth/**` is exempted from the admin middleware
    // (sign-in must be public), which would otherwise leave staff sign-up
    // open to anyone. Public sign-up is therefore DISABLED outright — staff
    // creation only happens via invite→accept (server-side createUser) or
    // the first-boot bootstrap route (`/api/admin/auth-bootstrap`, guarded
    // by a zero-staff check).
    emailAndPassword: { enabled: true, disableSignUp: true },
    advanced: { database: { generateId: () => pygId('staff') } },
    plugins: [
      // defaultRole 'owner' is safe: public sign-up only exists for the
      // first-boot bootstrap (guarded above); every later user gets an
      // explicit role via invite→accept.
      // adminRoles: better-auth's own admin endpoints (listUsers, createUser
      // over HTTP, ban…) are owner-only; finer grants go through
      // requirePermission. defaultRole 'owner' is safe: public sign-up is
      // disabled — the only unauthenticated creation is the bootstrap route.
      admin({ ac: staffAccessControl, roles: staffRoles, defaultRole: 'owner', adminRoles: ['owner'] }),
      // Secret keys for machine access to /api/admin/**; sessions
      // resolve transparently from the `x-api-key` header via getSession.
      apiKey({ enableSessionForAPIKeys: true }),
    ],
    schema: {
      user: staffUser,
      session: staffSession,
      account: staffAccount,
      verification: staffVerification,
      apikey: staffApiKey,
    },
  })
}

let instance: ReturnType<typeof buildStaffAuth> | undefined

/** Boot-lazy singleton — built on first call from the Pygmalion runtime db. */
export function staffAuth() {
  if (!instance) {
    const { db } = getPygmalionContext()
    instance = buildStaffAuth(db)
  }
  return instance
}

declare module 'h3' {
  interface H3EventContext {
    staff?: { user: { id: string; email: string }; role: StaffRole }
  }
}

/** 403 unless the resolved staff role (set by `middleware/admin-auth.ts`) can `operation` on `resource`. */
export function requirePermission(event: H3Event, resource: StaffResource, operation: StaffOperation): void {
  const role = event.context.staff?.role
  const allowed = role ? staffRoles[role].authorize({ [resource]: [operation] }).success : false
  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}
