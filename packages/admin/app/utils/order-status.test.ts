import { describe, expect, it } from 'vitest'
import {
  capturable,
  editableLines,
  fulfillmentAbilities,
  leftToCollect,
  matchesSearch,
  matchesTab,
  nextStep,
  orderAbilities,
  outstanding,
  refundable,
  remainingToFulfill,
  returnAbilities,
  returnableByLine,
  rmaAbilities,
  shippedByLine,
  type OrderDetail,
  type OrderFulfillment,
  type OrderReturn,
} from './order-status'

// The admin state machine must never offer an invalid transition.
// These assert the guards mirror the server ones; a divergence here means a
// button appears for a call that would 500.

function order(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'ord_1',
    displayId: 1,
    status: 'pending',
    email: 'buyer@test.dev',
    customerId: null,
    currencyCode: 'eur',
    total: 3000,
    isDraftOrder: false,
    createdAt: '2026-07-01T10:00:00.000Z',
    canceledAt: null,
    itemsSubtotal: 3000,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    items: [{ id: 'li_1', productId: null, variantId: 'var_1', title: 'Mug', sku: null, thumbnail: null, unitPrice: 1000, quantity: 3, subtotal: 3000, discountTotal: 0, taxTotal: 0, total: 3000 }],
    shippingMethods: [],
    shippingAddress: null,
    billingAddress: null,
    transactions: [],
    paymentCollections: [],
    authorizedAmount: 3000,
    capturedAmount: 0,
    refundedAmount: 0,
    paymentStatus: 'authorized',
    fulfillmentStatus: 'not_fulfilled',
    fulfillments: [],
    ...over,
  }
}

function fulfillment(over: Partial<OrderFulfillment> = {}): OrderFulfillment {
  return {
    id: 'ful_1',
    status: 'fulfilled',
    locationId: 'sloc_1',
    packedAt: '2026-07-02T10:00:00.000Z',
    shippedAt: null,
    deliveredAt: null,
    canceledAt: null,
    createdAt: '2026-07-02T10:00:00.000Z',
    items: [{ id: 'fi_1', lineItemId: 'li_1', title: 'Mug', sku: null, quantity: 2 }],
    ...over,
  }
}

const ret = (over: Partial<OrderReturn> = {}): OrderReturn => ({
  id: 'ret_1',
  orderId: 'ord_1',
  exchangeId: null,
  claimId: null,
  status: 'requested',
  locationId: null,
  refundAmount: null,
  requestedAt: '2026-07-03T10:00:00.000Z',
  receivedAt: null,
  canceledAt: null,
  createdAt: '2026-07-03T10:00:00.000Z',
  items: [{ id: 'ri_1', lineItemId: 'li_1', reasonId: null, requestedQuantity: 1, receivedQuantity: 0, damagedQuantity: 0, note: null }],
  ...over,
})

describe('per-line quantities', () => {
  it('counts only non-canceled fulfillments as prepared', () => {
    const o = order({ fulfillments: [fulfillment(), fulfillment({ id: 'ful_2', canceledAt: '2026-07-03T10:00:00.000Z', items: [{ id: 'fi_2', lineItemId: 'li_1', title: 'Mug', sku: null, quantity: 1 }] })] })
    expect(remainingToFulfill(o).get('li_1')).toBe(1)
  })

  it('counts only shipped fulfillments as shipped', () => {
    expect(shippedByLine(order({ fulfillments: [fulfillment()] })).get('li_1')).toBeUndefined()
    expect(shippedByLine(order({ fulfillments: [fulfillment({ shippedAt: '2026-07-03T10:00:00.000Z' })] })).get('li_1')).toBe(2)
  })

  it('returnable = shipped − already requested on live returns', () => {
    const o = order({ fulfillments: [fulfillment({ shippedAt: '2026-07-03T10:00:00.000Z' })] })
    expect(returnableByLine(o, []).get('li_1')).toBe(2)
    expect(returnableByLine(o, [ret()]).get('li_1')).toBe(1)
    expect(returnableByLine(o, [ret({ status: 'canceled' })]).get('li_1')).toBe(2)
  })

  it('a line with fulfilled units can no longer be edited', () => {
    expect(editableLines(order()).length).toBe(1)
    expect(editableLines(order({ fulfillments: [fulfillment()] })).length).toBe(0)
  })
})

describe('money caps', () => {
  it('caps capture at authorized − captured and refund at captured − refunded', () => {
    const o = order({ authorizedAmount: 3000, capturedAmount: 1000, refundedAmount: 400 })
    expect(capturable(o)).toBe(2000)
    expect(refundable(o)).toBe(600)
    expect(outstanding(o)).toBe(0)
  })

  it('outstanding = total not covered by an authorization NOR by an already-open collection', () => {
    expect(outstanding(order({ total: 5000, authorizedAmount: 3000 }))).toBe(2000)
    // An order edit opens the extra collection itself: offering to open another
    // would be refused by the server.
    const withOpen = order({ total: 5000, authorizedAmount: 3000, paymentCollections: [{ id: 'pc_1', amount: 2000, currencyCode: 'eur', status: 'not_paid', createdAt: '2026-07-02T10:00:00.000Z' }] })
    expect(outstanding(withOpen)).toBe(0)
    expect(leftToCollect(withOpen)).toBe(5000) // still 5000 to actually pocket
  })

  it('never goes negative', () => {
    const o = order({ authorizedAmount: 0, capturedAmount: 0, refundedAmount: 0, total: 0 })
    expect([capturable(o), refundable(o), outstanding(o)]).toEqual([0, 0, 0])
  })
})

