<script setup lang="ts">
/**
 * The storefront shell. A composition surface: it wires `useShop` to the three
 * chrome components and owns nothing else.
 */
const shop = useShop()
const drawer = useTemplateRef<{ setCodeError: (m: string) => void }>('drawer')
const busy = ref(false)

// One SSR pass for the whole shell (nav, region, cart badge, account name).
await useAsyncData('shop:shell', () => shop.loadShell().then(() => true))

/** Every drawer mutation goes through here so one failure can't wedge `busy`. */
async function run(action: () => Promise<unknown>, onError?: (message: string) => void) {
  busy.value = true
  try {
    await action()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (onError) onError(message)
    else console.error(message)
  } finally {
    busy.value = false
  }
}

const setQuantity = (lineId: string, quantity: number) => run(() => shop.updateItem(lineId, quantity))
const remove = (lineId: string) => run(() => shop.removeItem(lineId))
const applyCode = (code: string) => run(() => shop.applyPromoCode(code), (m) => drawer.value?.setCodeError(m))
const removeCode = (code: string) => run(() => shop.removePromoCode(code))

async function changeRegion(id: string) {
  shop.selectRegion(id)
  // Prices are resolved server-side per region: re-run every page fetch.
  await refreshNuxtData()
}
</script>

<template>
  <!-- `shop` carries the storefront's own tokens (assets/css/storefront.css):
       everything under it is skinned by the shop, /admin keeps the admin's. -->
  <div class="shop flex min-h-dvh flex-col bg-default text-default">
    <a
      href="#contenu"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-inverted focus:px-4 focus:py-2 focus:text-inverted"
    >Aller au contenu</a>

    <ShopHeader
      :collections="shop.collections.value"
      :regions="shop.regions.value"
      :current-region-id="shop.regionId.value"
      :item-count="shop.itemCount.value"
      :customer-name="shop.customer.value?.name ?? null"
      @open-cart="shop.openDrawer()"
      @select-region="changeRegion"
    />

    <main id="contenu" class="flex-1">
      <slot />
    </main>

    <ShopFooter :collections="shop.collections.value" :categories="shop.categories.value" />

    <CartDrawer
      ref="drawer"
      :open="shop.drawerOpen.value"
      :cart="shop.cart.value"
      :promo-codes="shop.promoCodes.value"
      :busy="busy"
      @close="shop.closeDrawer()"
      @update-quantity="setQuantity"
      @remove="remove"
      @apply-code="applyCode"
      @remove-code="removeCode"
    />
  </div>
</template>
