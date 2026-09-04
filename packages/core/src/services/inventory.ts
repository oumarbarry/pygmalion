import { and, asc, desc, eq, getTableColumns, ilike, isNull } from 'drizzle-orm'
import { pygId } from '../id'
import { emitDomainEvent } from '../events/outbox'
import { productVariants, type ProductVariant } from '../schema/products'
import { orderLineItems } from '../schema/orders'
import {
  inventoryItems,
  inventoryLevels,
  reservationItems,
  stockLocationAddresses,
  stockLocations,
  variantInventoryItems,
  type InventoryItem,
  type VariantInventoryItem,
} from '../schema/inventory'
import {
  createInventoryItemInput,
  createReservationInput,
  createStockLocationInput,
  linkVariantInventoryItemInput,
  reserveVariantsInput,
  updateInventoryItemInput,
  updateReservationInput,
  updateStockLocationInput,
  upsertInventoryLevelInput,
  type CreateInventoryItemInput,
  type CreateReservationInput,
  type CreateStockLocationInput,
  type LinkVariantInventoryItemInput,
  type ReserveVariantsInput,
  type UpdateInventoryItemInput,
  type UpdateReservationInput,
  type UpdateStockLocationInput,
  type UpsertInventoryLevelInput,
} from '../validation/inventory'
import { createDbInventoryProvider, type InventoryProvider, type ReserveItemInput } from './inventory-provider'
import type { ServiceContext } from './context'

/**
 * Public inventory service. Business-cycle methods (`reserveVariants`,
 * `releaseReservations`, `fulfill`, `cancelFulfillment`, `availability`) always
 * go through the injected `InventoryProvider`, never touch
 * `inventoryLevels`/`reservationItems` directly for those operations. CRUD
 * (items/levels/locations/raw reservations) is plain admin bookkeeping and
 * queries the tables directly, same as every other domain service.
 */
