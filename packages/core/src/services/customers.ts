import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { customerAddress, customerUser } from '../schema/customers'
import {
  createCustomerAddressInput,
  createCustomerInput,
  updateCustomerAddressInput,
  updateCustomerInput,
  type CreateCustomerAddressInput,
  type CreateCustomerInput,
  type UpdateCustomerAddressInput,
  type UpdateCustomerInput,
} from '../validation/customers'
import type { ServiceContext } from './context'

export interface ListCustomersOptions {
  limit?: number
  offset?: number
  q?: string
}

export function createCustomersService(ctx: ServiceContext) {
  return {
    async list({ limit = 20, offset = 0, q }: ListCustomersOptions = {}) {
      const where = q
        ? or(ilike(customerUser.email, `%${q}%`), ilike(customerUser.name, `%${q}%`))
        : undefined
      return ctx.db
        .select()
        .from(customerUser)
        .where(where)
        .orderBy(desc(customerUser.createdAt), desc(customerUser.id))
        .limit(limit)
        .offset(offset)
    },

    async get(id: string) {
      const [row] = await ctx.db.select().from(customerUser).where(eq(customerUser.id, id)).limit(1)
      return row ?? null
    },

    /**
     * Admin-created customer (phone order, in-store sale). No credential is
     * created: the row is a guest (`has_account = false`) until that email
     * signs up through better-auth. Account creation stays a better-auth
     * concern, never an admin route writing credentials.
     */
    async create(input: CreateCustomerInput) {
      const data = createCustomerInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(customerUser)
          .values({
            id: pygId('cus'),
            name: data.name ?? '',
            email: data.email,
            phone: data.phone ?? null,
            metadata: data.metadata ?? null,
            hasAccount: false,
          })
          .returning()
        await emitDomainEvent(tx, 'customer.created', { id: row.id, guest: true })
        return row
      })
    },

    /** Shared by `/api/store/customers/me` (self) and admin update. */
    async update(id: string, input: UpdateCustomerInput) {
      const data = updateCustomerInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(customerUser)
          .set({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.phone !== undefined ? { phone: data.phone } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(eq(customerUser.id, id))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'customer.updated', { id: row.id })
        return row
      })
    },

    /**
     * Guest customer: a `customer_user` row with no
     * better-auth credential. Idempotent on the live guest for this email —
     * calling it twice for the same address returns the same row rather than
     * violating `customer_user_email_has_account_unique`. Checkout calls it
     * when an order is placed without an account.
     */
    async ensureGuest(email: string) {
      const normalized = email.trim().toLowerCase()
      const [existing] = await ctx.db
        .select()
        .from(customerUser)
        .where(and(eq(customerUser.email, normalized), eq(customerUser.hasAccount, false)))
        .limit(1)
      if (existing) return existing

      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(customerUser)
          .values({ id: pygId('cus'), name: '', email: normalized, hasAccount: false })
          .returning()
        await emitDomainEvent(tx, 'customer.created', { id: row.id, guest: true })
        return row
      })
    },

    addresses: {
      async list(customerId: string) {
        return ctx.db
          .select()
          .from(customerAddress)
          .where(eq(customerAddress.customerId, customerId))
          .orderBy(desc(customerAddress.createdAt), desc(customerAddress.id))
      },

      async get(customerId: string, id: string) {
        const [row] = await ctx.db
          .select()
          .from(customerAddress)
          .where(and(eq(customerAddress.id, id), eq(customerAddress.customerId, customerId)))
          .limit(1)
        return row ?? null
      },

      async create(customerId: string, input: CreateCustomerAddressInput) {
        const data = createCustomerAddressInput.parse(input)
        return ctx.db.transaction(async (tx) => {
          if (data.isDefaultShipping) await unsetDefault(tx, customerId, 'shipping')
          if (data.isDefaultBilling) await unsetDefault(tx, customerId, 'billing')
          const [row] = await tx
            .insert(customerAddress)
            .values({ id: pygId('caddr'), customerId, ...data })
            .returning()
          await emitDomainEvent(tx, 'customer-address.created', { id: row.id, customerId })
          return row
        })
      },

      async update(customerId: string, id: string, input: UpdateCustomerAddressInput) {
        const data = updateCustomerAddressInput.parse(input)
        return ctx.db.transaction(async (tx) => {
          if (data.isDefaultShipping) await unsetDefault(tx, customerId, 'shipping')
          if (data.isDefaultBilling) await unsetDefault(tx, customerId, 'billing')
          const [row] = await tx
            .update(customerAddress)
            .set({ ...data, updatedAt: new Date() })
            .where(and(eq(customerAddress.id, id), eq(customerAddress.customerId, customerId)))
            .returning()
          if (!row) return null
          await emitDomainEvent(tx, 'customer-address.updated', { id: row.id, customerId })
          return row
        })
      },

      async remove(customerId: string, id: string) {
        return ctx.db.transaction(async (tx) => {
          const [row] = await tx
            .delete(customerAddress)
            .where(and(eq(customerAddress.id, id), eq(customerAddress.customerId, customerId)))
            .returning()
          if (!row) return null
          await emitDomainEvent(tx, 'customer-address.deleted', { id: row.id, customerId })
          return row
        })
      },
    },
  }
}

/** Clears the current default (shipping or billing) address for a customer before a new one claims it. */
async function unsetDefault(
  tx: ServiceContext['db'],
  customerId: string,
  which: 'shipping' | 'billing',
) {
  if (which === 'shipping') {
    await tx.update(customerAddress).set({ isDefaultShipping: false })
      .where(and(eq(customerAddress.customerId, customerId), eq(customerAddress.isDefaultShipping, true)))
  } else {
    await tx.update(customerAddress).set({ isDefaultBilling: false })
      .where(and(eq(customerAddress.customerId, customerId), eq(customerAddress.isDefaultBilling, true)))
  }
}

export type CustomersService = ReturnType<typeof createCustomersService>
