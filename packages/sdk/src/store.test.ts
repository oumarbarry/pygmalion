import { beforeEach, describe, expect, it } from 'vitest'
import { createPygmalionClient } from './index'

const calls: { url: string; init: RequestInit }[] = []
const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
  calls.push({ url, init: init ?? {} })
  return Response.json({})
}
const s = createPygmalionClient({ fetch }).store

// Every store method, with the exact route it must hit. The server-side truth
// is `packages/nuxt/src/module.ts` — `routes.test.ts` checks these paths are
// really declared there; this table checks each *named* method hits the right
// one (a copy/paste onto a neighbouring resource passes the former alone).
const routes: [string, () => Promise<unknown>, string, string][] = [
  // Catalogue
  ['products.list', () => s.products.list(), 'GET', '/api/store/products'],
  ['products.get', () => s.products.get('prod_1'), 'GET', '/api/store/products/prod_1'],
  ['variants.list', () => s.variants.list({ product_id: 'prod_1' }), 'GET', '/api/store/product-variants'],
  ['collections.list', () => s.collections.list(), 'GET', '/api/store/collections'],
  ['collections.get', () => s.collections.get('pcol_1'), 'GET', '/api/store/collections/pcol_1'],
  ['collections.products', () => s.collections.products('pcol_1'), 'GET', '/api/store/collections/pcol_1/products'],
  ['categories.list', () => s.categories.list(), 'GET', '/api/store/product-categories'],
  ['categories.get', () => s.categories.get('pcat_1'), 'GET', '/api/store/product-categories/pcat_1'],
  ['categories.products', () => s.categories.products('pcat_1'), 'GET', '/api/store/product-categories/pcat_1/products'],
  ['tags.list', () => s.tags.list(), 'GET', '/api/store/product-tags'],
  ['tags.get', () => s.tags.get('ptag_1'), 'GET', '/api/store/product-tags/ptag_1'],
  ['tags.products', () => s.tags.products('ptag_1'), 'GET', '/api/store/product-tags/ptag_1/products'],
  // Référentiels
  ['regions.list', () => s.regions.list(), 'GET', '/api/store/regions'],
  ['regions.get', () => s.regions.get('reg_1'), 'GET', '/api/store/regions/reg_1'],
  ['currencies.list', () => s.currencies.list(), 'GET', '/api/store/currencies'],
  ['currencies.get', () => s.currencies.get('usd'), 'GET', '/api/store/currencies/usd'],
  // Panier
  ['carts.create', () => s.carts.create({ regionId: 'reg_1' }), 'POST', '/api/store/carts'],
  ['carts.get', () => s.carts.get('cart_1'), 'GET', '/api/store/carts/cart_1'],
  ['carts.update', () => s.carts.update('cart_1', { email: 'a@b.c' }), 'POST', '/api/store/carts/cart_1'],
  ['carts.addLineItem', () => s.carts.addLineItem('cart_1', { variantId: 'var_1', quantity: 1 }), 'POST', '/api/store/carts/cart_1/line-items'],
  ['carts.updateLineItem', () => s.carts.updateLineItem('cart_1', 'li_1', { quantity: 2 }), 'POST', '/api/store/carts/cart_1/line-items/li_1'],
  ['carts.removeLineItem', () => s.carts.removeLineItem('cart_1', 'li_1'), 'DELETE', '/api/store/carts/cart_1/line-items/li_1'],
  ['carts.setShippingMethod', () => s.carts.setShippingMethod('cart_1', { shippingOptionId: 'so_1' }), 'POST', '/api/store/carts/cart_1/shipping-methods'],
  ['carts.recalcTaxes', () => s.carts.recalcTaxes('cart_1'), 'POST', '/api/store/carts/cart_1/taxes'],
  ['carts.transferToCustomer', () => s.carts.transferToCustomer('cart_1'), 'POST', '/api/store/carts/cart_1/customer'],
  ['carts.addPromotions', () => s.carts.addPromotions('cart_1', { promotionCodes: ['X'] }), 'POST', '/api/store/carts/cart_1/promotions'],
  ['carts.removePromotions', () => s.carts.removePromotions('cart_1', { promotionCodes: ['X'] }), 'DELETE', '/api/store/carts/cart_1/promotions'],
  ['carts.complete', () => s.carts.complete('cart_1'), 'POST', '/api/store/carts/cart_1/complete'],
  // Expédition + paiement
  ['shippingOptions.list', () => s.shippingOptions.list({ cart_id: 'cart_1' }), 'GET', '/api/store/shipping-options'],
  ['paymentProviders.list', () => s.paymentProviders.list(), 'GET', '/api/store/payment-providers'],
  ['paymentCollections.create', () => s.paymentCollections.create({ cartId: 'cart_1' }), 'POST', '/api/store/payment-collections'],
  ['paymentCollections.createSession', () => s.paymentCollections.createSession('pcol_1'), 'POST', '/api/store/payment-collections/pcol_1/payment-sessions'],
  // Client
  ['customers.me', () => s.customers.me(), 'GET', '/api/store/customers/me'],
  ['customers.update', () => s.customers.update({ name: 'A' }), 'PATCH', '/api/store/customers/me'],
  ['customers.addresses.list', () => s.customers.addresses.list(), 'GET', '/api/store/customers/me/addresses'],
  ['customers.addresses.create', () => s.customers.addresses.create({ countryCode: 'US' }), 'POST', '/api/store/customers/me/addresses'],
  ['customers.addresses.get', () => s.customers.addresses.get('cadr_1'), 'GET', '/api/store/customers/me/addresses/cadr_1'],
  ['customers.addresses.update', () => s.customers.addresses.update('cadr_1', { city: 'X' }), 'PATCH', '/api/store/customers/me/addresses/cadr_1'],
  ['customers.addresses.remove', () => s.customers.addresses.remove('cadr_1'), 'DELETE', '/api/store/customers/me/addresses/cadr_1'],
  // Commandes + retours
  ['orders.list', () => s.orders.list(), 'GET', '/api/store/orders'],
  ['orders.get', () => s.orders.get('order_1'), 'GET', '/api/store/orders/order_1'],
  ['returnReasons.list', () => s.returnReasons.list(), 'GET', '/api/store/return-reasons'],
  ['returnReasons.get', () => s.returnReasons.get('rr_1'), 'GET', '/api/store/return-reasons/rr_1'],
  ['returns.create', () => s.returns.create({ orderId: 'order_1', items: [{ lineItemId: 'oli_1', quantity: 1 }] }), 'POST', '/api/store/returns'],
  // Auth client (better-auth, namespace /api/auth/**)
  ['auth.signUp', () => s.auth.signUp({ email: 'a@b.c', password: 'x' }), 'POST', '/api/auth/sign-up/email'],
  ['auth.signIn', () => s.auth.signIn({ email: 'a@b.c', password: 'x' }), 'POST', '/api/auth/sign-in/email'],
  ['auth.signOut', () => s.auth.signOut(), 'POST', '/api/auth/sign-out'],
  ['auth.session', () => s.auth.session(), 'GET', '/api/auth/get-session'],
]

describe('store resources', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it.each(routes)('%s hits %s %s', async (_name, call, method, path) => {
    await call()

    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe(method)
    expect(calls[0].url.split('?')[0]).toBe(path)
  })

  it('passes list/price query params through', async () => {
    await s.products.list({ limit: 5, q: 'mug', 'category_id[]': ['pcat_1'] })
    await s.products.get('prod_1', { region_id: 'reg_1' })

    expect(calls[0].url).toBe('/api/store/products?limit=5&q=mug&category_id%5B%5D=pcat_1')
    expect(calls[1].url).toBe('/api/store/products/prod_1?region_id=reg_1')
  })

  it('sends the body verbatim — the SDK never reshapes a payload', async () => {
    await s.carts.addLineItem('cart_1', { variantId: 'var_1', quantity: 3 })

    expect(calls[0].init.body).toBe('{"variantId":"var_1","quantity":3}')
  })
})
