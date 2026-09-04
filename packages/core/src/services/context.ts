import type { PygmalionDatabase } from '../db/types'

/**
 * Minimal context a core service needs. The full runtime `PygmalionContext`
 * (db, config, providers, events, services) assembled by `@oumarbarry/pygmalion`
 * structurally satisfies this — core stays free of any nuxt/h3 import.
 */
export interface ServiceContext {
  db: PygmalionDatabase
}
