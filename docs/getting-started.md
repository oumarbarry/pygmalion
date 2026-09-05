# From zero to your first sale

This guide starts from an empty machine and stops when an order is paid,
shipped, and visible on both sides: the storefront and the admin. Count
20 minutes, 15 of them reading.

**Requirements**: Node 22 or newer, pnpm 12, a browser. No database: in
development, Pygmalion starts an embedded Postgres (PGlite) under `.data/`.

The admin is in English by default and switches to French from the user
menu (or when the browser prefers French).

---

## 1. Install

### The demo shop

The fastest way to see everything running is the repository itself:

```bash
git clone https://github.com/oumarbarry/pygmalion.git
cd pygmalion
pnpm install
pnpm build      # builds the packages
pnpm dev        # starts apps/playground on http://localhost:3648
```

The console tells you what was created:

```
[demo] shop ready: 20 products, 2 collections, 2 regions, 2 shipping options, 2 promotions
[demo] admin: owner@pygmalion.dev / pygmalion at /admin
```

Open <http://localhost:3648>: the demo shop "Maison Pygmalion" is already
stocked. It is the playground; the next sections build **your** product
inside it.

> To start from an empty database: stop the server, run
> `rm -rf apps/playground/.data`, start again. The seed is idempotent block by
> block and only recreates what is missing.

### In your own Nuxt app

```bash
pnpm add @oumarbarry/pygmalion @oumarbarry/pygmalion-admin @nuxt/ui
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@oumarbarry/pygmalion-admin'], // the admin layer, mounted on /admin
  modules: ['@oumarbarry/pygmalion'],        // API, auth, database
  routeRules: { '/admin/**': { ssr: false } },
})
```

This is exactly what `apps/playground/nuxt.config.ts` does. Read it, it is
the reference file.

---

## 2. Enter the admin

In development an owner account is created for you: `owner@pygmalion.dev` /
`pygmalion`. Sign in at <http://localhost:3648/admin>.

On a fresh installation (no staff member in the database), the admin sends
you to `/admin/first-boot`, where you create the very first owner account. It
is the **only** staff account created without an invitation. After it,
sign-up is closed and the team grows by invitation (Settings, Team). This
is a server-side guard, not a preference:
`POST /api/admin/auth-bootstrap` answers 403 as soon as a member exists.

---

## 3. Check the settings a sale depends on

Four settings must exist before a product can be sold. The demo provides
them; on a blank installation, go through the list:

| Setting | Where | Why |
|---|---|---|
| A selling area (region and currency) | Settings, Selling areas | A price exists in a currency; a cart exists in a region |
| A stock location | `POST /api/admin/stock-locations` | Stock is counted somewhere. There is no dedicated screen yet: without a location, the Stock step of the product wizard stays empty and the product sells without stock management (checkout reserves nothing) |
| A shipping option | Settings, Delivery | Without it, payment is never reached |
| A tax (optional) | Settings, Taxes | VAT or sales tax, per country or province |

The default sales channel, currency and shipping profile are created at
startup. Nothing to do on that side.

---

## 4. Publish your first product

Products, **Add a product**. The wizard has six steps, each
saveable, in a merchant's order rather than the schema's:

1. **Details**: name, description, status (draft or on sale).
2. **Photos**: the first one becomes the thumbnail.
3. **Variants**: size, color, or nothing at all. A simple product keeps a
   single variant, created for you.
4. **Prices**: one amount per currency. Entered in major units, stored as an
   integer in minor units (never a float).
5. **Stock**: the quantity, in the location you declared.
6. **Channels**: where the product is visible.

A button switches the wizard to a full form if you prefer to see everything
at once. Both modes write the same fields.

Set the product **on sale** at the last step, then open the storefront: it is
live.

---

## 5. Buy

From the storefront, as a customer:

1. Open the product page, pick a variant, add it to the cart. The cart drawer
   opens; the cart survives a reload (guest cart cookie, no account needed).
2. Check out. The flow asks for an email, an address, a shipping option, then
   payment.
3. The default payment method is **`manual`**: built in, no configuration, it
   authorizes the order and the money is captured later from the admin. It is
   the "pay on delivery" mode, and what the E2E suites exercise.
4. Confirm: the confirmation page shows the order number. A guest can look it
   up later at `/order?email=…`.

To plug in Stripe instead (or alongside), see [deploy.md, Stripe](deploy.md#stripe-optional):
one environment variable, no code.

---

## 6. Capture and ship

Back in the admin, the order tops the Orders list with its next
step spelled out.

1. **Ship** opens a wizard: which items, which parcel, which tracking number.
   On confirmation, reserved stock becomes shipped stock and the customer
   receives a notification (the `local` provider by default: the
   `notifications` row *is* the delivery, see [extending.md](extending.md)).
2. **Capture payment** captures the money. The recommended mode is this one:
   authorize at checkout, capture at shipment. You do not charge what you have
   not sent.
3. The **Money** block keeps the accounts at all times: total, captured,
   refunded, left to capture. No button can take you past a ceiling; the guard
   is server-side, not in the screen.

You just made a complete sale. The rest of the admin follows the same logic:
returns, exchanges, claims, order edits, draft orders, all through wizards.

---

## What next

- **Extend the framework**: a Pygmalion module is an ordinary Nuxt module with
  five capabilities, see [extending.md](extending.md).
- **Go to production**: Postgres, secrets, migrations, see
  [deploy.md](deploy.md).
- **Consume the API from another front end**: `@oumarbarry/pygmalion-sdk` is
  a typed TypeScript client with no dependency. The composables (`useCart`,
  `useCheckout`, `useCustomer`) are its Nuxt version, and exactly what the
  demo shop uses.
- **Change the demo shop**: all its content is data, in
  `apps/playground/modules/demo/runtime/catalog.ts`, see
  [apps/playground/README.md](../apps/playground/README.md).
