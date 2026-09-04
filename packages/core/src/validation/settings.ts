import { z } from 'zod'

const metadata = z.record(z.string(), z.unknown()).nullable().optional()
const iso2 = z.string().trim().length(2).toUpperCase()

// --- Store --------------------------------------------------------------

export const updateStoreInput = z.object({
  name: z.string().trim().min(1).optional(),
  defaultRegionId: z.string().nullable().optional(),
  defaultSalesChannelId: z.string().nullable().optional(),
  defaultLocationId: z.string().nullable().optional(),
  metadata,
})
export type UpdateStoreInput = z.input<typeof updateStoreInput>

export const setSupportedCurrenciesInput = z.array(
  z.object({
    code: z.string().trim().toLowerCase(),
    isDefault: z.boolean().optional(),
  }),
)
export type SetSupportedCurrenciesInput = z.input<typeof setSupportedCurrenciesInput>

// --- Region ---------------------------------------------------------------

export const createRegionInput = z.object({
  name: z.string().trim().min(1),
  currencyCode: z.string().trim().toLowerCase().min(1),
  automaticTaxes: z.boolean().optional(),
  metadata,
  countries: z.array(iso2).optional(),
})
export type CreateRegionInput = z.input<typeof createRegionInput>

export const updateRegionInput = z.object({
  name: z.string().trim().min(1).optional(),
  currencyCode: z.string().trim().toLowerCase().min(1).optional(),
  automaticTaxes: z.boolean().optional(),
  metadata,
  countries: z.array(iso2).optional(),
})
export type UpdateRegionInput = z.input<typeof updateRegionInput>

// --- PricePreference --------------------------------------------------------
// Ported as-is from Medusa: the column stays
// free text, but the app restricts input to the only two attributes Medusa's
// own service ever reads.

export const pricePreferenceAttribute = z.enum(['region_id', 'currency_code'])

export const createPricePreferenceInput = z.object({
  attribute: pricePreferenceAttribute,
  value: z.string().trim().min(1).nullable().optional(),
  isTaxInclusive: z.boolean().optional(),
})
export type CreatePricePreferenceInput = z.input<typeof createPricePreferenceInput>

export const updatePricePreferenceInput = z.object({
  isTaxInclusive: z.boolean(),
})
export type UpdatePricePreferenceInput = z.input<typeof updatePricePreferenceInput>
