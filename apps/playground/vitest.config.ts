import { defineConfig } from 'vitest/config'

// E2E only (boots the playground via @nuxt/test-utils). Slow: allow for the
// one-off Nuxt build in the setup hook.
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Each file's `setup()` boots a full Nuxt server (build + listen) — CPU/IO
    // heavy. Unbounded file parallelism races several of these builds at
    // once and starves them past the hook timeout (`ENOTEMPTY` on `.nuxt/test/*`
    // temp dirs, `Hook timed out`). Same fix already applied to the root
    // `vitest.config.ts` for the (lighter) PGlite-per-file core suite:
    // ponytail: serial files here too, for the same reason.
    fileParallelism: false,
    // @nuxt/test-utils runs the built server with NODE_ENV=production, which
    // (correctly) trips the "secret required in production" guard — inject a
    // test-only secret; the spawned server inherits this process env.
    env: {
      BETTER_AUTH_SECRET: 'pygmalion-e2e-test-secret-0123456789abcdef',
      PYGMALION_TEST_DISABLE_RATE_LIMIT: '1',
    },
  },
})
