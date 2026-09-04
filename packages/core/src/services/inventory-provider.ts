import { and, eq, inArray, sql } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import type { PygmalionDatabase } from '../db/types'
import { inventoryLevels, reservationItems, type ReservationItem, type InventoryLevel } from '../schema/inventory'
import type { ServiceContext } from './context'

/**
 * Provider seam for inventory. Exactly the 4 primitives Medusa v2 parity
 * needs: freeze stock (`reserve`), free a
 * freeze without touching physical stock (`release`), mutate physical stock
 * (`adjust` — the ONLY writer of `stockedQuantity`), and read availability
 * (`check`). `createInventoryService` (the public surface) always calls
 * through this interface rather than querying `inventoryLevels`/
 * `reservationItems` directly for these 4 operations — a third-party module
 * can register a different `inventory` provider (e.g. an external WMS) via
 * the `pygmalion:providers` hook and the public service does not change.
 *
 * `reservedQuantity`/`availableQuantity` are NEVER stored: `check` always
 * computes them as a SQL aggregate over live `reservationItems` rows, so
 * there is no mutable counter that can drift from what it summarizes.
 */
export interface InventoryAvailability {
  stocked: number
  reserved: number
  available: number
}

export interface ReserveItemInput {
  inventoryItemId: string
  locationId: string
  quantity: number
  lineItemId?: string | null
  /** Copied onto the reservation row as-is (traceability). */
  allowBackorder?: boolean
  externalId?: string | null
  description?: string | null
  createdBy?: string | null
  metadata?: Record<string, unknown> | null
}

export interface InventoryProvider {
  check(inventoryItemId: string, locationId?: string): Promise<InventoryAvailability>
  /**
   * Freezes stock against `stocked - SUM(reservations)`. Whole batch is one
   * transaction: an item beyond `available` without `allowBackorder` throws
   * and rolls back every reservation the call would have created. Does NOT
   * touch `stockedQuantity`.
   */
  reserve(items: ReserveItemInput[]): Promise<ReservationItem[]>
  /** Deletes reservations outright (pre-fulfillment cancel) — nothing physical to restore. */
  release(reservationIds: string[]): Promise<ReservationItem[]>
  /** The only mutator of `InventoryLevel.stockedQuantity` (+/- delta). Throws rather than go negative. */
  adjust(inventoryItemId: string, locationId: string, delta: number): Promise<InventoryLevel>
}

async function sumStocked(db: PygmalionDatabase, inventoryItemId: string, locationId?: string): Promise<number> {
  if (locationId) {
    const [row] = await db
      .select({ stocked: inventoryLevels.stockedQuantity })
      .from(inventoryLevels)
      .where(and(eq(inventoryLevels.inventoryItemId, inventoryItemId), eq(inventoryLevels.locationId, locationId)))
      .limit(1)
    return row?.stocked ?? 0
  }
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${inventoryLevels.stockedQuantity}), 0)::int` })
    .from(inventoryLevels)
    .where(eq(inventoryLevels.inventoryItemId, inventoryItemId))
  return row?.total ?? 0
}

async function sumReserved(db: PygmalionDatabase, inventoryItemId: string, locationId?: string): Promise<number> {
  const conditions = [eq(reservationItems.inventoryItemId, inventoryItemId)]
  if (locationId) conditions.push(eq(reservationItems.locationId, locationId))
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${reservationItems.quantity}), 0)::int` })
    .from(reservationItems)
    .where(and(...conditions))
  return row?.total ?? 0
}

export function createDbInventoryProvider(ctx: ServiceContext): InventoryProvider {
  return {
    async check(inventoryItemId, locationId) {
      const stocked = await sumStocked(ctx.db, inventoryItemId, locationId)
      const reserved = await sumReserved(ctx.db, inventoryItemId, locationId)
      return { stocked, reserved, available: stocked - reserved }
    },

    async reserve(items) {
      if (!items.length) return []
      return ctx.db.transaction(async (tx) => {
        const created: ReservationItem[] = []
        for (const item of items) {
          const stocked = await sumStocked(tx, item.inventoryItemId, item.locationId)
          // Reserved so far INCLUDES rows this same loop already inserted
          // (re-queried per item), so a batch never over-reserves itself.
          const reserved = await sumReserved(tx, item.inventoryItemId, item.locationId)
          const available = stocked - reserved
          if (item.quantity > available && !item.allowBackorder) {
            throw new Error(
              `inventory: insufficient stock for item '${item.inventoryItemId}' at location '${item.locationId}' ` +
                `(available ${available}, requested ${item.quantity})`,
            )
          }
          const [row] = await tx
            .insert(reservationItems)
            .values({
              id: pygId('resitem'),
              inventoryItemId: item.inventoryItemId,
              locationId: item.locationId,
              quantity: item.quantity,
              lineItemId: item.lineItemId ?? null,
              allowBackorder: item.allowBackorder ?? false,
              externalId: item.externalId ?? null,
              description: item.description ?? null,
              createdBy: item.createdBy ?? null,
              metadata: item.metadata ?? null,
            })
            .returning()
          created.push(row)
          await emitDomainEvent(tx, 'reservation.created', { id: row.id, inventoryItemId: row.inventoryItemId, quantity: row.quantity })
        }
        return created
      })
    },

    async release(reservationIds) {
      if (!reservationIds.length) return []
      return ctx.db.transaction(async (tx) => {
        const rows = await tx.delete(reservationItems).where(inArray(reservationItems.id, reservationIds)).returning()
        for (const row of rows) {
          await emitDomainEvent(tx, 'reservation.deleted', { id: row.id, inventoryItemId: row.inventoryItemId })
        }
        return rows
      })
    },

    async adjust(inventoryItemId, locationId, delta) {
      return ctx.db.transaction(async (tx) => {
        const [level] = await tx
          .select()
          .from(inventoryLevels)
          .where(and(eq(inventoryLevels.inventoryItemId, inventoryItemId), eq(inventoryLevels.locationId, locationId)))
          .limit(1)
        if (!level) {
          throw new Error(`inventory: no stock level for item '${inventoryItemId}' at location '${locationId}'`)
        }
        const next = level.stockedQuantity + delta
        if (next < 0) {
          throw new Error('inventory: adjustment would drive stocked quantity negative')
        }
        const [row] = await tx
          .update(inventoryLevels)
          .set({ stockedQuantity: next, updatedAt: new Date() })
          .where(eq(inventoryLevels.id, level.id))
          .returning()
        await emitDomainEvent(tx, 'inventory-level.updated', { id: row.id, inventoryItemId, locationId, delta })
        return row
      })
    },
  }
}
