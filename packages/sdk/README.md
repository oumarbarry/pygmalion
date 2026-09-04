# @oumarbarry/pygmalion-sdk

A typed HTTP client for a [Pygmalion](https://github.com/oumarbarry/pygmalion)
server, with zero runtime dependencies. `client.store.*` and `client.admin.*`
mirror the served API, one method per route.

```ts
import { createPygmalionClient } from '@oumarbarry/pygmalion-sdk'

const client = createPygmalionClient({ baseUrl: 'https://shop.example' })
const { products } = await client.store.products.list({ limit: 12 })
```

Inside a Nuxt app using `@oumarbarry/pygmalion`, the `useCart`,
`useCheckout`, `useCustomer` and `useRegion` composables are built on this
client and auto-imported.
