import { asc, eq, ilike, or } from 'drizzle-orm'
import { currencies, type Currency } from '../schema/settings'
import type { ServiceContext } from './context'

// ponytail: seeded with the common ~40 trading currencies, not the full ~150-row ISO
// 4217 table. Real data (name/symbol/decimal_digits), just not
// exhaustive. Extend this list (or load a fuller ISO 4217 source) if a store
// needs a currency that isn't here.
export const CURRENCY_SEED: readonly Currency[] = [
  { code: 'usd', symbol: '$', symbolNative: '$', name: 'US Dollar', decimalDigits: 2, rounding: 0 },
  { code: 'eur', symbol: '€', symbolNative: '€', name: 'Euro', decimalDigits: 2, rounding: 0 },
  { code: 'gbp', symbol: '£', symbolNative: '£', name: 'British Pound', decimalDigits: 2, rounding: 0 },
  { code: 'jpy', symbol: '¥', symbolNative: '¥', name: 'Japanese Yen', decimalDigits: 0, rounding: 0 },
  { code: 'cad', symbol: 'CA$', symbolNative: '$', name: 'Canadian Dollar', decimalDigits: 2, rounding: 0 },
  { code: 'aud', symbol: 'AU$', symbolNative: '$', name: 'Australian Dollar', decimalDigits: 2, rounding: 0 },
  { code: 'chf', symbol: 'CHF', symbolNative: 'CHF', name: 'Swiss Franc', decimalDigits: 2, rounding: 5 },
  { code: 'cny', symbol: 'CN¥', symbolNative: '¥', name: 'Chinese Yuan', decimalDigits: 2, rounding: 0 },
  { code: 'inr', symbol: '₹', symbolNative: '₹', name: 'Indian Rupee', decimalDigits: 2, rounding: 0 },
  { code: 'mxn', symbol: 'MX$', symbolNative: '$', name: 'Mexican Peso', decimalDigits: 2, rounding: 0 },
  { code: 'brl', symbol: 'R$', symbolNative: 'R$', name: 'Brazilian Real', decimalDigits: 2, rounding: 0 },
  { code: 'sek', symbol: 'Skr', symbolNative: 'kr', name: 'Swedish Krona', decimalDigits: 2, rounding: 0 },
  { code: 'nok', symbol: 'Nkr', symbolNative: 'kr', name: 'Norwegian Krone', decimalDigits: 2, rounding: 0 },
  { code: 'dkk', symbol: 'Dkr', symbolNative: 'kr', name: 'Danish Krone', decimalDigits: 2, rounding: 0 },
  { code: 'pln', symbol: 'zł', symbolNative: 'zł', name: 'Polish Zloty', decimalDigits: 2, rounding: 0 },
  { code: 'nzd', symbol: 'NZ$', symbolNative: '$', name: 'New Zealand Dollar', decimalDigits: 2, rounding: 0 },
  { code: 'sgd', symbol: 'S$', symbolNative: '$', name: 'Singapore Dollar', decimalDigits: 2, rounding: 0 },
  { code: 'hkd', symbol: 'HK$', symbolNative: '$', name: 'Hong Kong Dollar', decimalDigits: 2, rounding: 0 },
  { code: 'krw', symbol: '₩', symbolNative: '₩', name: 'South Korean Won', decimalDigits: 0, rounding: 0 },
  { code: 'zar', symbol: 'ZAR', symbolNative: 'R', name: 'South African Rand', decimalDigits: 2, rounding: 0 },
  { code: 'thb', symbol: '฿', symbolNative: '฿', name: 'Thai Baht', decimalDigits: 2, rounding: 0 },
  { code: 'try', symbol: 'TL', symbolNative: 'TL', name: 'Turkish Lira', decimalDigits: 2, rounding: 0 },
  { code: 'aed', symbol: 'AED', symbolNative: 'د.إ', name: 'UAE Dirham', decimalDigits: 2, rounding: 0 },
  { code: 'sar', symbol: 'SAR', symbolNative: 'ر.س', name: 'Saudi Riyal', decimalDigits: 2, rounding: 0 },
  { code: 'ils', symbol: '₪', symbolNative: '₪', name: 'Israeli New Shekel', decimalDigits: 2, rounding: 0 },
  { code: 'rub', symbol: 'RUB', symbolNative: '₽', name: 'Russian Ruble', decimalDigits: 2, rounding: 0 },
  { code: 'idr', symbol: 'Rp', symbolNative: 'Rp', name: 'Indonesian Rupiah', decimalDigits: 0, rounding: 0 },
  { code: 'php', symbol: '₱', symbolNative: '₱', name: 'Philippine Peso', decimalDigits: 2, rounding: 0 },
  { code: 'myr', symbol: 'RM', symbolNative: 'RM', name: 'Malaysian Ringgit', decimalDigits: 2, rounding: 0 },
  { code: 'vnd', symbol: '₫', symbolNative: '₫', name: 'Vietnamese Dong', decimalDigits: 0, rounding: 0 },
  { code: 'czk', symbol: 'Kč', symbolNative: 'Kč', name: 'Czech Koruna', decimalDigits: 2, rounding: 0 },
  { code: 'huf', symbol: 'Ft', symbolNative: 'Ft', name: 'Hungarian Forint', decimalDigits: 0, rounding: 0 },
  { code: 'ron', symbol: 'RON', symbolNative: 'lei', name: 'Romanian Leu', decimalDigits: 2, rounding: 0 },
  { code: 'clp', symbol: 'CL$', symbolNative: '$', name: 'Chilean Peso', decimalDigits: 0, rounding: 0 },
  { code: 'cop', symbol: 'CO$', symbolNative: '$', name: 'Colombian Peso', decimalDigits: 2, rounding: 0 },
  { code: 'ars', symbol: 'AR$', symbolNative: '$', name: 'Argentine Peso', decimalDigits: 2, rounding: 0 },
  { code: 'twd', symbol: 'NT$', symbolNative: '$', name: 'New Taiwan Dollar', decimalDigits: 0, rounding: 0 },
  { code: 'egp', symbol: 'EGP', symbolNative: 'ج.م', name: 'Egyptian Pound', decimalDigits: 2, rounding: 0 },
  { code: 'ngn', symbol: '₦', symbolNative: '₦', name: 'Nigerian Naira', decimalDigits: 2, rounding: 0 },
  { code: 'kes', symbol: 'Ksh', symbolNative: 'Ksh', name: 'Kenyan Shilling', decimalDigits: 2, rounding: 0 },
]

export interface ListCurrenciesOptions {
  limit?: number
  offset?: number
  q?: string
}

export function createCurrenciesService(ctx: ServiceContext) {
  return {
    async list({ limit = 20, offset = 0, q }: ListCurrenciesOptions = {}) {
      const where = q ? or(ilike(currencies.name, `%${q}%`), ilike(currencies.code, `%${q}%`)) : undefined
      return ctx.db.select().from(currencies).where(where).orderBy(asc(currencies.code)).limit(limit).offset(offset)
    },

    async get(code: string) {
      const [row] = await ctx.db
        .select()
        .from(currencies)
        .where(eq(currencies.code, code.toLowerCase()))
        .limit(1)
      return row ?? null
    },

    // Read-only reference table (spec: "jamais émis en pratique" — no
    // currency.* events). Idempotent: safe to call on every boot.
    async seed() {
      if (CURRENCY_SEED.length === 0) return
      await ctx.db.insert(currencies).values(CURRENCY_SEED as Currency[]).onConflictDoNothing({ target: currencies.code })
    },
  }
}

export type CurrenciesService = ReturnType<typeof createCurrenciesService>
