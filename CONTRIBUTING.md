# Contributing

## Setup

Node 22 or newer and pnpm 11 (`corepack enable` gives you the pinned version).

```bash
pnpm install
pnpm build
```

## Checks

CI runs these on every pull request, so run them locally first:

```bash
pnpm typecheck
pnpm test          # unit suites, each boots PGlite in memory
pnpm test:e2e      # builds apps/playground and runs the HTTP suites (slow)
```

## Layout

- `packages/core`: schema and services, no framework import. A service takes
  a database and returns plain objects.
- `packages/nuxt`: the module. Route handlers under `src/runtime/server/api`
  mirror the URL; every route is registered in `src/module.ts`.
- `packages/admin`: the admin, a Nuxt layer.
- `packages/sdk`, `packages/stripe`.
- `apps/playground`: the demo shop, also the E2E bench.

## Guidelines

- One commerce operation is one transaction. Side effects go through the
  outbox table, inside the transaction. No external call while a transaction
  is open.
- Money is an integer in minor units. Never a float.
- Guards on money and stock (capture and refund ceilings, reservations) live
  server-side in the service, never only in a screen.
- Merchant-facing text has no jargon. New admin strings go through the
  vocabulary (`packages/admin/app/utils/vocabulary.ts`), in both dictionaries.
- A bug fix or a feature comes with a test: a unit test in the package for
  service logic, an E2E spec in `apps/playground/test` for anything that
  crosses HTTP or auth.
- Update the Unreleased section of `CHANGELOG.md` when you change public
  behavior.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
`feat:`, `fix:`, `docs:`, `test:`, `chore:`. PRs target `main`.

## Releasing

The five packages share one version.

1. Bump `version` in each `packages/*/package.json` and `PYGMALION_VERSION`
   in `packages/core/src/index.ts`. Move the Unreleased entries of
   `CHANGELOG.md` under the new version.
2. `pnpm release` builds and publishes the five packages (needs `npm login`).
3. Tag `vX.Y.Z` and publish a GitHub release.

`.github/workflows/release.yml` publishes on a GitHub release through npm
trusted publishing, once each package has a trusted publisher configured on
npmjs.com (repository `oumarbarry/pygmalion`, workflow `release.yml`,
environment `npm`). Until that is configured, step 2 is the release.
