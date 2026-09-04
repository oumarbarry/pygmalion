# Extending Pygmalion

A Pygmalion module **is** an ordinary Nuxt module. No proprietary registry, no
invented lifecycle: `defineNuxtModule`, the `@nuxt/kit` utilities, and three
Pygmalion hooks on top.

Five capabilities, and nothing else:

| # | Capability | Entry point |
|---|---|---|
| 1 | Extend the schema | `nuxt.hook('pygmalion:schema', …)` |
| 2 | Register a provider (payment, tax, inventory, fulfillment, notification) | `nuxt.hook('pygmalion:providers', …)` |
| 3 | Serve routes under `/api/store/**` or `/api/admin/**` | `addServerHandler` |
| 4 | Add pages to the admin | `extendPages` |
| 5 | Listen to domain events | `nitroApp.hooks.hook('pygmalion:event', …)` |

The repository's demo module exercises **all five** in about a hundred lines.
This guide reads it. The code is in `apps/playground/modules/demo/`, it runs
on every `pnpm dev`, and the E2E suites cover it
(`apps/playground/test/e2e.spec.ts`).

---

## The skeleton

```ts
// modules/demo/module.ts
import { addServerHandler, addServerImportsDir, addServerPlugin, createResolver, defineNuxtModule, extendPages } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'demo', configKey: 'demo' },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    // the five capabilities, below
  },
})
```

Declare it **after** `@oumarbarry/pygmalion`. Its hooks do not exist before:

```ts
// nuxt.config.ts
modules: ['@oumarbarry/pygmalion', './modules/demo/module']
```

---

## 1. Extend the schema

The schema is single and relational: your tables live in the same database as
the core's, with real foreign keys to them if you want. Write ordinary Drizzle
tables:

```ts
// modules/demo/schema.ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const demoNotes = pgTable('demo_notes', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Then announce the file to the registry:

```ts
nuxt.hook('pygmalion:schema', (registry) => {
  registry.add(resolve('./schema'))
})
```

You register an **import path**, not the objects: Drizzle tables are not
serializable into a template. The module renders a virtual module
(`#pygmalion/schema`) that re-imports everything and merges it. That composed
schema is what the Nitro plugin pushes in development, and what
`pygmalion-migrate` generates for production. Your table is migrated exactly
like the others, without you running anything.

---

## 2. Register a provider

Five families: `payment`, `tax`, `inventory`, `fulfillment`, `notification`.
A provider is an object that implements its family's interface. The descriptor
names it and builds it lazily (on first resolution, once the context is
ready).

```ts
// modules/demo/providers.ts
import { createManualPaymentProvider, type PaymentProvider } from '@oumarbarry/pygmalion-core'
import type { ProviderDescriptor } from '@oumarbarry/pygmalion'

const alwaysFailPayment: PaymentProvider = {
  ...createManualPaymentProvider(),
  async authorize() {
    return { data: {}, status: 'error' }
  },
}

const providers: ProviderDescriptor[] = [
  { type: 'notification', id: 'console', factory: () => ({ notify: (m: string) => console.log('[demo-notify]', m) }) },
  { type: 'payment', id: 'always-fail', factory: () => alwaysFailPayment },
]

export default providers
```

```ts
nuxt.hook('pygmalion:providers', (registry) => {
  registry.add(resolve('./providers'))
})
```

That provider is deliberately dumb: it serves the checkout compensation tests.
The real reference example is `@oumarbarry/pygmalion-stripe`: PaymentIntents
with manual capture, a signed webhook, the event written to the outbox and
handled on drain. It fits in one package, without a line of Pygmalion
modified.

A registered provider is **immediately visible** from the storefront and the
admin: the checkout reads `GET /api/store/payment-providers`, the admin reads
the tax, shipping and payment registries. Adding a payment method requires no
change to any screen.

---

## 3. Serve your own routes

`addServerHandler`, like any Nuxt module. `usePygmalion()` is auto-imported in
server context and returns the database and the services:

