import { defineConfig } from 'vitest/config'

// Root suite = pure unit tests across packages. Playground E2E (@nuxt/test-utils)
// boots a Nuxt server and runs via `pnpm --filter playground test`.
export default defineConfig({
  // `packages/admin/tsconfig.json` extends `./.nuxt/tsconfig.json`, which only
  // exists after `nuxi prepare` — esbuild would refuse to transform the layer's
  // pure utils on a clean checkout. Nothing here typechecks (that's
  // `pnpm typecheck`), so an empty raw tsconfig is exactly right.
  esbuild: { tsconfigRaw: '{}' },
  test: {
    // `src/**` for the libs; the admin layer is a Nuxt layer (`app/**`, no
    // `src/`) whose only unit-testable code is plain framework-free .ts —
    // component tests would need the vue plugin (none exist). The
    // playground's `app/utils` is on the list for the same reason:
    // money formatting and variant resolution are pure and worth pinning,
    // while its `test/**` stays E2E (`pnpm --filter playground test`).
    include: ['packages/**/src/**/*.test.ts', 'packages/**/app/**/*.test.ts', 'apps/playground/app/**/*.test.ts'],
    // Each beforeEach boots a PGlite (WASM) + full schema push (~2s). Unbounded
    // file parallelism starves the hooks past their timeout as the schema grows.
    // Cap workers and use a generous hookTimeout; upgrade path: one PGlite
    // per file (beforeAll) + TRUNCATE between tests when the suite slows.
    // Serial files: PGlite WASM instantiation is CPU-heavy and several suites
    // may run concurrently on the same machine.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
})
