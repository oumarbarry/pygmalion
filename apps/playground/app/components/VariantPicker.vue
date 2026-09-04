<script setup lang="ts">
import type { ProductOption, ProductOptionValue } from '@oumarbarry/pygmalion-core'
import type { StoreVariant } from '@oumarbarry/pygmalion-sdk'

/**
 * One row of choices per product option ("Couleur", "Format"), driven by the
 * options the API returns — never by parsing variant titles.
 *
 * `v-model` is the resolved VARIANT (or null while the choice is incomplete),
 * because that's what the cart needs; the option values are this component's
 * own business.
 */
const props = defineProps<{
  options: (ProductOption & { values: ProductOptionValue[] })[]
  variants: StoreVariant[]
}>()

const selected = defineModel<StoreVariant | null>({ required: true })

/** optionId -> chosen valueId. Pre-filled from the first purchasable variant. */
const chosen = ref<Record<string, string>>({})

const valueIsAvailable = (optionId: string, valueId: string) =>
  props.variants.some((v) => {
    const others = Object.entries(chosen.value).filter(([id]) => id !== optionId)
    return v.optionValueIds.includes(valueId) && others.every(([, id]) => v.optionValueIds.includes(id))
  })

function choose(optionId: string, valueId: string) {
  chosen.value = { ...chosen.value, [optionId]: valueId }
}

watchEffect(() => {
  selected.value = variantForOptions(props.variants, chosen.value, props.options.length)
})

// Default selection: the first variant, so the page opens on a real price
// instead of a disabled button.
watchEffect(() => {
  if (Object.keys(chosen.value).length || !props.variants.length) return
  const first = props.variants[0]
  const preset: Record<string, string> = {}
  for (const option of props.options) {
    const match = option.values.find((v) => first.optionValueIds.includes(v.id))
    if (match) preset[option.id] = match.id
  }
  chosen.value = preset
})
</script>

<template>
  <!-- A single-variant product has nothing to pick: render no controls at all. -->
  <div v-if="options.length" class="space-y-5">
    <fieldset v-for="option in options" :key="option.id">
      <legend class="text-sm font-semibold text-highlighted">{{ option.title }}</legend>
      <div class="mt-2.5 flex flex-wrap gap-2">
        <button
          v-for="value in option.values"
          :key="value.id"
          type="button"
          class="min-h-11 rounded-lg border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          :class="
            chosen[option.id] === value.id
              ? 'border-inverted bg-inverted text-inverted'
              : 'border-default text-toned hover:border-accented hover:bg-muted'
          "
          :aria-pressed="chosen[option.id] === value.id"
          :disabled="!valueIsAvailable(option.id, value.id)"
          :data-option-value="value.id"
          @click="choose(option.id, value.id)"
        >
          {{ value.value }}
        </button>
      </div>
    </fieldset>
  </div>
</template>
