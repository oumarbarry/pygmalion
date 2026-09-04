import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // @oumarbarry/pygmalion-core is a TYPE-ONLY dependency (entity + zod input types): it
  // must stay an external reference in the emitted .d.mts, never bundled, and
  // it must not appear in the emitted .mjs at all (see `zero runtime imports`
  // in client.test.ts).
  deps: { neverBundle: ['@oumarbarry/pygmalion-core'] },
})
