import { and, asc, eq, isNull, lte } from 'drizzle-orm'
import { pygId } from '../id'
import type { PygmalionDatabase } from '../db/types'
import { outbox } from '../schema/outbox'

/**
 * Insert a domain event into the outbox. Pass a transaction handle to make the
 * event atomic with the state change it describes: it persists iff that
 * transaction commits, so a handler never sees an event whose work was rolled
 * back.
 */
export async function emitDomainEvent(
  db: PygmalionDatabase,
  event: string,
  payload: unknown,
): Promise<void> {
  await db.insert(outbox).values({ id: pygId('evt'), event, payload })
}

/**
 * `tx` is the drain transaction handle: a consumer that must persist something
 * derived from the event (the webhook fan-out, the notification queue)
 * writes through it, so its rows land iff the event is really marked processed.
 * It is for DB work ONLY: never make an external call from inside the transaction.
 */
export type EventDispatch = (
  event: string,
  payload: unknown,
  tx: PygmalionDatabase,
) => void | Promise<void>

export interface DrainOptions {
  /** Max rows per drain pass. */
  limit?: number
  /** Injectable clock (tests). Defaults to `new Date()`. */
  now?: Date
  /** Backoff before the next retry, ms, given the new attempt count. */
  backoffMs?: (attempts: number) => number
}

export interface DrainResult {
  processed: number
  failed: number
}

// Exponential backoff capped at 1h: 2s, 4s, 8s, ... (dev drain runs ~5s).
const defaultBackoff = (attempts: number) => Math.min(2 ** attempts * 1000, 3_600_000)

/**
 * Drain due outbox rows once and dispatch each to `dispatch`. Pure — no Nitro
 * dependency, so it is unit-testable. Locks rows FOR UPDATE SKIP LOCKED so
 * concurrent drainers never double-deliver. A handler that throws leaves the
 * row unprocessed with `attempts` bumped and `nextRetryAt` pushed out.
 */
export async function drainOutbox(
  db: PygmalionDatabase,
  dispatch: EventDispatch,
  opts: DrainOptions = {},
): Promise<DrainResult> {
  const now = opts.now ?? new Date()
  const limit = opts.limit ?? 100
  const backoffMs = opts.backoffMs ?? defaultBackoff

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outbox)
      .where(and(isNull(outbox.processedAt), lte(outbox.nextRetryAt, now)))
      .orderBy(asc(outbox.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true })

    let processed = 0
    let failed = 0
    for (const row of rows) {
      try {
        await dispatch(row.event, row.payload, tx as PygmalionDatabase)
        await tx.update(outbox).set({ processedAt: now }).where(eq(outbox.id, row.id))
        processed++
      } catch {
        const attempts = row.attempts + 1
        await tx
          .update(outbox)
          .set({ attempts, nextRetryAt: new Date(now.getTime() + backoffMs(attempts)) })
          .where(eq(outbox.id, row.id))
        failed++
      }
    }
    return { processed, failed }
  })
}
