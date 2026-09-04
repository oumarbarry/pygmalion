import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createPygmalionClient } from './index'

/**
 * Contract test: every route the SDK can emit must be a route the server
 * actually declares, and the whole served surface must be reachable.
 *
 * The single source of truth for the served surface is the `addServerHandler`
 * calls of `packages/nuxt/src/module.ts` (Nitro does NOT auto-discover a
 * module's routes).
 * Reading it from here is deliberate: a hand-copied list in this file would
 * drift the day a route moves, which is exactly the bug this test exists for.
 */
const moduleSource = readFileSync(fileURLToPath(new URL('../../nuxt/src/module.ts', import.meta.url)), 'utf8')

function declaredRoutes(): Set<string> {
  const routes = new Set<string>()
  for (const [, block] of moduleSource.matchAll(/addServerHandler\(\{([\s\S]*?)\}\)/g)) {
    const route = /route:\s*['`]([^'`]+)/.exec(block)?.[1]
    if (!route) continue // middleware entries carry no route
    const method = (/method:\s*'([^']+)/.exec(block)?.[1] ?? 'get').toUpperCase()
    // `:id`, `:variantId`, `:addressId`… all normalize to `:param`: the SDK's
    // recorded calls carry placeholder values, not the server's param names.
    routes.add(`${method} ${route.replace(/:[^/]+/g, ':param')}`)
  }
  return routes
}

/** `/api/auth/**` + `/api/admin/auth/**` are declared without a method: any verb, any sub-path. */
const wildcards = ['/api/auth/', '/api/admin/auth/']

// Placeholders fed to every method; path segments equal to one of them are
// normalized back to `:param` before comparing with the declared routes.
const ARGS = ['idA', 'idB', 'idC']

type Recorded = { group: string; name: string; call: string }

function recordEveryCall(): Recorded[] {
  const seen: string[] = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = url.split('?')[0]
    const normalized = path
      .split('/')
      .map((seg) => (ARGS.includes(seg) ? ':param' : seg))
      .join('/')
    seen.push(`${init?.method ?? 'GET'} ${normalized}`)
    return Response.json({})
  }
  const client = createPygmalionClient({ fetch }) as unknown as Record<string, unknown>

  const recorded: Recorded[] = []
  const walk = (node: Record<string, unknown>, surface: string, group: string, name: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'function') {
        const before = seen.length
        // Every method takes ids first, then an optional body/query — feeding
        // the same placeholders to all of them exercises the path builder.
        void (value as (...a: unknown[]) => Promise<unknown>)(...ARGS)
        for (const call of seen.slice(before)) {
          recorded.push({ group: group || key, name: `${surface}.${name ? `${name}.` : ''}${key}`, call })
        }
      } else if (value && typeof value === 'object') {
        walk(value as Record<string, unknown>, surface, group || key, name ? `${name}.${key}` : key)
      }
    }
  }
  for (const surface of ['store', 'admin']) {
    walk(client[surface] as Record<string, unknown>, surface, '', '')
  }
  return recorded
}

const recorded = recordEveryCall()
const declared = declaredRoutes()
const isWildcard = (call: string) => wildcards.some((w) => call.split(' ')[1].startsWith(w))

// Routes served but deliberately NOT wrapped by a typed method.
const uncovered = [
  // Multipart upload + raw file download: the SDK speaks JSON only. Callers
  // post a FormData with plain fetch, and `<img src>` reads the file back.
  'POST /api/admin/uploads',
  'GET /api/admin/uploads/:param',
  'DELETE /api/admin/uploads/:param',
  // Zero-staff bootstrap: run once, by hand, before any api key exists.
  'POST /api/admin/auth-bootstrap',
]

