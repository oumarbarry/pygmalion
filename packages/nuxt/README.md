# @oumarbarry/pygmalion

An ecommerce framework for Nuxt. Add the module to a Nuxt app and you have a
shop: the API, authentication for customers and staff, and a migrated
Postgres database. Pair it with `@oumarbarry/pygmalion-admin` for the admin.

```bash
pnpm add @oumarbarry/pygmalion @oumarbarry/pygmalion-admin @nuxt/ui
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@oumarbarry/pygmalion-admin'],
  modules: ['@oumarbarry/pygmalion'],
  routeRules: { '/admin/**': { ssr: false } },
})
```

In development the database is an embedded PGlite. In production set
`DATABASE_URL` and `BETTER_AUTH_SECRET`, and migrate with the
`pygmalion-migrate` CLI this package ships.

Documentation: [github.com/oumarbarry/pygmalion](https://github.com/oumarbarry/pygmalion).
