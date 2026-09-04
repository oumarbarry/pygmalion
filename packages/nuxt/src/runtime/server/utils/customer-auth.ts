/**
 * Customer auth: the storefront's better-auth instance,
 * isolated from `staff` (utils/auth.ts). Tables `customer_*`, basePath
 * `/api/auth`, sign-up PUBLIC and open (this is the storefront; contrast
 * with staff's invite-only sign-up).
 *
 * Extension point (the exposed surface is complete and configurable by the
 * framework's user: OAuth, 2FA, passkeys are config, not forks). It
 * mirrors the existing `pygmalion:schema` / `pygmalion:providers` build-time
 * hooks (registry.ts): a module adds a specifier pointing at a file whose
 * default export is a `Partial<BetterAuthOptions>` (e.g. `{ socialProviders:
 * {...} }` or `{ plugins: [twoFactor()] }`); every contribution is merged
 * (shallow, later wins) into the instance built here via the generated
 * `#pygmalion/customer-auth-options` virtual module.
 */
import { emitDomainEvent, pygId, type PygmalionDatabase } from '@oumarbarry/pygmalion-core'
import { customerAccount, customerSession, customerUser, customerVerification } from '@oumarbarry/pygmalion-core/schema'
import { createError, type H3Event } from 'h3'
import { customerAuthOptions } from '#pygmalion/customer-auth-options'
import { createAuthInstance } from './auth'
import { getPygmalionContext } from '../context'

function buildCustomerAuth(db: PygmalionDatabase) {
  return createAuthInstance(db, {
    basePath: '/api/auth',
    // PUBLIC on purpose: the storefront lets anyone create an account.
    emailAndPassword: { enabled: true },
    advanced: { database: { generateId: () => pygId('cus') } },
    // Emits the CRUD event for the one customer-creation path this file
    // doesn't otherwise see (real sign-up) — `ensureGuest`/`update` emit
    // their own from `services/customers.ts` for the paths that go through
    // our db directly instead of better-auth's.
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string }) => {
            await emitDomainEvent(db, 'customer.created', { id: user.id, guest: false })
          },
        },
      },
    },
    schema: {
      user: customerUser,
      session: customerSession,
      account: customerAccount,
      verification: customerVerification,
    },
    ...customerAuthOptions,
  })
}

let instance: ReturnType<typeof buildCustomerAuth> | undefined

/** Boot-lazy singleton — built on first call from the Pygmalion runtime db. */
export function customerAuth() {
  if (!instance) {
    const { db } = getPygmalionContext()
    instance = buildCustomerAuth(db)
  }
  return instance
}

declare module 'h3' {
  interface H3EventContext {
    /** Set by `middleware/customer-auth.ts` on `/api/store/**` — undefined when no session cookie is present (auth is optional on the storefront). */
    customer?: { id: string, email: string }
  }
}

/** 401 unless `middleware/customer-auth.ts` resolved a session on this request. Call from any `/api/store/**` route that requires a signed-in customer. */
export function requireCustomer(event: H3Event): { id: string, email: string } {
  const customer = event.context.customer
  if (!customer) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return customer
}
