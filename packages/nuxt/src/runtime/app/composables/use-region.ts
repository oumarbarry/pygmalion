import type { Region } from '@oumarbarry/pygmalion-core'
import { computed } from 'vue'
import { useCookie, useState } from 'nuxt/app'
import { usePygmalion } from './use-pygmalion'

/** Readable cookie: which region the visitor is browsing in. */
const REGION_COOKIE = 'pygmalion_region'

/**
 * The browsing region — the price context every catalogue read needs.
 *
 * `GET /api/store/products*` prices in the currency of a `region_id`; without
 * one a storefront can only show titles. Keeping the choice here (shared state
 * + a cookie) means SSR renders the same prices the browser will, and a reload
 * or a second tab lands on the same currency.
 *
 * Deliberately, a cart already opened in one region keeps ITS currency until it
 * is completed: the cart API has no region change (`UpdateCartInput` is email +
 * addresses). Displaying `cart.currencyCode` everywhere in the cart/checkout
 * keeps that honest. Upgrade path when it matters: a `regionId` on
 * `POST /api/store/carts/:id` that re-prices every line.
 */
export function useRegion() {
  const client = usePygmalion()
  const regions = useState<Region[]>('pygmalion:regions', () => [])
  const selectedId = useCookie<string | null>(REGION_COOKIE, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  /** The chosen region, or the store's first one — never null once `load()` ran. */
  const region = computed<Region | null>(
    () => regions.value.find((r) => r.id === selectedId.value) ?? regions.value[0] ?? null,
  )

  /** Fetches the region list once. A stale cookie (region deleted) falls back to the first. */
  async function load(): Promise<Region | null> {
    if (!regions.value.length) regions.value = (await client.store.regions.list()).regions
    if (selectedId.value && !regions.value.some((r) => r.id === selectedId.value)) selectedId.value = null
    return region.value
  }

  function select(id: string): void {
    selectedId.value = id
  }

  return {
    regions,
    region,
    regionId: computed(() => region.value?.id),
    currencyCode: computed(() => region.value?.currencyCode),
    load,
    select,
  }
}
