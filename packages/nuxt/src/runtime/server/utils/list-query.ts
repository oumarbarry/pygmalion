import { getQuery, type H3Event } from 'h3'

/**
 * Uniform list conventions for every `GET` collection endpoint:
 * `q` (free-text search), `limit`, `offset`, `order`. Garbage in a query string
 * is IGNORED (a bad `?limit=abc` falls back to the default) rather than a 422 —
 * pagination is not a trust boundary, the service caps what it reads.
 *
 * `order` is passed through as the raw string (`-created_at`); each service
 * decides which columns it accepts — an unknown one must never reach SQL.
 *
 * ponytail: deliberately no `count` here. Only `GET /admin/tax-regions` returns one today;
 * making it uniform means an extra SQL aggregate in ~20 services with no
 * consumer yet.
 */
export interface ListQueryOptions {
  defaultLimit?: number
  maxLimit?: number
}

export interface ListQuery {
  limit: number
  offset: number
  q: string | undefined
  order: string | undefined
}

export function parseListQuery(
  query: Record<string, unknown>,
  { defaultLimit = 20, maxLimit = 100 }: ListQueryOptions = {},
): ListQuery {
  const int = (v: unknown, fallback: number) => {
    const n = Number.parseInt(String(v ?? ''), 10)
    return Number.isFinite(n) ? n : fallback
  }
  const str = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined)
  return {
    limit: Math.min(Math.max(int(query.limit, defaultLimit), 1), maxLimit),
    offset: Math.max(int(query.offset, 0), 0),
    q: str(query.q),
    order: str(query.order),
  }
}

export function listQuery(event: H3Event, opts: ListQueryOptions = {}): ListQuery {
  return parseListQuery(getQuery(event) as Record<string, unknown>, opts)
}
