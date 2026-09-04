# @oumarbarry/pygmalion-admin

The admin of [Pygmalion](https://github.com/oumarbarry/pygmalion), as a Nuxt
layer mounted on `/admin`. Task-based navigation, wizards for composed
operations, light and dark themes, usable on a phone. The interface is in
French.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@oumarbarry/pygmalion-admin'],
  modules: ['@oumarbarry/pygmalion'],
  routeRules: { '/admin/**': { ssr: false } },
})
```

Requires `@nuxt/ui` in the host application. A module can add its own admin
pages with `extendPages`; see the
[extending guide](https://github.com/oumarbarry/pygmalion/blob/main/docs/extending.md).
