import type { OrderClaim, OrderDetail, OrderExchange, OrderReturn } from '../utils/order-status'

/**
 * Everything the order screens need about ONE order, in one refreshable read:
 * the order itself + its returns (with their lines), exchanges and claims.
 *
 * Why `$adminFetch` inside `useAsyncData` rather than `useAdminFetch`: this is
 * a composed read (1 order + 3 lists + 1 call per return to get its lines —
 * `GET /api/admin/returns` returns rows without items), and `useAdminFetch`
 * models exactly one URL. `$adminFetch` is the very instance it wraps, so the
 * same contract still holds: 401 → sign-in, any other error → one toast.
 *
 * N+1 on return lines. N is the number of returns of a single order
 * (0-3 in practice). Upgrade path: items embedded in `GET /admin/returns`.
 */
export function useOrderDetail(orderId: string) {
  const fetcher = useAdminApi()

  const { data, status, error, refresh } = useAsyncData(`pyg-order-${orderId}`, async () => {
    const { order } = await fetcher<{ order: OrderDetail }>(`/api/admin/orders/${orderId}`)
    const [returnRows, exchangeRes, claimRes] = await Promise.all([
      fetcher<{ returns: OrderReturn[] }>('/api/admin/returns', { query: { orderId } }),
      fetcher<{ exchanges: OrderExchange[] }>('/api/admin/exchanges', { query: { orderId } }),
      fetcher<{ claims: OrderClaim[] }>('/api/admin/claims', { query: { orderId } }),
    ])
    const returns = await Promise.all(
      returnRows.returns.map((r) => fetcher<{ return: OrderReturn }>(`/api/admin/returns/${r.id}`).then((res) => res.return)),
    )
    return { order, returns, exchanges: exchangeRes.exchanges, claims: claimRes.claims }
  })

  const order = computed(() => data.value?.order ?? null)
  const returns = computed(() => data.value?.returns ?? [])
  const exchanges = computed(() => data.value?.exchanges ?? [])
  const claims = computed(() => data.value?.claims ?? [])
  const loading = computed(() => status.value === 'pending')

  /** Run a mutation, then reload the order. `busy` drives every button's spinner. */
  const busy = ref(false)
  async function mutate(fn: () => Promise<unknown>) {
    if (busy.value) return false
    busy.value = true
    try {
      await fn()
      await refresh()
      return true
    } catch {
      // $adminFetch already showed the reason (statusMessage) in a toast.
      return false
    } finally {
      busy.value = false
    }
  }

  return { order, returns, exchanges, claims, loading, error, refresh, busy, mutate, fetcher }
}
