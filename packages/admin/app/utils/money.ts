/**
 * Money input <-> minor units (integer cents + currency code, never a
 * float). `PygMoney` renders; this parses what a merchant types. Pure, unit
 * tested next to this file.
 *
 * The exponent comes from `Intl` rather than a hardcoded 100 so a 0-decimal
 * currency (JPY, XOF — the latter matters for the target merchant) doesn't
 * silently become 100x its price.
 */
export function currencyExponent(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** '19,90' / '19.90' / '1 999' -> minor units. `null` when it isn't a number. */
export function parseAmountToMinor(input: string, currency: string): number | null {
  const normalized = input.replace(/[\s ]/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 10 ** currencyExponent(currency))
}

/** Minor units -> the string an input field shows ('1990' EUR -> '19.90'). */
export function minorToAmountInput(minor: number, currency: string): string {
  const exponent = currencyExponent(currency)
  return (minor / 10 ** exponent).toFixed(exponent)
}
