import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PygmalionDatabase } from '../db/types'
import { outbox } from '../schema/outbox'
import * as schema from '../schema'
import { createTestDb } from '../test-utils'
import { createProductsService } from '../services/products'
import { drainOutbox, emitDomainEvent } from './outbox'

let db: PygmalionDatabase

beforeEach(async () => {
  db = await createTestDb(schema)
})

describe('outbox', () => {
  it('drains a committed event to the handler exactly once', async () => {
    await emitDomainEvent(db, 'demo.happened', { n: 1 })

    const handler = vi.fn()
    const first = await drainOutbox(db, handler)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('demo.happened', { n: 1 }, expect.anything())
    expect(first.processed).toBe(1)

    // Already processed -> no re-delivery.
    const second = await drainOutbox(db, handler)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(second.processed).toBe(0)
  })

  it('does NOT deliver an event whose transaction rolled back', async () => {
    await expect(
      db.transaction(async (tx) => {
        await emitDomainEvent(tx, 'demo.rolledback', { n: 2 })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const handler = vi.fn()
    const res = await drainOutbox(db, handler)
    expect(handler).not.toHaveBeenCalled()
    expect(res.processed).toBe(0)
  })

  it('retries a failing handler after a backoff, then succeeds', async () => {
    await emitDomainEvent(db, 'demo.retry', { n: 3 })

    // Base the clock just after emit so the row (nextRetryAt = defaultNow) is due.
    const now = new Date(Date.now() + 1000)
    const failing = vi.fn().mockRejectedValue(new Error('nope'))
    const r1 = await drainOutbox(db, failing, { now, backoffMs: () => 5000 })
    expect(r1.failed).toBe(1)

    // Row is unprocessed, attempts bumped, not yet due for retry.
    const [row] = await db.select().from(outbox)
    expect(row.processedAt).toBeNull()
    expect(row.attempts).toBe(1)

    // Too early: skipped.
    const early = await drainOutbox(db, vi.fn(), { now: new Date(now.getTime() + 1000) })
    expect(early.processed).toBe(0)

    // After backoff a healthy handler delivers it.
    const ok = vi.fn()
    const r2 = await drainOutbox(db, ok, { now: new Date(now.getTime() + 6000) })
    expect(ok).toHaveBeenCalledWith('demo.retry', { n: 3 }, expect.anything())
    expect(r2.processed).toBe(1)
  })

  // The webhook fan-out and the notification queue write their rows from
  // inside the drain tx, so a consumer needs that handle, not the outer db.
  it('hands the drain transaction to the handler so a consumer can write atomically', async () => {
    await emitDomainEvent(db, 'demo.consumed', { n: 4 })

    await drainOutbox(db, async (event, _payload, tx) => {
      await emitDomainEvent(tx, `${event}.echo`, { from: event })
    })

    const [echo] = await db.select().from(outbox).where(eq(outbox.event, 'demo.consumed.echo'))
    expect(echo.payload).toEqual({ from: 'demo.consumed' })
  })

  it('products.create emits product.created, delivered after commit', async () => {
    const products = createProductsService({ db })
    const p = await products.create({ title: 'Emitting Mug' })

    const handler = vi.fn()
    await drainOutbox(db, handler)
    expect(handler).toHaveBeenCalledWith('product.created', { id: p.id }, expect.anything())
  })

  it('leaves no orphan outbox row when product.create fails after emit', async () => {
    const products = createProductsService({ db })
    await products.create({ title: 'Dupe', handle: 'dupe' })
    // Second create with the same handle violates the partial unique index ->
    // the whole transaction (product insert + outbox emit) rolls back.
    await expect(products.create({ title: 'Dupe2', handle: 'dupe' })).rejects.toThrow()

    const rows = await db.select().from(outbox).where(eq(outbox.event, 'product.created'))
    expect(rows.length).toBe(1)
  })
})
