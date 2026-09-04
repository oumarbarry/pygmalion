<script setup lang="ts">
/**
 * Composed operations (create product, process a return,
 * create a promotion...) are guided wizards: one question per screen, a
 * final plain-language summary before committing. `steps` are the
 * questions; the summary screen is an implicit extra step appended after
 * them (index === steps.length).
 */
export interface PygWizardStep {
  key: string
  title: string
  description?: string
}

const props = withDefaults(defineProps<{
  steps: PygWizardStep[]
  modelValue: number
  loading?: boolean
  finishLabel?: string
}>(), {
  loading: false,
  finishLabel: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [index: number]
  finish: []
}>()

const { t } = useVocabulary()

const summaryIndex = computed(() => props.steps.length)
const isSummary = computed(() => props.modelValue >= summaryIndex.value)
const currentStep = computed(() => props.steps[props.modelValue])

/** Steps + the implicit summary screen — what the progress bar counts. */
const totalScreens = computed(() => props.steps.length + 1)
const currentTitle = computed(() => (isSummary.value ? t('finish') : currentStep.value?.title ?? ''))

function goPrev() {
  if (props.modelValue > 0) emit('update:modelValue', props.modelValue - 1)
}

function goNext() {
  if (props.modelValue < summaryIndex.value) emit('update:modelValue', props.modelValue + 1)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!--
      Progress: "Étape 2 / 7" + one filled segment per screen. Plain markup
      rather than UStepper — see app.config.ts. A merchant reading with
      difficulty gets a count and a bar, not 7 numbered circles that don't
      fit a phone.
    -->
    <div class="flex flex-col gap-2">
      <!-- The step title is the h2 right below; repeating it here would say
           the same thing twice. Screen readers still get it via
           `aria-valuetext`. -->
      <p class="text-sm font-bold text-highlighted">
        {{ t('wizardStepLabel') }} {{ Math.min(modelValue, summaryIndex) + 1 }} / {{ totalScreens }}
      </p>
      <div
        class="flex items-center gap-1.5"
        role="progressbar"
        :aria-valuemin="1"
        :aria-valuemax="totalScreens"
        :aria-valuenow="Math.min(modelValue, summaryIndex) + 1"
        :aria-valuetext="`${t('wizardStepLabel')} ${Math.min(modelValue, summaryIndex) + 1} / ${totalScreens} — ${currentTitle}`"
      >
        <span
          v-for="n in totalScreens"
          :key="n"
          class="h-2 flex-1 rounded-full transition-colors"
          :class="n - 1 <= modelValue ? 'bg-primary' : 'bg-accented'"
        />
      </div>
    </div>

    <div class="min-h-40 max-w-3xl">
      <template v-if="!isSummary">
        <div class="flex flex-col gap-1 mb-4">
          <h2 class="text-lg font-bold text-highlighted">{{ currentStep?.title }}</h2>
          <p v-if="currentStep?.description" class="text-sm text-muted">{{ currentStep.description }}</p>
        </div>
        <slot v-if="currentStep" :name="`step-${currentStep.key}`" />
      </template>
      <template v-else>
        <!-- The summary is a screen like any other: it gets the same heading
             treatment, so the merchant knows nothing is committed yet. -->
        <div class="flex flex-col gap-1 mb-4">
          <h2 class="text-lg font-bold text-highlighted">{{ t('wizardSummaryTitle') }}</h2>
        </div>
        <slot name="summary" />
      </template>
    </div>

    <div class="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-4 border-t border-default">
      <UButton
        v-if="modelValue > 0"
        color="neutral"
        variant="outline"
        size="md"
        icon="i-lucide-arrow-left"
        :label="t('back')"
        block
        class="sm:w-auto"
        @click="goPrev"
      />
      <div v-else class="hidden sm:block" />

      <UButton
        v-if="!isSummary"
        color="primary"
        size="md"
        trailing-icon="i-lucide-arrow-right"
        :label="t('next')"
        block
        class="sm:w-auto"
        @click="goNext"
      />
      <UButton
        v-else
        color="primary"
        size="md"
        icon="i-lucide-check"
        :label="finishLabel ?? t('finish')"
        :loading="loading"
        block
        class="sm:w-auto"
        @click="emit('finish')"
      />
    </div>
  </div>
</template>
