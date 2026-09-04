<script setup lang="ts">
/**
 * Order confirmation, and the page a guest lands on from their e-mail.
 *
 * Ownership is the server's call: a signed-in customer is recognised by its
 * session, a guest by `?email=` matching the address that placed the order.
 * The email arrives in the query, so a shared link keeps working after the
 * cart cookie is gone.
 */
const client = usePygmalion()
const route = useRoute()
const { isAuthenticated } = useShop()

const id = computed(() => String(route.params.id))
const email = computed(() => (route.query.email ? String(route.query.email) : undefined))
// Straight after checkout the order is in shared state — reuse its email so the
// confirmation renders without asking for it again.
const { order: placed } = useCheckout()
const lookupEmail = computed(() => email.value ?? placed.value?.email ?? undefined)

const { data, pending, error, refresh } = await useAsyncData(
  () => `order:${id.value}`,
  () => client.store.orders.get(id.value, lookupEmail.value ? { email: lookupEmail.value } : undefined),
  { watch: [id] },
)

const justPlaced = computed(() => placed.value?.id === id.value)
useSeoMeta({ title: () => (data.value ? `Commande n° ${data.value.order.displayId}` : 'Commande') })
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
    <div v-if="justPlaced" class="mb-10 rounded-xl border border-primary/30 bg-primary/5 px-6 py-8 text-center">
      <UIcon name="i-lucide-circle-check" class="mx-auto size-9 text-primary" />
      <h1 class="shop-display mt-4 text-2xl text-highlighted sm:text-3xl">Merci, c'est commandé.</h1>
      <p class="mt-2 text-muted">
        Un e-mail de confirmation part vers {{ data?.order.email }}. Nous préparons votre colis.
      </p>
    </div>
    <h1 v-else class="shop-display mb-8 text-3xl text-highlighted sm:text-4xl">Votre commande</h1>

    <AsyncState
      :pending="pending"
      :error="isNotFound(error) ? null : error"
      :empty="!data"
      empty-title="Commande introuvable"
      empty-message="Vérifiez le numéro et l'adresse e-mail utilisée lors de l'achat."
      @retry="refresh()"
    >
      <template #empty-action>
        <UButton to="/order" class="mt-5" color="neutral" variant="outline" label="Retrouver ma commande" />
      </template>

      <OrderView v-if="data" :order="data.order" :guest-email="lookupEmail" show-return @returned="refresh()" />
    </AsyncState>

    <div class="mt-10 flex flex-wrap gap-3 border-t border-default pt-6">
      <UButton to="/products" color="neutral" variant="outline" label="Continuer mes achats" />
      <UButton v-if="isAuthenticated" to="/account/orders" color="neutral" variant="ghost" label="Toutes mes commandes" />
    </div>
  </div>
</template>
