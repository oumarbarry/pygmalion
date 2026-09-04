import { describe, expect, it } from 'vitest'
import { currencyExponent, minorToAmountInput, parseAmountToMinor } from './money'

// Money path: what a merchant types must land in the API as integer minor
// units, for a 2-decimal AND a 0-decimal currency.
describe('parseAmountToMinor', () => {
  it('accepts comma and dot decimals, and spaces as thousand separators', () => {
    expect(parseAmountToMinor('19,90', 'EUR')).toBe(1990)
    expect(parseAmountToMinor('19.90', 'EUR')).toBe(1990)
    expect(parseAmountToMinor('1 999', 'EUR')).toBe(199900)
  })

  it('respects a 0-decimal currency instead of assuming 100', () => {
    expect(currencyExponent('XOF')).toBe(0)
    expect(parseAmountToMinor('1500', 'XOF')).toBe(1500)
  })

  it('rounds to the nearest minor unit instead of truncating', () => {
    expect(parseAmountToMinor('19.999', 'EUR')).toBe(2000)
  })

  it('rejects anything that is not a plain positive number', () => {
    expect(parseAmountToMinor('', 'EUR')).toBeNull()
    expect(parseAmountToMinor('abc', 'EUR')).toBeNull()
    expect(parseAmountToMinor('-5', 'EUR')).toBeNull()
  })

  it('round-trips through the input format', () => {
    expect(minorToAmountInput(1990, 'EUR')).toBe('19.90')
    expect(minorToAmountInput(1500, 'XOF')).toBe('1500')
  })
})