describe('order abilities', () => {
  it('a canceled order offers nothing but un-archiving nothing', () => {
    const a = orderAbilities(order({ status: 'canceled', authorizedAmount: 0 }))
    expect([a.canShip, a.canCapture, a.canReturn, a.canEdit, a.canCancel, a.canArchive]).toEqual([false, false, false, false, false, false])
  })

  it('an archived order cannot be shipped but can be unarchived', () => {
    const a = orderAbilities(order({ status: 'archived' }))
    expect(a.canShip).toBe(false)
    expect(a.canUnarchive).toBe(true)
  })

  it('refuses cancel with active fulfillments, and says why', () => {
    const a = orderAbilities(order({ fulfillments: [fulfillment()] }))
    expect(a.canCancel).toBe(false)
    expect(a.cancelBlocked).toBe('whyNoCancelFulfillments')
  })

  it('refuses cancel while captured funds are not refunded', () => {
    const a = orderAbilities(order({ capturedAmount: 3000 }))
    expect(a.canCancel).toBe(false)
    expect(a.cancelBlocked).toBe('whyNoCancelCaptured')
  })

  it('refuses cancel on a completed order', () => {
    expect(orderAbilities(order({ status: 'completed' })).cancelBlocked).toBe('whyNoCancelCompleted')
  })

  it('offers a return only once something shipped', () => {
    expect(orderAbilities(order()).canReturn).toBe(false)
    expect(orderAbilities(order({ fulfillments: [fulfillment({ shippedAt: '2026-07-03T10:00:00.000Z' })] })).canReturn).toBe(true)
  })

  it('offers an extra collection only when the total exceeds what is authorized', () => {
    expect(orderAbilities(order()).canCollectMore).toBe(false)
    expect(orderAbilities(order({ total: 5000 })).canCollectMore).toBe(true)
  })

  it('buckets an order with an open extra collection as still to collect', () => {
    const edited = order({ total: 5000, capturedAmount: 3000, paymentCollections: [{ id: 'pc_1', amount: 2000, currencyCode: 'eur', status: 'not_paid', createdAt: '2026-07-02T10:00:00.000Z' }] })
    expect(matchesTab(edited, 'toCollect', false)).toBe(true)
    expect(orderAbilities(edited).canCollectMore).toBe(false)
  })
})

describe('fulfillment / return / rma abilities', () => {
  it('ships once, delivers after shipping, cancels only before shipping', () => {
    expect(fulfillmentAbilities(fulfillment())).toEqual({ canShip: true, canDeliver: false, canCancel: true })
    const shipped = fulfillment({ shippedAt: '2026-07-03T10:00:00.000Z' })
    expect(fulfillmentAbilities(shipped)).toEqual({ canShip: false, canDeliver: true, canCancel: false })
    const delivered = fulfillment({ shippedAt: '2026-07-03T10:00:00.000Z', deliveredAt: '2026-07-04T10:00:00.000Z' })
    expect(fulfillmentAbilities(delivered)).toEqual({ canShip: false, canDeliver: false, canCancel: false })
  })

  it('receives while units remain, cancels only an untouched standalone return', () => {
    expect(returnAbilities(ret())).toEqual({ canReceive: true, canCancel: true })
    expect(returnAbilities(ret({ status: 'partially_received' }))).toEqual({ canReceive: true, canCancel: false })
    expect(returnAbilities(ret({ exchangeId: 'exc_1' })).canCancel).toBe(false)
    expect(returnAbilities(ret({ status: 'received' })).canReceive).toBe(false)
  })

  it('closes an exchange only once its inbound return is fully received', () => {
    expect(rmaAbilities('requested', ret()).canComplete).toBe(false)
    expect(rmaAbilities('requested', ret()).completeBlocked).toBe('whyNoExchangeComplete')
    expect(rmaAbilities('requested', ret({ status: 'received' })).canComplete).toBe(true)
    expect(rmaAbilities('completed', ret({ status: 'received' })).canCancel).toBe(false)
  })
})

describe('next step and list tabs', () => {
  it('puts an open return first, then money, then goods', () => {
    expect(nextStep(order(), [ret()])).toBe('receiveReturn')
    expect(nextStep(order())).toBe('capture')
    expect(nextStep(order({ capturedAmount: 3000 }))).toBe('ship')
    const shipped = order({ capturedAmount: 3000, fulfillments: [fulfillment({ shippedAt: '2026-07-03T10:00:00.000Z', items: [{ id: 'fi_1', lineItemId: 'li_1', title: 'Mug', sku: null, quantity: 3 }] })] })
    expect(nextStep(shipped)).toBe('deliver')
    expect(nextStep(order({ status: 'canceled' }))).toBe(null)
  })

  it('buckets orders by action, never by raw status', () => {
    const o = order()
    expect(matchesTab(o, 'toShip', false)).toBe(true)
    expect(matchesTab(o, 'toCollect', false)).toBe(true)
    expect(matchesTab(o, 'returns', false)).toBe(false)
    expect(matchesTab(o, 'returns', true)).toBe(true)
    expect(matchesTab(order({ status: 'canceled' }), 'toShip', false)).toBe(false)
    expect(matchesTab(order({ status: 'canceled' }), 'all', false)).toBe(true)
  })

  it('searches on number and email', () => {
    const o = order()
    expect(matchesSearch(o, '')).toBe(true)
    expect(matchesSearch(o, '1')).toBe(true)
    expect(matchesSearch(o, 'BUYER@')).toBe(true)
    expect(matchesSearch(o, 'nope')).toBe(false)
  })
})
