import { createError, defineEventHandler, getRouterParam } from 'h3'
import { storeVariants } from '../../../utils/store-catalog'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/store/products/:id?region_id=|currency_code= — public storefront
// detail. Published only. Carries its variants WITH their calculated price:
// without them a storefront has no `variantId` to post to
// /store/carts/:id/line-items, and no price to display.
//
// `images` and `options` ride along too. A product page is a gallery plus
// a "size / colour" picker; without the image rows there is nothing but the
// thumbnail to show, and without the options (+ their values) the variant list
// is an opaque set of titles the shopper has to decode. Both are plain reads of
// rows the product already owns; no new endpoint.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { services } = usePygmalion()
  const product = await services.products.get(id, { status: 'published' })
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  const [variants, images, options] = await Promise.all([
    storeVariants(event, id),
    services.products.images.list(id),
    services.products.options.list(id),
  ])
  return { product: { ...product, variants, images, options } }
})