describe('SDK ↔ served surface', () => {
  it('emits only routes the server declares', () => {
    const unknownRoutes = recorded.filter((r) => !declared.has(r.call) && !isWildcard(r.call))

    expect(unknownRoutes.map((r) => `${r.name} -> ${r.call}`)).toEqual([])
  })

  it('covers every store route', () => {
    const emitted = new Set(recorded.map((r) => r.call))
    const missing = [...declared].filter((r) => r.includes('/api/store/') && !emitted.has(r))

    expect(missing).toEqual([])
    expect([...declared].filter((r) => r.includes('/api/store/')).length).toBe(44)
  })

  it('covers every admin route but the documented exceptions', () => {
    const emitted = new Set(recorded.map((r) => r.call))
    const adminRoutes = [...declared].filter((r) => r.includes('/api/admin/') && !isWildcard(r))
    const missing = adminRoutes.filter((r) => !emitted.has(r) && !uncovered.includes(r))

    expect(missing).toEqual([])
    expect(adminRoutes.length).toBe(238)
  })

  it('keeps each resource group on its own path prefix (no copy/paste across resources)', () => {
    // group name -> the only prefix its methods may hit.
    const prefixes: Record<string, string> = {
      'store.products': '/api/store/products',
      'store.variants': '/api/store/product-variants',
      'store.collections': '/api/store/collections',
      'store.categories': '/api/store/product-categories',
      'store.tags': '/api/store/product-tags',
      'store.regions': '/api/store/regions',
      'store.currencies': '/api/store/currencies',
      'store.carts': '/api/store/carts',
      'store.shippingOptions': '/api/store/shipping-options',
      'store.paymentProviders': '/api/store/payment-providers',
      'store.paymentCollections': '/api/store/payment-collections',
      'store.customers': '/api/store/customers/me',
      'store.orders': '/api/store/orders',
      'store.returnReasons': '/api/store/return-reasons',
      'store.returns': '/api/store/returns',
      'store.auth': '/api/auth/',
      'admin.products': '/api/admin/products',
      'admin.collections': '/api/admin/collections',
      'admin.categories': '/api/admin/product-categories',
      'admin.tags': '/api/admin/product-tags',
      'admin.priceLists': '/api/admin/price-lists',
      'admin.prices': '/api/admin/prices',
      'admin.pricePreferences': '/api/admin/price-preferences',
      'admin.orders': '/api/admin/orders',
      'admin.draftOrders': '/api/admin/draft-orders',
      'admin.returns': '/api/admin/returns',
      'admin.returnReasons': '/api/admin/return-reasons',
      'admin.exchanges': '/api/admin/exchanges',
      'admin.claims': '/api/admin/claims',
      'admin.payments': '/api/admin/payments',
      'admin.paymentCollections': '/api/admin/payment-collections',
      'admin.refundReasons': '/api/admin/refund-reasons',
      'admin.customers': '/api/admin/customers',
      'admin.customerGroups': '/api/admin/customer-groups',
      'admin.productVariants': '/api/admin/product-variants',
      'admin.promotions': '/api/admin/promotions',
      'admin.campaigns': '/api/admin/campaigns',
      'admin.shippingOptions': '/api/admin/shipping-options',
      'admin.shippingProfiles': '/api/admin/shipping-profiles',
      'admin.fulfillmentSets': '/api/admin/fulfillment-sets',
      'admin.fulfillmentProviders': '/api/admin/fulfillment-providers',
      'admin.inventoryItems': '/api/admin/inventory-items',
      'admin.stockLocations': '/api/admin/stock-locations',
      'admin.reservations': '/api/admin/reservations',
      'admin.taxRegions': '/api/admin/tax-regions',
      'admin.taxRates': '/api/admin/tax-rates',
      'admin.taxProviders': '/api/admin/tax-providers',
      'admin.regions': '/api/admin/regions',
      'admin.currencies': '/api/admin/currencies',
      'admin.stores': '/api/admin/store',
      'admin.salesChannels': '/api/admin/sales-channels',
      'admin.apiKeys': '/api/admin/api-keys',
      'admin.invites': '/api/admin/invites',
      'admin.users': '/api/admin/users',
      'admin.webhookEndpoints': '/api/admin/webhook-endpoints',
      'admin.webhookDeliveries': '/api/admin/webhook-deliveries',
      'admin.notifications': '/api/admin/notifications',
      'admin.auth': '/api/admin/auth/',
    }

    const strays = recorded
      .map((r) => ({ ...r, key: `${r.name.split('.')[0]}.${r.group}` }))
      .filter((r) => !r.call.split(' ')[1].startsWith(prefixes[r.key] ?? '\0'))
      .map((r) => `${r.name} -> ${r.call}`)

    expect(strays).toEqual([])
  })
})

describe('zero runtime dependencies', () => {
  it('imports @oumarbarry/pygmalion-core as types only', () => {
    const sources = ['client.ts', 'store.ts', 'admin.ts', 'types.ts', 'index.ts'].map((f) =>
      readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8'),
    )
    const runtimeImports = sources.flatMap((src) =>
      [...src.matchAll(/^import\s+(?!type)([\s\S]*?)from\s+'([^']+)'/gm)].map((m) => m[2]),
    )

    expect(runtimeImports.filter((spec) => !spec.startsWith('./'))).toEqual([])
  })
})
