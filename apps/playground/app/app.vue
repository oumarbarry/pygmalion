<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'fr' },
  titleTemplate: (title) => (title ? `${title} — Maison Pygmalion` : 'Maison Pygmalion'),
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
