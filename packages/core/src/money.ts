// All amounts are integer minor units (cents). Never floats for storage.

export function sumCents(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/**
 * Split `amount` cents across buckets proportional to `weights`, using the
 * largest-remainder method so the parts sum back to `amount` exactly — no cent
 * is ever created or lost. Leftover cents go to the largest fractional
 * remainders; ties break toward the lower index (stable, deterministic).
 *
 * `amount` is a non-negative integer; `weights` are non-negative and must not
 * all be zero when `amount > 0`.
 */
export function allocate(amount: number, weights: number[]): number[] {
  const total = sumCents(weights)
  if (total === 0) {
    if (amount === 0) return weights.map(() => 0)
    throw new Error('allocate: weights sum to zero but amount is non-zero')
  }

  const floors = weights.map((w) => Math.floor((amount * w) / total))
  let leftover = amount - sumCents(floors)

  // Rank buckets by fractional remainder (desc), tie-break by index (asc).
  const order = weights
    .map((w, i) => ({ i, frac: (amount * w) / total - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  const result = floors.slice()
  for (const { i } of order) {
    if (leftover <= 0) break
    result[i] += 1
    leftover -= 1
  }
  return result
}
