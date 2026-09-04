import { describe, expect, it } from 'vitest'
import { deriveFulfillmentStatus } from './checkout'

// Single source of truth: fulfillment_status is DERIVED from the per-line
// fulfilled/shipped/delivered aggregates, never a stored mutable column.
// Priority: delivered > shipped > fulfilled, each with a
// partial_* variant, and "any line not fully fulfilled => never 100%".

describe('deriveFulfillmentStatus (order-level, derived)', () => {
  it('not_fulfilled when nothing is fulfilled', () => {
    expect(deriveFulfillmentStatus([{ quantity: 2, fulfilled: 0, shipped: 0, delivered: 0 }])).toBe('not_fulfilled')
  })

  it('partially_fulfilled when some but not all units are fulfilled', () => {
    expect(deriveFulfillmentStatus([{ quantity: 3, fulfilled: 1, shipped: 0, delivered: 0 }])).toBe('partially_fulfilled')
  })

  it('fulfilled when every unit is fulfilled', () => {
    expect(deriveFulfillmentStatus([{ quantity: 2, fulfilled: 2, shipped: 0, delivered: 0 }])).toBe('fulfilled')
  })

  it('partially_fulfilled across lines when one line is untouched (guard: never 100%)', () => {
    expect(
      deriveFulfillmentStatus([
        { quantity: 2, fulfilled: 2, shipped: 0, delivered: 0 },
        { quantity: 1, fulfilled: 0, shipped: 0, delivered: 0 },
      ]),
    ).toBe('partially_fulfilled')
  })

  it('partially_shipped when some units are shipped', () => {
    expect(deriveFulfillmentStatus([{ quantity: 3, fulfilled: 3, shipped: 1, delivered: 0 }])).toBe('partially_shipped')
  })

  it('shipped when all units are shipped', () => {
    expect(deriveFulfillmentStatus([{ quantity: 2, fulfilled: 2, shipped: 2, delivered: 0 }])).toBe('shipped')
  })

  it('partially_delivered when some units are delivered', () => {
    expect(deriveFulfillmentStatus([{ quantity: 2, fulfilled: 2, shipped: 2, delivered: 1 }])).toBe('partially_delivered')
  })

  it('delivered when all units are delivered (highest priority)', () => {
    expect(deriveFulfillmentStatus([{ quantity: 2, fulfilled: 2, shipped: 2, delivered: 2 }])).toBe('delivered')
  })

  it('not_fulfilled for an order with no lines', () => {
    expect(deriveFulfillmentStatus([])).toBe('not_fulfilled')
  })
})
