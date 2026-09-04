import { setSupportedCurrenciesInput, updateStoreInput } from '@oumarbarry/pygmalion-core'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { usePygmalion } from '../utils/pygmalion'

// POST /api/admin/stores/:id — update (Medusa: POST = update). Accepts an
// optional `supportedCurrencies[]` alongside the plain fields, replacing the
// store's supported-currency set in the same call.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const { supportedCurrencies, ...fields } = body

  const parsed = updateStoreInput.safeParse(fields)
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid store', data: parsed.error.issues })
  }

  const { services } = usePygmalion()
  const store = await services.stores.update(id, parsed.data)
  if (!store) {
    throw createError({ statusCode: 404, statusMessage: 'Store not found' })
  }

  if (supportedCurrencies !== undefined) {
    const currenciesParsed = setSupportedCurrenciesInput.safeParse(supportedCurrencies)
    if (!currenciesParsed.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid supportedCurrencies',
        data: currenciesParsed.error.issues,
      })
    }
    await services.stores.setSupportedCurrencies(id, currenciesParsed.data)
  }

  return { store }
})
