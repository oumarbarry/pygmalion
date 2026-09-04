<script setup lang="ts">
/**
 * Country multi-pick, used by both places that scope something to countries:
 * a selling area (`regions.countries`) and a delivered area (`geoZones`).
 *
 * Checkboxes rather than a multi-select menu: `checkbox` is themed in
 * `app.config.ts` while `selectMenu` is not, each row is a ≥44px tap
 * target, and a merchant sees every country at once instead
 * of hunting inside a dropdown.
 */
const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const { t } = useVocabulary()

function toggle(iso2: string, next: boolean) {
  const set = new Set(props.modelValue)
  if (next) set.add(iso2)
  else set.delete(iso2)
  emit('update:modelValue', [...set])
}

const allSelected = computed(() => props.modelValue.length === COUNTRIES.length)

function toggleAll(next: boolean) {
  emit('update:modelValue', next ? COUNTRIES.map((c) => c.iso2) : [])
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UCheckbox
      :model-value="allSelected"
      :label="allSelected ? t('none') : t('all')"
      class="pyg-tap-target"
      @update:model-value="(next) => toggleAll(next === true)"
    />
    <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
      <li v-for="country in COUNTRIES" :key="country.iso2">
        <UCheckbox
          :model-value="modelValue.includes(country.iso2)"
          :label="country.name"
          class="pyg-tap-target"
          @update:model-value="(next) => toggle(country.iso2, next === true)"
        />
      </li>
    </ul>
  </div>
</template>
