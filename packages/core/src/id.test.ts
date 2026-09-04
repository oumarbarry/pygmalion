import { describe, expect, it } from 'vitest'
import { pygId } from './id'

describe('pygId', () => {
  it('prefixes the id', () => {
    expect(pygId('prod')).toMatch(/^prod_[0-9A-Za-z_-]+$/)
  })

  it('is unique across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => pygId('ord')))
    expect(ids.size).toBe(1000)
  })

  it('keeps the given prefix', () => {
    expect(pygId('cart').startsWith('cart_')).toBe(true)
  })
})
