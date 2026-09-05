<script setup lang="ts">
import type { ProductImage } from '@oumarbarry/pygmalion-core'

const props = defineProps<{ images: ProductImage[]; fallback: string | null; title: string }>()
const { t, tf } = useShopText()

const sources = computed(() =>
  props.images.length ? props.images.map((i) => i.url) : props.fallback ? [props.fallback] : [],
)
const active = ref(0)
// A variant change can shorten the list; never point past the end.
watch(sources, () => (active.value = 0))
</script>

<template>
  <div v-if="sources.length" class="flex flex-col gap-3 sm:flex-row-reverse sm:gap-4">
    <div class="shop-media aspect-4/5 flex-1 overflow-hidden rounded-2xl">
      <img
        :src="sources[active]"
        :alt="title"
        width="620"
        height="775"
        class="size-full object-cover"
        data-testid="gallery-main"
      >
    </div>

    <ul v-if="sources.length > 1" class="flex gap-3 sm:flex-col" :aria-label="t('productPhotos')">
      <li v-for="(src, i) in sources" :key="src">
        <button
          type="button"
          class="shop-media size-16 overflow-hidden rounded-lg ring-offset-2 ring-offset-default transition-shadow sm:size-20"
          :class="i === active ? 'ring-2 ring-primary' : 'ring-1 ring-default hover:ring-accented'"
          :aria-label="tf('productPhotoN', { n: i + 1, total: sources.length })"
          :aria-current="i === active"
          @click="active = i"
        >
          <img :src="src" alt="" width="80" height="80" class="size-full object-cover">
        </button>
      </li>
    </ul>
  </div>

  <div v-else class="shop-media flex aspect-4/5 items-center justify-center rounded-2xl">
    <UIcon name="i-lucide-image" class="size-10 text-dimmed" />
  </div>
</template>
