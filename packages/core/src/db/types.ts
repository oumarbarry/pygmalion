import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

/**
 * Unified DB handle. Both `drizzle-orm/node-postgres` (prod) and
 * `drizzle-orm/pglite` (dev) return a `PgAsyncDatabase`; a transaction handle is
 * also a `PgAsyncDatabase` subclass, so this one type serves db and tx alike.
 * Generic over the composed schema, which is only known at runtime: modules
 * extend it through the `pygmalion:schema` hook.
 */
export type PygmalionDatabase = PgAsyncDatabase<PgQueryResultHKT>
