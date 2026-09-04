import { describe, expect, it } from 'vitest'
import {
  createSpecifierRegistry,
  renderCustomerAuthOptionsTemplate,
  renderProvidersTemplate,
  renderSchemaTemplate,
} from './registry'

describe('specifier registry', () => {
  it('collects in order and dedupes', () => {
    const r = createSpecifierRegistry(['@oumarbarry/pygmalion-core/schema'])
    r.add('/abs/demo/schema')
    r.add('@oumarbarry/pygmalion-core/schema') // dupe
    r.add('/abs/demo/schema') // dupe
    expect(r.specifiers).toEqual(['@oumarbarry/pygmalion-core/schema', '/abs/demo/schema'])
  })
})

describe('renderSchemaTemplate', () => {
  it('namespace-imports each specifier and merges into one schema object', () => {
    const out = renderSchemaTemplate(['@oumarbarry/pygmalion-core/schema', '/abs/demo/schema'])
    expect(out).toContain('import * as _s0 from "@oumarbarry/pygmalion-core/schema"')
    expect(out).toContain('import * as _s1 from "/abs/demo/schema"')
    expect(out).toContain('export const schema = { ..._s0, ..._s1 }')
  })

  it('handles an empty registry', () => {
    expect(renderSchemaTemplate([])).toContain('export const schema = {  }')
  })
})

describe('renderProvidersTemplate', () => {
  it('default-imports each specifier and flattens descriptor arrays', () => {
    const out = renderProvidersTemplate(['/abs/demo/providers'])
    expect(out).toContain('import _p0 from "/abs/demo/providers"')
    expect(out).toContain('export const providerDescriptors = [ ..._p0 ]')
  })

  it('handles an empty registry', () => {
    expect(renderProvidersTemplate([])).toContain('export const providerDescriptors = []')
  })
})

describe('renderCustomerAuthOptionsTemplate', () => {
  it('default-imports each specifier and shallow-merges them, later wins', () => {
    const out = renderCustomerAuthOptionsTemplate(['/abs/oauth-options', '/abs/two-factor-options'])
    expect(out).toContain('import _o0 from "/abs/oauth-options"')
    expect(out).toContain('import _o1 from "/abs/two-factor-options"')
    expect(out).toContain('export const customerAuthOptions = { ..._o0, ..._o1 }')
  })

  it('handles an empty registry', () => {
    expect(renderCustomerAuthOptionsTemplate([])).toContain('export const customerAuthOptions = {  }')
  })
})