export function createInventoryService(ctx: ServiceContext, provider: InventoryProvider = createDbInventoryProvider(ctx)) {
  // --- InventoryItem CRUD -----------------------------------------------------

  async function getItem(id: string) {
    const [row] = await ctx.db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), isNull(inventoryItems.deletedAt)))
      .limit(1)
    return row ?? null
  }

  async function createItem(input: CreateInventoryItemInput) {
    const data = createInventoryItemInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(inventoryItems)
        .values({
          id: pygId('iitem'),
          sku: data.sku ?? null,
          weight: data.weight ?? null,
          length: data.length ?? null,
          height: data.height ?? null,
          width: data.width ?? null,
          originCountry: data.originCountry ?? null,
          hsCode: data.hsCode ?? null,
          midCode: data.midCode ?? null,
          requiresShipping: data.requiresShipping ?? true,
          metadata: data.metadata ?? null,
        })
        .returning()
      await emitDomainEvent(tx, 'inventory-item.created', { id: row.id })
      return row
    })
  }

  async function updateItem(id: string, input: UpdateInventoryItemInput) {
    const data = updateInventoryItemInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(inventoryItems)
        .set({
          ...(data.sku !== undefined ? { sku: data.sku } : {}),
          ...(data.weight !== undefined ? { weight: data.weight } : {}),
          ...(data.length !== undefined ? { length: data.length } : {}),
          ...(data.height !== undefined ? { height: data.height } : {}),
          ...(data.width !== undefined ? { width: data.width } : {}),
          ...(data.originCountry !== undefined ? { originCountry: data.originCountry } : {}),
          ...(data.hsCode !== undefined ? { hsCode: data.hsCode } : {}),
          ...(data.midCode !== undefined ? { midCode: data.midCode } : {}),
          ...(data.requiresShipping !== undefined ? { requiresShipping: data.requiresShipping } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(inventoryItems.id, id), isNull(inventoryItems.deletedAt)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'inventory-item.updated', { id: row.id })
      return row
    })
  }

  async function removeItem(id: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(inventoryItems)
        .set({ deletedAt: new Date() })
        .where(and(eq(inventoryItems.id, id), isNull(inventoryItems.deletedAt)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'inventory-item.deleted', { id: row.id })
      return row
    })
  }

  // --- Variant <-> InventoryItem links (kits) ----------------------------------

  async function listVariantLinks(variantId: string): Promise<VariantInventoryItem[]> {
    return ctx.db.select().from(variantInventoryItems).where(eq(variantInventoryItems.variantId, variantId))
  }

  async function linkVariant(variantId: string, input: LinkVariantInventoryItemInput) {
    const data = linkVariantInventoryItemInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(variantInventoryItems)
        .values({ variantId, inventoryItemId: data.inventoryItemId, requiredQuantity: data.requiredQuantity ?? 1 })
        .onConflictDoUpdate({
          target: [variantInventoryItems.variantId, variantInventoryItems.inventoryItemId],
          set: { requiredQuantity: data.requiredQuantity ?? 1 },
        })
        .returning()
      await emitDomainEvent(tx, 'variant-inventory-item.linked', { variantId, inventoryItemId: row.inventoryItemId })
      return row
    })
  }

  async function unlinkVariant(variantId: string, inventoryItemId: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(variantInventoryItems)
        .where(and(eq(variantInventoryItems.variantId, variantId), eq(variantInventoryItems.inventoryItemId, inventoryItemId)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'variant-inventory-item.unlinked', { variantId, inventoryItemId })
      return row
    })
  }

  /**
   * Get-or-create: a managed variant (`manage_inventory=true`) with no
   * inventory item yet gets one auto-created and linked 1:1 (plan: "créations
   * auto d'inventory_item par variant géré"). A variant already linked to one
   * or more items (manual kit setup via `linkVariant`) is returned as-is —
   * auto-creation never overrides an explicit kit.
   *
   * Deliberately its OWN transaction, separate from the reservation that
   * triggers it: creating the bookkeeping row is idempotent metadata that
   * should persist even when the reservation right after it fails (e.g.
   * insufficient stock, no backorder) — a caller retrying the reservation
   * after adding stock must not have to recreate the link.
   */
  async function resolveVariantLinks(variant: ProductVariant): Promise<VariantInventoryItem[]> {
    const existing = await ctx.db.select().from(variantInventoryItems).where(eq(variantInventoryItems.variantId, variant.id))
    if (existing.length) return existing
    return ctx.db.transaction(async (tx) => {
      // Re-check inside the tx: closes the race between the read above and
      // this insert (two concurrent reserves for the same fresh variant).
      const race = await tx.select().from(variantInventoryItems).where(eq(variantInventoryItems.variantId, variant.id))
      if (race.length) return race
      const [item] = await tx.insert(inventoryItems).values({ id: pygId('iitem'), sku: variant.sku ?? null }).returning()
      await emitDomainEvent(tx, 'inventory-item.created', { id: item.id, variantId: variant.id, auto: true })
      const [link] = await tx
        .insert(variantInventoryItems)
        .values({ variantId: variant.id, inventoryItemId: item.id, requiredQuantity: 1 })
        .returning()
      return [link]
    })
  }

  // --- InventoryLevel (stock per location) --------------------------------------

  async function listLevels(inventoryItemId: string) {
    return ctx.db.select().from(inventoryLevels).where(eq(inventoryLevels.inventoryItemId, inventoryItemId))
  }

  async function getLevel(inventoryItemId: string, locationId: string) {
    const [row] = await ctx.db
      .select()
      .from(inventoryLevels)
      .where(and(eq(inventoryLevels.inventoryItemId, inventoryItemId), eq(inventoryLevels.locationId, locationId)))
      .limit(1)
    return row ?? null
  }

  async function upsertLevel(inventoryItemId: string, locationId: string, input: UpsertInventoryLevelInput) {
    const data = upsertInventoryLevelInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(inventoryLevels)
        .values({
          id: pygId('ilev'),
          inventoryItemId,
          locationId,
          stockedQuantity: data.stockedQuantity ?? 0,
          incomingQuantity: data.incomingQuantity ?? 0,
        })
        .onConflictDoUpdate({
          target: [inventoryLevels.inventoryItemId, inventoryLevels.locationId],
          set: {
            ...(data.stockedQuantity !== undefined ? { stockedQuantity: data.stockedQuantity } : {}),
            ...(data.incomingQuantity !== undefined ? { incomingQuantity: data.incomingQuantity } : {}),
            updatedAt: new Date(),
          },
        })
        .returning()
      await emitDomainEvent(tx, 'inventory-level.updated', { id: row.id, inventoryItemId, locationId })
      return row
    })
  }

  async function removeLevel(inventoryItemId: string, locationId: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(inventoryLevels)
        .where(and(eq(inventoryLevels.inventoryItemId, inventoryItemId), eq(inventoryLevels.locationId, locationId)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'inventory-level.deleted', { id: row.id, inventoryItemId, locationId })
      return row
    })
  }

  // --- StockLocation (+ inline address) -----------------------------------------

  async function getLocation(id: string) {
    const [row] = await ctx.db
      .select()
      .from(stockLocations)
      .where(and(eq(stockLocations.id, id), isNull(stockLocations.deletedAt)))
      .limit(1)
    return row ?? null
  }

  async function createLocation(input: CreateStockLocationInput) {
    const data = createStockLocationInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      let addressId: string | null = null
      if (data.address) {
        const [address] = await tx
          .insert(stockLocationAddresses)
          .values({
            id: pygId('laddr'),
            address1: data.address.address1,
            address2: data.address.address2 ?? null,
            city: data.address.city ?? null,
            countryCode: data.address.countryCode,
            province: data.address.province ?? null,
            postalCode: data.address.postalCode ?? null,
            phone: data.address.phone ?? null,
            company: data.address.company ?? null,
          })
          .returning()
        addressId = address.id
      }
      const [row] = await tx
        .insert(stockLocations)
        .values({ id: pygId('sloc'), name: data.name, addressId, metadata: data.metadata ?? null })
        .returning()
      await emitDomainEvent(tx, 'stock-location.created', { id: row.id })
      return row
    })
  }

  async function updateLocation(id: string, input: UpdateStockLocationInput) {
    const data = updateStockLocationInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(stockLocations)
        .where(and(eq(stockLocations.id, id), isNull(stockLocations.deletedAt)))
        .limit(1)
      if (!current) return null
      let addressId = current.addressId
      if (data.address !== undefined) {
        if (data.address === null) {
          addressId = null
        } else if (current.addressId) {
          await tx
            .update(stockLocationAddresses)
            .set({
              address1: data.address.address1,
              address2: data.address.address2 ?? null,
              city: data.address.city ?? null,
              countryCode: data.address.countryCode,
              province: data.address.province ?? null,
              postalCode: data.address.postalCode ?? null,
              phone: data.address.phone ?? null,
              company: data.address.company ?? null,
              updatedAt: new Date(),
            })
            .where(eq(stockLocationAddresses.id, current.addressId))
        } else {
          const [address] = await tx
            .insert(stockLocationAddresses)
            .values({
              id: pygId('laddr'),
              address1: data.address.address1,
              address2: data.address.address2 ?? null,
              city: data.address.city ?? null,
              countryCode: data.address.countryCode,
              province: data.address.province ?? null,
              postalCode: data.address.postalCode ?? null,
              phone: data.address.phone ?? null,
              company: data.address.company ?? null,
            })
            .returning()
          addressId = address.id
        }
      }
      const [row] = await tx
        .update(stockLocations)
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          addressId,
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(eq(stockLocations.id, id))
        .returning()
      await emitDomainEvent(tx, 'stock-location.updated', { id: row.id })
      return row
    })
  }

  async function removeLocation(id: string) {
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(stockLocations)
        .set({ deletedAt: new Date() })
        .where(and(eq(stockLocations.id, id), isNull(stockLocations.deletedAt)))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'stock-location.deleted', { id: row.id })
      return row
    })
  }

  // --- Reservations: raw admin CRUD (single inventory item, no kit expansion) --

  async function getReservation(id: string) {
    const [row] = await ctx.db.select().from(reservationItems).where(eq(reservationItems.id, id)).limit(1)
    return row ?? null
  }

  async function createReservation(input: CreateReservationInput) {
    const data = createReservationInput.parse(input)
    const item: ReserveItemInput = {
      inventoryItemId: data.inventoryItemId,
      locationId: data.locationId,
      quantity: data.quantity,
      lineItemId: data.lineItemId ?? null,
      allowBackorder: data.allowBackorder ?? false,
      externalId: data.externalId ?? null,
      description: data.description ?? null,
      metadata: data.metadata ?? null,
    }
    const [row] = await provider.reserve([item])
    return row
  }

  async function updateReservation(id: string, input: UpdateReservationInput) {
    const data = updateReservationInput.parse(input)
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(reservationItems)
        .set({
          ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
          updatedAt: new Date(),
        })
        .where(eq(reservationItems.id, id))
        .returning()
      if (!row) return null
      await emitDomainEvent(tx, 'reservation.updated', { id: row.id })
      return row
    })
  }

  async function removeReservation(id: string) {
    const [row] = await provider.release([id])
    return row ?? null
  }

  // --- Business cycle: cart reservation -> fulfillment decrement -> release ----

  async function availability(inventoryItemId: string, locationId?: string) {
    return provider.check(inventoryItemId, locationId)
  }

  /**
   * Cart/checkout entry point: expands each variant
   * into its inventory item(s) (kit-aware, `requiredQuantity * quantity`),
   * skips variants with `manage_inventory=false` entirely (no reservation
   * row), copies `allow_backorder` from the variant onto each reservation.
   * The reservation batch itself is one transaction via `provider.reserve`
   * (a single insufficient item rolls back every reservation the call
   * would have created); link auto-creation (`resolveVariantLinks`) commits
   * independently, see its own doc comment.
   */
  async function reserveVariants(input: ReserveVariantsInput) {
    const data = reserveVariantsInput.parse(input)
    const toReserve: ReserveItemInput[] = []
    for (const cartItem of data.items) {
      const [variant] = await ctx.db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, cartItem.variantId), isNull(productVariants.deletedAt)))
        .limit(1)
      if (!variant) throw new Error(`inventory: variant '${cartItem.variantId}' not found`)
      if (!variant.manageInventory) continue
      const links = await resolveVariantLinks(variant)
      for (const link of links) {
        toReserve.push({
          inventoryItemId: link.inventoryItemId,
          locationId: data.locationId,
          quantity: link.requiredQuantity * cartItem.quantity,
          lineItemId: cartItem.lineItemId ?? null,
          allowBackorder: variant.allowBackorder,
        })
      }
    }
    if (!toReserve.length) return []
    return provider.reserve(toReserve)
  }

  /** Pre-fulfillment cancellation: delete reservations outright, nothing physical to restore. */
  async function releaseReservations(reservationIds: string[]) {
    return provider.release(reservationIds)
  }

  async function releaseByLineItem(lineItemId: string) {
    const rows = await ctx.db.select({ id: reservationItems.id }).from(reservationItems).where(eq(reservationItems.lineItemId, lineItemId))
    if (!rows.length) return []
    return provider.release(rows.map((r) => r.id))
  }

  /**
   * Physical decrement at fulfillment (called by the create-fulfillment flow,
   * not exposed as an admin route here). Reduces the
   * reservation by `quantity` (deletes it if the remainder hits 0) AND
   * decrements `stockedQuantity` by the same amount, atomically — this is the
   * one place both mutations happen together, so it talks to the tables
   * directly (in one `tx`) rather than composing two separate
   * `InventoryProvider` calls (each its own transaction).
   */
  async function fulfill(reservationId: string, quantity: number) {
    return ctx.db.transaction(async (tx) => {
      const [reservation] = await tx.select().from(reservationItems).where(eq(reservationItems.id, reservationId)).limit(1)
      if (!reservation) throw new Error(`inventory: reservation '${reservationId}' not found`)
      if (quantity > reservation.quantity) {
        throw new Error('inventory: cannot fulfill more than the reserved quantity')
      }
      const [level] = await tx
        .select()
        .from(inventoryLevels)
        .where(and(eq(inventoryLevels.inventoryItemId, reservation.inventoryItemId), eq(inventoryLevels.locationId, reservation.locationId)))
        .limit(1)
      if (!level) throw new Error('inventory: no stock level for this reservation location')
      const nextStocked = level.stockedQuantity - quantity
      if (nextStocked < 0) throw new Error('inventory: fulfillment would drive stocked quantity negative')
      await tx.update(inventoryLevels).set({ stockedQuantity: nextStocked, updatedAt: new Date() }).where(eq(inventoryLevels.id, level.id))
      await emitDomainEvent(tx, 'inventory-level.updated', {
        id: level.id,
        inventoryItemId: reservation.inventoryItemId,
        locationId: reservation.locationId,
        delta: -quantity,
      })

      const remainder = reservation.quantity - quantity
      if (remainder === 0) {
        await tx.delete(reservationItems).where(eq(reservationItems.id, reservationId))
        await emitDomainEvent(tx, 'reservation.deleted', { id: reservationId, inventoryItemId: reservation.inventoryItemId })
        return null
      }
      const [row] = await tx
        .update(reservationItems)
        .set({ quantity: remainder, updatedAt: new Date() })
        .where(eq(reservationItems.id, reservationId))
        .returning()
      await emitDomainEvent(tx, 'reservation.updated', { id: row.id, quantity: row.quantity })
      return row
    })
  }

  /**
   * Post-fulfillment cancellation (called once a shipped fulfillment gets
   * canceled): re-increments `stockedQuantity` by
   * the physically-shipped quantity, then recreates a reservation for it —
   * same "one `tx`, direct table access" reasoning as `fulfill`.
   */
  async function cancelFulfillment(input: {
    inventoryItemId: string
    locationId: string
    quantity: number
    lineItemId?: string | null
    allowBackorder?: boolean
  }) {
    return ctx.db.transaction(async (tx) => {
      const [level] = await tx
        .select()
        .from(inventoryLevels)
        .where(and(eq(inventoryLevels.inventoryItemId, input.inventoryItemId), eq(inventoryLevels.locationId, input.locationId)))
        .limit(1)
      if (!level) throw new Error('inventory: no stock level for this item at this location')
      const nextStocked = level.stockedQuantity + input.quantity
      await tx.update(inventoryLevels).set({ stockedQuantity: nextStocked, updatedAt: new Date() }).where(eq(inventoryLevels.id, level.id))
      await emitDomainEvent(tx, 'inventory-level.updated', {
        id: level.id,
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        delta: input.quantity,
      })
      const [row] = await tx
        .insert(reservationItems)
        .values({
          id: pygId('resitem'),
          inventoryItemId: input.inventoryItemId,
          locationId: input.locationId,
          quantity: input.quantity,
          lineItemId: input.lineItemId ?? null,
          allowBackorder: input.allowBackorder ?? false,
        })
        .returning()
      await emitDomainEvent(tx, 'reservation.created', { id: row.id, inventoryItemId: row.inventoryItemId, quantity: row.quantity })
      return row
    })
  }

  /**
   * Plain stock re-increment (a return receive restocks
   * resellable units): raises `stockedQuantity` by `quantity` at a location,
   * NO reservation created (returned goods are back on the shelf, available).
   * Distinct from `cancelFulfillment`, which also recreates a reservation.
   * Same "one tx, direct table access" pattern as `fulfill`.
   */
  async function incrementStock(input: { inventoryItemId: string; locationId: string; quantity: number }) {
    if (input.quantity <= 0) return null
    return ctx.db.transaction(async (tx) => {
      const [level] = await tx
        .select()
        .from(inventoryLevels)
        .where(and(eq(inventoryLevels.inventoryItemId, input.inventoryItemId), eq(inventoryLevels.locationId, input.locationId)))
        .limit(1)
      if (!level) throw new Error('inventory: no stock level for this item at this location')
      await tx.update(inventoryLevels).set({ stockedQuantity: level.stockedQuantity + input.quantity, updatedAt: new Date() }).where(eq(inventoryLevels.id, level.id))
      await emitDomainEvent(tx, 'inventory-level.updated', {
        id: level.id,
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        delta: input.quantity,
      })
      return level.id
    })
  }

  return {
    items: {
      async list({ limit = 20, offset = 0, q }: { limit?: number; offset?: number; q?: string } = {}): Promise<InventoryItem[]> {
        const where = q
          ? and(isNull(inventoryItems.deletedAt), ilike(inventoryItems.sku, `%${q}%`))
          : isNull(inventoryItems.deletedAt)
        return ctx.db
          .select()
          .from(inventoryItems)
          .where(where)
          .orderBy(desc(inventoryItems.createdAt), desc(inventoryItems.id))
          .limit(limit)
          .offset(offset)
      },
      get: getItem,
      create: createItem,
      update: updateItem,
      remove: removeItem,
      linkVariant,
      unlinkVariant,
      listVariantLinks,
    },
    levels: {
      list: listLevels,
      get: getLevel,
      upsert: upsertLevel,
      remove: removeLevel,
    },
    locations: {
      async list({ limit = 20, offset = 0, q }: { limit?: number; offset?: number; q?: string } = {}) {
        const where = q ? and(isNull(stockLocations.deletedAt), ilike(stockLocations.name, `%${q}%`)) : isNull(stockLocations.deletedAt)
        return ctx.db
          .select()
          .from(stockLocations)
          .where(where)
          .orderBy(asc(stockLocations.name))
          .limit(limit)
          .offset(offset)
      },
      get: getLocation,
      create: createLocation,
      update: updateLocation,
      remove: removeLocation,
    },
    reservations: {
      get: getReservation,
      create: createReservation,
      update: updateReservation,
      remove: removeReservation,
      async list({
        limit = 20,
        offset = 0,
        inventoryItemId,
        locationId,
        lineItemId,
      }: { limit?: number; offset?: number; inventoryItemId?: string; locationId?: string; lineItemId?: string } = {}) {
        const conditions = []
        if (inventoryItemId) conditions.push(eq(reservationItems.inventoryItemId, inventoryItemId))
        if (locationId) conditions.push(eq(reservationItems.locationId, locationId))
        if (lineItemId) conditions.push(eq(reservationItems.lineItemId, lineItemId))
        // orderId via the line item: a reservation
        // without its order is unreadable for the merchant.
        const query = ctx.db
          .select({ ...getTableColumns(reservationItems), orderId: orderLineItems.orderId })
          .from(reservationItems)
          .leftJoin(orderLineItems, eq(reservationItems.lineItemId, orderLineItems.id))
        return (conditions.length ? query.where(and(...conditions)) : query)
          .orderBy(desc(reservationItems.createdAt), desc(reservationItems.id))
          .limit(limit)
          .offset(offset)
      },
    },
    availability,
    reserveVariants,
    releaseReservations,
    releaseByLineItem,
    fulfill,
    cancelFulfillment,
    incrementStock,
  }
}

export type InventoryService = ReturnType<typeof createInventoryService>
