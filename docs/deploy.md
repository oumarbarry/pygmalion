# Going to production

Pygmalion deploys like any Nuxt application: `nuxt build` produces
`.output/`, and `node .output/server/index.mjs` serves it. What differs from
an ordinary Nuxt project comes down to three things: a Postgres database, an
authentication secret, and a migration command.

---

## Environment variables

Three groups. The framework reads no other variable.

### Required

| Variable | Effect | Without it |
|---|---|---|
| `DATABASE_URL` | Production Postgres, e.g. `postgres://user:password@host:5432/shop` | The server falls back to PGlite under `.data/`, a local file, ephemeral on most hosts. Not a production database |
| `BETTER_AUTH_SECRET` | Signs customer **and** staff sessions | Startup fails when `NODE_ENV=production` (a deliberate guard in `packages/nuxt/src/runtime/server/utils/auth.ts`) |

Generate the secret once and keep it stable. Changing it signs everyone out:

```bash
openssl rand -base64 32
```

**Strongly recommended**: `BETTER_AUTH_URL`, the public URL of the shop
(`https://my-shop.example`). Without it, better-auth infers the origin from
each incoming request and says so at startup (`Base URL is not set`); behind a
proxy, redirects and callbacks may go to the wrong place.

### Stripe (optional)

| Variable | Effect |
|---|---|
| `STRIPE_SECRET_KEY` | Enables the `@oumarbarry/pygmalion-stripe` module and registers the `stripe` provider |
| `STRIPE_WEBHOOK_SECRET` | Verifies the signature of `POST /api/pygmalion/stripe/webhook` |

The module reads these values from `runtimeConfig.stripe` (`secretKey`,
`webhookSecret`, `captureMethod`, `manual` by default).

In the playground, `nuxt.config.ts` only loads `@oumarbarry/pygmalion-stripe`
when `STRIPE_SECRET_KEY` is present, and maps both values to
`runtimeConfig.stripe`. In your application, do the same or declare the
module unconditionally and provide `NUXT_STRIPE_SECRET_KEY` /
`NUXT_STRIPE_WEBHOOK_SECRET` (Nuxt's `runtimeConfig` convention).

The default mode is **manual capture**: authorization at checkout, capture at
shipment. You do not charge what you have not sent.

### Runtime settings (optional, through `runtimeConfig.pygmalion`)

| Key | Default | Role |
|---|---|---|
| `databaseUrl` | none | Alternative to the `DATABASE_URL` variable (the environment wins) |
| `dataDir` | `.data/pygmalion` | PGlite and file storage (unstorage) location when there is no `DATABASE_URL` |
| `autoPush` | `true` in dev, `false` with `DATABASE_URL` | Push the schema at startup. **Leave it `false` in production**: that is `pygmalion-migrate`'s job |
| `drainIntervalMs` | `5000` | Outbox drain interval (events, webhooks, notifications) |
| `notificationProvider` | `local` | Id of the notification provider to use |
| `webhookRetryBaseMs` / `webhookTimeoutMs` | `5000` / `10000` | Backoff base and timeout of webhook deliveries |

Nuxt reminder: any `runtimeConfig` key can be overridden from the environment,
here `NUXT_PYGMALION_DATA_DIR`, `NUXT_PYGMALION_AUTO_PUSH`, and so on.

---

## Migrating the schema

In development the schema is pushed at startup, you run nothing. In
production `autoPush` is off and the migration is an explicit command:

```bash
# from the application directory
pnpm exec pygmalion-migrate up --dry-run    # read what will be applied
pnpm exec pygmalion-migrate up              # apply to DATABASE_URL
```

```bash
# or: write the full DDL without touching any database
pnpm exec pygmalion-migrate generate --out schema.sql
psql "$DATABASE_URL" -f schema.sql
```

The command loads your Nuxt application to compose the schema: the core
**plus** the tables of each of your modules. Run it from the application root
(or pass `--cwd`), and through the installed binary (`pnpm exec` /
`node_modules/.bin/`): that is what carries the module resolution paths.

### What the command does not do

`up` **is** drizzle-kit's push: it introspects the live database and emits the
statements that bring it closer to the schema. Simple and sufficient to
converge, but:

- **no migration history**: no versioned files, no `down`, nothing to read in
  a code review;
- **a rename reads as a `DROP` then a `CREATE`**: the renamed column loses its
  data;
- **destructive statements are applied as generated**, without confirmation.

Hence the rule: `--dry-run` first, backup next, apply last. The day a schema
change needs a human diff, the way out is known: keep the snapshots
drizzle-kit already knows how to produce and generate migrations between them.

---

## Production checklist

1. **Database**: a reachable Postgres, `DATABASE_URL` set. Postgres only: no
   MySQL, no SQLite.
2. **Secret**: `BETTER_AUTH_SECRET` (32 random bytes), stored in the host's
   secret manager, never in the repository.
3. **Migration**: `pygmalion-migrate up --dry-run`, review, backup, then `up`.
   Check that `autoPush` is `false`.
4. **Build**: `pnpm build` (the packages, when working from the monorepo) then
   `nuxt build` (the application). Serve `node .output/server/index.mjs`.
5. **First account**: open `/admin`. On a database without staff, the
   `first-boot` screen creates the owner. Do it **immediately** after going
   live: the route is public as long as no member exists (it answers 403 once
   one does).
6. **Payment**: without `STRIPE_SECRET_KEY`, the only method offered is
   `manual` (no real capture). Decide it on purpose, do not discover it.
7. **Files**: product images are served by unstorage, on disk under `dataDir`
   by default. On a host with an ephemeral file system, point the
   `pygmalion:files` storage to a persistent driver (S3, Vercel Blob, …) in
   `nitro.storage`.
8. **Backups**: Postgres holds everything: orders, money, audit log. The rest
   (`.data/`) can be rebuilt, except the files.
9. **Security**: better-auth applies its default rate limiting; never set
   `PYGMALION_TEST_DISABLE_RATE_LIMIT` outside CI. Serve over HTTPS: session
   and cart cookies switch to `secure` as soon as `NODE_ENV=production`.
10. **Smoke test**: after startup, three requests tell you whether everything
    holds:

```bash
curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/store/products
curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/admin
```

Three `200`. A `500` on `/api/store/products` is almost always an unmigrated
database; a startup error without a trace, almost always
`BETTER_AUTH_SECRET`.

---

## Background work

The outbox drain (domain events, webhook deliveries, notifications) runs in
the server process, every `drainIntervalMs`. There is no separate worker to
deploy. There is also no drain when no server runs: on a platform that puts
the process to sleep, webhooks leave on wake-up, not before.
