<script setup lang="ts">
import type { ProductCollection, Region } from '@oumarbarry/pygmalion-core'
import type { ShopLocale } from '../utils/shop-text'

/**
 * The shop's one bar: identity, where to browse, which currency and language, who you are,
 * what's in the basket. Presentational — every value is a prop, every action
 * an event, so the layout stays the only place that talks to the composables.
 */
const props = defineProps<{
  collections: ProductCollection[]
  regions: Region[]
  currentRegionId?: string
  itemCount: number
  customerName: string | null
  locale: ShopLocale
}>()

const emit = defineEmits<{ openCart: []; selectRegion: [id: string]; selectLocale: [locale: ShopLocale] }>()
const { t, tf, one } = useShopText()

const menuOpen = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => (menuOpen.value = false))

const regionOptions = computed(() =>
  props.regions.map((r) => ({ value: r.id, label: `${r.name} · ${r.currencyCode.toUpperCase()}` })),
)
const localeOptions = shopLocales.map((l) => ({ value: l, label: l.toUpperCase() }))
const accountLabel = computed(() => props.customerName ?? t('accountSignIn'))
</script>

<template>
  <header class="sticky top-0 border-b border-default bg-default/90 backdrop-blur" :style="{ zIndex: 'var(--z-sticky)' }">
    <div class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
      <UButton
        class="lg:hidden"
        color="neutral"
        variant="ghost"
        square
        :icon="menuOpen ? 'i-lucide-x' : 'i-lucide-menu'"
        :aria-expanded="menuOpen"
        aria-controls="shop-nav"
        :aria-label="t('navMenu')"
        @click="menuOpen = !menuOpen"
      />

      <NuxtLink to="/" class="shop-display text-xl text-highlighted">Maison&nbsp;Pygmalion</NuxtLink>

      <nav id="shop-nav" class="ml-6 hidden items-center gap-5 text-sm lg:flex" :aria-label="t('navShop')">
        <NuxtLink to="/products" class="text-toned transition-colors hover:text-highlighted">{{ t('navAllProducts') }}</NuxtLink>
        <NuxtLink
          v-for="c in collections"
          :key="c.id"
          :to="`/collections/${c.id}`"
          class="text-toned transition-colors hover:text-highlighted"
        >
          {{ c.title }}
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-1">
        <!-- `sm:inline-flex`, not `sm:block`: the class lands on the trigger,
             whose own base is `inline-flex`, and tailwind-merge keeps the LAST
             display utility — `sm:block` silently killed the flex layout and
             dropped the chevron out of the control. -->
        <USelect
          v-if="regions.length > 1"
          :model-value="currentRegionId"
          :items="regionOptions"
          size="sm"
          class="hidden w-52 sm:inline-flex"
          :aria-label="t('navRegionLabel')"
          @update:model-value="emit('selectRegion', String($event))"
        />
        <USelect
          :model-value="locale"
          :items="localeOptions"
          size="sm"
          class="hidden w-20 sm:inline-flex"
          :aria-label="t('languageLabel')"
          data-testid="locale-select"
          @update:model-value="emit('selectLocale', shopLocaleFrom(String($event)))"
        />
        <UButton
          to="/account"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-user"
          :label="accountLabel"
          class="hidden sm:inline-flex"
        />
        <UButton
          to="/account"
          color="neutral"
          variant="ghost"
          square
          icon="i-lucide-user"
          :aria-label="t('accountTitle')"
          class="sm:hidden"
        />
        <UButton
          color="neutral"
          variant="ghost"
          square
          icon="i-lucide-shopping-bag"
          :aria-label="tf(one(itemCount) ? 'navCartOne' : 'navCartOther', { count: itemCount })"
          data-testid="open-cart"
          class="relative"
          @click="emit('openCart')"
        >
          <span
            v-if="itemCount"
            class="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-bold leading-5 text-inverted"
            data-testid="cart-count"
          >{{ itemCount }}</span>
        </UButton>
      </div>
    </div>

    <!-- Mobile nav: v-if, not v-show — it must not be tabbable while closed. -->
    <nav v-if="menuOpen" class="border-t border-default px-4 py-2 lg:hidden" :aria-label="t('navShopMobile')">
      <NuxtLink to="/products" class="block py-3 text-base text-toned">{{ t('navAllProducts') }}</NuxtLink>
      <NuxtLink v-for="c in collections" :key="c.id" :to="`/collections/${c.id}`" class="block py-3 text-base text-toned">
        {{ c.title }}
      </NuxtLink>
      <USelect
        v-if="regions.length > 1"
        :model-value="currentRegionId"
        :items="regionOptions"
        class="my-2 w-full sm:hidden"
        :aria-label="t('navRegionLabel')"
        @update:model-value="emit('selectRegion', String($event))"
      />
      <USelect
        :model-value="locale"
        :items="localeOptions"
        class="my-2 w-full sm:hidden"
        :aria-label="t('languageLabel')"
        @update:model-value="emit('selectLocale', shopLocaleFrom(String($event)))"
      />
    </nav>
  </header>
</template>
