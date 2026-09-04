<script setup lang="ts">
import type { ProductCategory, ProductCollection } from '@oumarbarry/pygmalion-core'

defineProps<{ collections: ProductCollection[]; categories: ProductCategory[] }>()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-24 border-t border-default bg-muted/40">
    <div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:grid-cols-2 lg:grid-cols-4">
      <div class="sm:col-span-2 lg:col-span-1">
        <p class="shop-display text-lg text-highlighted">Maison Pygmalion</p>
        <p class="shop-prose mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Objets pour la maison, choisis pour durer. Expédié depuis Nantes sous 48 h.
        </p>
      </div>

      <nav aria-labelledby="footer-collections">
        <h2 id="footer-collections" class="text-sm font-semibold text-highlighted">Collections</h2>
        <ul class="mt-4 space-y-2.5 text-sm">
          <li v-for="c in collections" :key="c.id">
            <NuxtLink :to="`/collections/${c.id}`" class="text-muted transition-colors hover:text-highlighted">
              {{ c.title }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <nav aria-labelledby="footer-categories">
        <h2 id="footer-categories" class="text-sm font-semibold text-highlighted">Rayons</h2>
        <ul class="mt-4 space-y-2.5 text-sm">
          <li v-for="c in categories.slice(0, 5)" :key="c.id">
            <NuxtLink :to="`/categories/${c.id}`" class="text-muted transition-colors hover:text-highlighted">
              {{ c.name }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <nav aria-labelledby="footer-account">
        <h2 id="footer-account" class="text-sm font-semibold text-highlighted">Votre compte</h2>
        <ul class="mt-4 space-y-2.5 text-sm">
          <li><NuxtLink to="/account/orders" class="text-muted transition-colors hover:text-highlighted">Mes commandes</NuxtLink></li>
          <li><NuxtLink to="/account/addresses" class="text-muted transition-colors hover:text-highlighted">Mes adresses</NuxtLink></li>
          <li><NuxtLink to="/order" class="text-muted transition-colors hover:text-highlighted">Suivre une commande</NuxtLink></li>
        </ul>
      </nav>
    </div>

    <!-- The demo's own footprint: this shop is the Pygmalion playground. -->
    <div class="border-t border-default px-4 py-6 text-center text-xs text-dimmed sm:px-6">
      Pygmalion playground — boutique de démonstration · © {{ year }}
      <NuxtLink to="/admin" class="ml-1 underline underline-offset-2 hover:text-muted">Administration</NuxtLink>
    </div>
  </footer>
</template>
