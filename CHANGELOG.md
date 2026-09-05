# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The five packages share one
version.

## [Unreleased]

## [0.1.0] - 2026-09-04

First public release.

### Added

- `@oumarbarry/pygmalion`: the Nuxt module. 282 API routes under
  `/api/store/**` and `/api/admin/**`, two better-auth instances (customers,
  and staff with invitations and API keys), PGlite in development, a
  `pygmalion-migrate` CLI for production.
- `@oumarbarry/pygmalion-core`: the Drizzle schema (97 tables) and the
  services for catalog, pricing, taxes, inventory, cart, promotions,
  shipping, payments, checkout, orders, order edits, returns, exchanges,
  claims, draft orders, customers, sales channels, webhooks and
  notifications. 112 domain events, written to an outbox table inside the
  transaction.
- `@oumarbarry/pygmalion-admin`: the admin as a Nuxt layer. 49 screens,
  task-based navigation, wizards for composed operations, light and dark
  themes, mobile layout, English and French (English by default, switch in
  the user menu).
- `@oumarbarry/pygmalion-sdk`: a typed client for the store and admin APIs,
  with the `useCart`, `useCheckout`, `useCustomer` and `useRegion`
  composables.
- `@oumarbarry/pygmalion-stripe`: Stripe PaymentIntents with manual capture
  and a signed webhook.
- Module hooks `pygmalion:schema`, `pygmalion:providers` and
  `pygmalion:customer-auth`, and the `pygmalion:event` Nitro hook.
- `apps/playground`: the demo shop, seeded in development in English or in
  French (`DEMO_LOCALE`), a storefront in both languages, and the E2E
  suites.

[Unreleased]: https://github.com/oumarbarry/pygmalion/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/oumarbarry/pygmalion/releases/tag/v0.1.0
