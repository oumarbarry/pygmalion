import { and, desc, eq, ilike, inArray, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { customerGroup, customerGroupMember, customerUser } from '../schema/customers'
import {
  createCustomerGroupInput,
  groupMembersInput,
  updateCustomerGroupInput,
  type CreateCustomerGroupInput,
  type GroupMembersInput,
  type UpdateCustomerGroupInput,
} from '../validation/customers'
import type { ServiceContext } from './context'

export interface ListCustomerGroupsOptions {
  limit?: number
  offset?: number
  q?: string
}

export function createCustomerGroupsService(ctx: ServiceContext) {
  return {
    async list({ limit = 20, offset = 0, q }: ListCustomerGroupsOptions = {}) {
      const where = q
        ? and(isNull(customerGroup.deletedAt), ilike(customerGroup.name, `%${q}%`))
        : isNull(customerGroup.deletedAt)
      return ctx.db
        .select()
        .from(customerGroup)
        .where(where)
        .orderBy(desc(customerGroup.createdAt), desc(customerGroup.id))
        .limit(limit)
        .offset(offset)
    },

    async get(id: string) {
      const [row] = await ctx.db
        .select()
        .from(customerGroup)
        .where(and(eq(customerGroup.id, id), isNull(customerGroup.deletedAt)))
        .limit(1)
      return row ?? null
    },

    async create(input: CreateCustomerGroupInput) {
      const data = createCustomerGroupInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(customerGroup)
          .values({ id: pygId('cgrp'), name: data.name, metadata: data.metadata ?? null })
          .returning()
        await emitDomainEvent(tx, 'customer-group.created', { id: row.id })
        return row
      })
    },

    async update(id: string, input: UpdateCustomerGroupInput) {
      const data = updateCustomerGroupInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(customerGroup)
          .set({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(customerGroup.id, id), isNull(customerGroup.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'customer-group.updated', { id: row.id })
        return row
      })
    },

    async remove(id: string) {
      return ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(customerGroup)
          .set({ deletedAt: new Date() })
          .where(and(eq(customerGroup.id, id), isNull(customerGroup.deletedAt)))
          .returning()
        if (!row) return null
        await emitDomainEvent(tx, 'customer-group.deleted', { id: row.id })
        return row
      })
    },

    async members(groupId: string) {
      return ctx.db
        .select({
          id: customerUser.id,
          email: customerUser.email,
          name: customerUser.name,
        })
        .from(customerGroupMember)
        .innerJoin(customerUser, eq(customerGroupMember.customerId, customerUser.id))
        .where(eq(customerGroupMember.groupId, groupId))
    },

    /** The (live) groups a customer belongs to — customer side of the same link. */
    async groupsOf(customerId: string) {
      return ctx.db
        .select({ id: customerGroup.id, name: customerGroup.name, metadata: customerGroup.metadata })
        .from(customerGroupMember)
        .innerJoin(customerGroup, eq(customerGroupMember.groupId, customerGroup.id))
        .where(and(eq(customerGroupMember.customerId, customerId), isNull(customerGroup.deletedAt)))
    },

    /** Batch add/remove groups FOR a customer (mirror of setMembers). */
    async setGroupsOf(customerId: string, input: GroupMembersInput) {
      const data = groupMembersInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        if (data.remove?.length) {
          await tx
            .delete(customerGroupMember)
            .where(and(eq(customerGroupMember.customerId, customerId), inArray(customerGroupMember.groupId, data.remove)))
        }
        if (data.add?.length) {
          await tx
            .insert(customerGroupMember)
            .values(data.add.map((groupId) => ({ id: pygId('cgrpmem'), groupId, customerId })))
            .onConflictDoNothing()
        }
        await emitDomainEvent(tx, 'customer.updated', { id: customerId, groupsChanged: true })
        return true
      })
    },

    /** Batch add/remove: one `/customer-groups/:id/customers` endpoint (Medusa v2 parity). */
    async setMembers(groupId: string, input: GroupMembersInput) {
      const data = groupMembersInput.parse(input)
      return ctx.db.transaction(async (tx) => {
        if (data.remove?.length) {
          await tx
            .delete(customerGroupMember)
            .where(
              and(
                eq(customerGroupMember.groupId, groupId),
                inArray(customerGroupMember.customerId, data.remove),
              ),
            )
        }
        if (data.add?.length) {
          await tx
            .insert(customerGroupMember)
            .values(data.add.map((customerId) => ({ id: pygId('cgrpmem'), groupId, customerId })))
            .onConflictDoNothing()
        }
        await emitDomainEvent(tx, 'customer-group.updated', { id: groupId, membersChanged: true })
        return true
      })
    },
  }
}

export type CustomerGroupsService = ReturnType<typeof createCustomerGroupsService>
