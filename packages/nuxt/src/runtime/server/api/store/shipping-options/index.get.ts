import { createError, defineEventHandler, getQuery } from 'h3'
import { requireCartAccess } from '../../../utils/cart'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/shipping-options?cart_id= — options eligible for the cart
// (zone match on its address, rules, product shipping profile) with price
// resolved (flat via pricing, calculated via the option's provider).
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cartId = typeof query.cart_id === 'string' ? query.cart_id : undefined
  if (!cartId) throw createError({ statusCode: 422, statusMessage: 'cart_id is required' })

  const { services } = usePygmalion()
  const cart = await services.cart.get(cartId)
  if (!cart) throw createError({ statusCode: 404, statusMessage: 'Cart not found' })
  requireCartAccess(event, cart)

  const shippingOptions = await services.shipping.listOptionsForCart({
    currencyCode: cart.currencyCode,
    regionId: cart.regionId,
    address: cart.shippingCountryCode
      ? {
          countryCode: cart.shippingCountryCode,
          province: cart.shippingProvince,
          city: cart.shippingCity,
          postalCode: cart.shippingPostalCode,
        }
      : null,
    items: cart.items.map((i) => ({ productId: i.productId, unitPrice: i.unitPrice, quantity: i.quantity })),
  })
  return { shippingOptions }
})
