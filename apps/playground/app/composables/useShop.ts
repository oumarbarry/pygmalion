import type { ProductCategory, ProductCollection } from '@oumarbarry/pygmalion-core'

/**
 * The shop's ambient context: the nav's collections/categories, the browsing
 * region, the cart, the signed-in customer, and whether the drawer is open.
 *
 * One place so the layout stays a composition surface and no page re-fetches
 * the same reference data. Everything below is `useState`, so SSR fills it once
 * and the browser reuses it.
 */
export function useShop() {
  const client = usePygmalion()
  const { region, regions, regionId, currencyCode, load: loadRegions, select: selectRegion } = useRegion()
  const cart = useCart()
  const customer = useCustomer()

  const collections = useState<ProductCollection[]>('shop:collections', () => [])
  const categories = useState<ProductCategory[]>('shop:categories', () => [])
  const drawerOpen = useState('shop:drawer', () => false)

  /**
   * Everything the shell needs, in one SSR pass. The cart is refreshed from the
   * cookies alone (it may not exist yet — that's the normal first-visit case)
   * and a failed customer lookup is a signed-out visitor, not an error.
   */
  async function loadShell(): Promise<void> {
    const [cols, cats] = await Promise.all([
      client.store.collections.list({ limit: 10 }),
      client.store.categories.list({ limit: 20 }),
      loadRegions(),
      cart.refresh(),
      customer.refresh(),
    ])
    collections.value = cols.collections
    categories.value = cats.categories
  }

  return {
    ...cart,
    customer: customer.customer,
    isAuthenticated: customer.isAuthenticated,
    collections,
    categories,
    region,
    regions,
    regionId,
    currencyCode,
    drawerOpen,
    loadShell,
    selectRegion,
    openDrawer: () => (drawerOpen.value = true),
    closeDrawer: () => (drawerOpen.value = false),
  }
}
