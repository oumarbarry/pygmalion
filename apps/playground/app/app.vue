<script setup lang="ts">
const { locale } = useShopText()
useHead({
  htmlAttrs: { lang: locale },
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
