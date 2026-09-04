import { describe, expect, it } from 'vitest'
import { allocate, sumCents } from './money'

describe('sumCents', () => {
  it('adds cents', () => {
    expect(sumCents([100, 250, 3])).toBe(353)
  })
  it('is 0 for empty', () => {
    expect(sumCents([])).toBe(0)
  })
})

describe('allocate (largest remainder)', () => {
  it('preserves the total exactly', () => {
    expect(sumCents(allocate(100, [1, 1, 1]))).toBe(100)
    expect(sumCents(allocate(100, [1, 1, 1, 1, 1, 1]))).toBe(100)
    expect(sumCents(allocate(5, [1, 1]))).toBe(5)
    expect(sumCents(allocate(9999, [7, 3, 11, 1]))).toBe(9999)
  })

  it('gives the extra cent to the largest fractional remainder (ties: lower index)', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(5, [1, 1])).toEqual([3, 2])
    expect(allocate(100, [1, 1, 1, 1, 1, 1])).toEqual([17, 17, 17, 17, 16, 16])
  })

  it('respects proportional weights', () => {
    expect(allocate(10, [2, 1])).toEqual([7, 3])
  })

  it('gives zero to zero-weight buckets', () => {
    expect(allocate(10, [0, 1])).toEqual([0, 10])
  })

  it('handles a zero amount', () => {
    expect(allocate(0, [1, 2, 3])).toEqual([0, 0, 0])
  })

  it('never loses a cent under fuzzing', () => {
    for (let i = 0; i < 500; i++) {
      const amount = Math.floor(Math.random() * 100000)
      const n = 1 + Math.floor(Math.random() * 8)
      const weights = Array.from({ length: n }, () => Math.floor(Math.random() * 10))
      if (sumCents(weights) === 0) continue
      const parts = allocate(amount, weights)
      expect(sumCents(parts)).toBe(amount)
      expect(parts.every((p) => p >= 0)).toBe(true)
    }
  })

  it('throws when weights sum to zero but amount is non-zero', () => {
    expect(() => allocate(10, [0, 0])).toThrow()
  })
})
