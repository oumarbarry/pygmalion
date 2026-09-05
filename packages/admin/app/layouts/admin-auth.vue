<script setup lang="ts">
// Centered, chrome-free layout for sign-in / first-boot / accept-invite —
// no sidebar, no session assumed yet.
const { locale } = useVocabulary()
useHead({ htmlAttrs: { lang: locale } })
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center bg-muted p-4 sm:p-6">
    <div class="w-full max-w-md flex flex-col gap-6">
      <div class="flex items-center justify-center gap-2">
        <div class="size-10 rounded-xl bg-primary flex items-center justify-center text-inverted font-black text-lg">P</div>
        <span class="font-bold text-highlighted text-lg">Pygmalion</span>
      </div>
      <UCard>
        <slot />
      </UCard>
    </div>
  </div>
</template>
