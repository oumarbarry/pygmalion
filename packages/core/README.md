# @oumarbarry/pygmalion-core

The domain layer of [Pygmalion](https://github.com/oumarbarry/pygmalion): the
Drizzle schema and the commerce services (catalog, pricing, taxes, inventory,
cart, promotions, shipping, payments, checkout, orders, returns, exchanges,
claims, draft orders, customers, webhooks, notifications).

Pure TypeScript with no Nuxt or h3 import. You normally get it through
`@oumarbarry/pygmalion`, which builds the database and exposes the services
as `usePygmalion()`; install it directly to write a provider or to reuse the
schema (`@oumarbarry/pygmalion-core/schema`) in a module.
