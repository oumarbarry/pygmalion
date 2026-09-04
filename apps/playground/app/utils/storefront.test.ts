import { describe, expect, it } from 'vitest'
import { formatMoney, orderHeadline, priceFrom, variantForOptions } from './storefront'

describe('formatMoney', () => {
  it('divides by the currency exponent, never by a hardcoded 100', () => {
    expect(formatMoney(5900, 'eur')).toMatch(/59,00/)
    expect(formatMoney(5900, 'usd')).toMatch(/59,00/)
    // 0-decimal currency: 5900 JPY is 5900 yen, not 59.
    expect(formatMoney(5900, 'jpy').replace(/\s/g, '')).toMatch(/5900/)
  })

  it('is total about a missing amount instead of printing 0,00', () => {
    expect(formatMoney(null, 'eur')).toBe('—')
    expect(formatMoney(undefined, 'eur')).toBe('—')
  })

  it('survives a bad currency code rather than throwing mid-render', () => {
    // Intl accepts any well-formed 3-letter code and just prints it…
    expect(formatMoney(1234, 'zzz')).toContain('ZZZ')
    // …and throws on a malformed one, which the fallback catches.
    expect(formatMoney(1234, 'x')).toBe('12.34 X')
  })
})

describe('priceFrom', () => {
  const priced = (n: number | null) => ({ calculatedPrice: n === null ? null : { calculatedAmount: n } })

  it('takes the cheapest priced variant', () => {
    expect(priceFrom([priced(5900), priced(4400), priced(6900)])).toBe(4400)
  })

  it('ignores variants with no resolved price, and gives null when none has one', () => {
    expect(priceFrom([priced(null), priced(2900)])).toBe(2900)
    expect(priceFrom([priced(null)])).toBeNull()
    expect(priceFrom(undefined)).toBeNull()
  })
})

describe('variantForOptions', () => {
  // Couleur x Taille -> 4 variants.
  const variants = [
    { id: 'v_blue_s', optionValueIds: ['blue', 's'] },
    { id: 'v_blue_l', optionValueIds: ['blue', 'l'] },
    { id: 'v_red_s', optionValueIds: ['red', 's'] },
    { id: 'v_red_l', optionValueIds: ['red', 'l'] },
  ]

  it('matches the variant carrying every chosen value', () => {
    expect(variantForOptions(variants, { couleur: 'red', taille: 'l' }, 2)?.id).toBe('v_red_l')
  })

  it('is null while the choice is incomplete — that is what disables "Ajouter"', () => {
    expect(variantForOptions(variants, { couleur: 'red' }, 2)).toBeNull()
    expect(variantForOptions(variants, {}, 2)).toBeNull()
  })

  it('is null for a combination no variant exists for', () => {
    expect(variantForOptions(variants.slice(0, 2), { couleur: 'red', taille: 'l' }, 2)).toBeNull()
  })

  it('resolves a single-option product on one choice', () => {
    expect(variantForOptions([{ id: 'v1', optionValueIds: ['bleu'] }], { couleur: 'bleu' }, 1)?.id).toBe('v1')
  })
})

describe('orderHeadline', () => {
  it('leads with the parcel once the money is settled', () => {
    expect(orderHeadline({ status: 'pending', paymentStatus: 'captured', fulfillmentStatus: 'shipped' }).label).toBe('Expédiée')
    expect(orderHeadline({ status: 'pending', paymentStatus: 'authorized', fulfillmentStatus: 'delivered' }).label).toBe('Livrée')
  })

  it('an unpaid or cancelled order outranks where the parcel is', () => {
    expect(orderHeadline({ status: 'canceled', paymentStatus: 'captured', fulfillmentStatus: 'shipped' }).label).toBe('Annulée')
    expect(orderHeadline({ status: 'pending', paymentStatus: 'not_paid', fulfillmentStatus: 'shipped' }).tone).toBe('warning')
  })

  it('falls back to "en préparation" when no shipment status is known', () => {
    expect(orderHeadline({ status: 'pending', paymentStatus: 'captured' }).label).toBe('En préparation')
  })
})
