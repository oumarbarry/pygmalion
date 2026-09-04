# Maison Pygmalion, the demo shop

The playground is not a hello world: it is a real direct-to-consumer shop
built on `@oumarbarry/pygmalion`, and the framework's E2E bench.

```bash
pnpm dev            # http://localhost:3648
```

On first start, the PGlite database is created under `.data/`, the schema is
pushed, then the shop is seeded: 20 published products with photos, EUR and
USD prices and stock, 2 collections, 5 categories, 2 regions (Europe/EUR and
United States/USD) with 20% French VAT and 8.25% US sales tax, 1 warehouse,
2 shipping options, 1 automatic promotion and the code `BIENVENUE10`.

The shop's copy is in French. The admin is at `/admin`, with an account
created for you in development:

```
owner@pygmalion.dev / pygmalion
```

The credentials are printed to the console on every start.

## Changing the catalog

All demo content is data, in `modules/demo/runtime/catalog.ts`: products,
options, prices, images. The seed (`modules/demo/runtime/seed.ts`) is
**idempotent block by block**. Edit the catalog, run `pnpm dev` again, what is
missing is created and the rest does not move. To start over, stop the server
then `rm -rf .data`.

Photos live in `public/demo/` (CC0, see `public/demo/CREDITS.md`).

The seed **only runs in development**. The E2E suites build for production
and therefore keep the empty shop their fixtures assume; the shopping journey
suite requests the data through `POST /api/_demo/seed`.

## Payment

By default the checkout only uses the built-in **`manual`** provider: nothing
to configure, the order is authorized then captured at shipment from the
admin. That is what the E2E suites exercise.

### Enabling Stripe

```bash
export STRIPE_SECRET_KEY=sk_test_…
export STRIPE_WEBHOOK_SECRET=whsec_…   # optional locally
pnpm dev
```

`nuxt.config.ts` loads `@oumarbarry/pygmalion-stripe` only when
`STRIPE_SECRET_KEY` is present. The module registers the `stripe` provider in
the provider registry; the checkout reads `GET /api/store/payment-providers`
and shows one more choice, with no branch in the pages.

The flow, server side:

1. `POST /api/store/payment-collections { cartId, providerId: 'stripe' }`
   creates the collection **and** its session. The provider opens a
   PaymentIntent with `capture_method: manual` and returns its client secret
   in `paymentSession.data.clientSecret`.
2. The front end confirms that PaymentIntent with Stripe (Payment Element or
   Checkout Session), outside Pygmalion.
3. `POST /api/store/carts/:id/complete` places the order: reservations and a
   `pending` order in a first transaction, authorization **outside** any
   transaction, a second transaction finalizes, or compensates (order
   cancelled, stock released) when authorization fails.
4. Stripe notifies `POST /api/pygmalion/stripe/webhook`. The signature is
   verified, the event is written to the outbox and handled on drain. Never a
   payment mutation inside the handler.
5. Capture happens at shipment, from the admin.

Step 2 is the only one that needs Stripe client code. The demo shop does not
embed it: adding `@stripe/stripe-js` for a provider that is not configured by
default would make everyone carry the dependency. The `clientSecret` is
already returned, mount the element on it.