```ts
// modules/demo/runtime/routes/notes.get.ts
import { desc } from 'drizzle-orm'
import { demoNotes } from '../../schema'

export default defineEventHandler(async () => {
  const { db } = usePygmalion()
  const notes = await db.select().from(demoNotes).orderBy(desc(demoNotes.createdAt)).limit(20)
  return { notes }
})
```

```ts
addServerHandler({
  route: '/api/store/demo-notes',
  method: 'get',
  handler: resolve('./runtime/routes/notes.get'),
})
```

The core middlewares apply without wiring on your side: a route under
`/api/admin/**` requires a staff session or an API key (401 otherwise), a
route under `/api/store/**` receives the optional customer session, the sales
channel and the guest cart token in `event.context`.

---

## 4. Add an admin page

```ts
// modules/demo/runtime/pages/notes.vue, served at /admin/notes
extendPages((pages) => {
  pages.push({ name: 'demo-notes', path: '/admin/notes', file: resolve('./runtime/pages/notes.vue') })
})
```

```vue
<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { data } = await useFetch<{ notes: { id: string, body: string }[] }>('/api/store/demo-notes')
</script>

<template>
  <PygPage title="Notes" description="A page added by a module">
    <PygList :items="data?.notes ?? []" :columns="[{ key: 'body', label: 'Note' }]">
      <template #empty>
        <PygEmptyState icon="i-lucide-sticky-note" title="No notes yet" description="…" />
      </template>
    </PygList>
  </PygPage>
</template>
```

`layout: 'admin'` places the page in the existing shell: navigation, global
search, header. The `Pyg*` components (`PygPage`, `PygList`, `PygForm`,
`PygWizard`, `PygMoney`, `PygStatus`, `PygEmptyState`, `PygConfirm`,
`PygSubNav`) come from the `@oumarbarry/pygmalion-admin` layer. Using them
gives you light and dark themes, mobile layout and the admin's vocabulary for
free.

For a screen that must call `/api/admin/**`, use `useAdminFetch` (it carries
the staff session) rather than a bare `$fetch`.

---

## 5. Listen to domain events

The core emits 112 events (`order.placed`, `order.shipment_created`,
`product.created`, `customer.created`, `order.return_received`, …). They are
**not** emitted live: each commerce operation writes its row to the `outbox`
table **inside the transaction**, and a drain distributes them after commit. A
subscriber therefore never sees an event whose transaction was rolled back.

```ts
// modules/demo/runtime/plugin.ts
export default defineNitroPlugin(async (nitroApp) => {
  nitroApp.hooks.hook('pygmalion:event', (e) => {
    capturedEvents.push(e)
  })

  // The context is not necessarily ready: Nitro does not await its plugins
  // sequentially. Wait for it explicitly.
  const { services } = await waitForPygmalionContext()
  // services.products.create(…), etc.
})
```

```ts
addServerPlugin(resolve('./runtime/plugin'))
```

Your subscriber runs in the process. To notify a third-party system, prefer a
**webhook** (Settings, Webhooks): HMAC-SHA256 signature in the Stripe style,
retries with backoff, a replayable delivery log. It already exists, do not
rewrite it.

---

## Where to put the module

- **Local to the application**: `modules/my-module/module.ts`, declared by
  relative path in `nuxt.config.ts`. This is the demo module's case.
- **Published**: an ordinary npm package built with `@nuxt/module-builder`,
  declared by name. This is `@oumarbarry/pygmalion-stripe`'s case. Look at its
  `package.json`, there is nothing special about it.

## What a module cannot do

- **Replace a core table.** The schema is single: you add tables, you do not
  redefine them.
- **Remove a core route.** You can add routes, not unmount them.
- **Change the cart calculation pipeline** (totals, promotions, taxes). The
  steps are internal pure functions. The intended extension point is the tax
  provider.
- **Migrate its table separately.** There is one composed schema and one
  migration command. Versioning it apart does not exist.
