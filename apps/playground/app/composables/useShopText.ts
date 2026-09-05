import { SHOP_LOCALE_COOKIE, shopLocaleFrom, shopText, type ShopLocale, type ShopTextKey } from '../utils/shop-text'
import { formatMoney } from '../utils/storefront'

/**
 * The shopper's language, SSR-safe. A cookie when the visitor picked one,
 * otherwise the browser's preference (`Accept-Language` on the server,
 * `navigator.language` in the browser), English by default. `useState`
 * carries the value resolved on the server into hydration, so both renders
 * agree.
 */
export function useShopText() {
  const cookie = useCookie<ShopLocale | undefined>(SHOP_LOCALE_COOKIE, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  const locale = useState<ShopLocale>('shop:locale', () => {
    if (cookie.value === 'en' || cookie.value === 'fr') return cookie.value
    const preferred = import.meta.server
      ? useRequestHeaders(['accept-language'])['accept-language']
      : globalThis.navigator?.language
    return shopLocaleFrom(preferred)
  })
  /** BCP-47 tag for `Intl`: money and dates follow the displayed language. */
  const tag = computed(() => (locale.value === 'fr' ? 'fr-FR' : 'en-US'))
  const plural = computed(() => new Intl.PluralRules(tag.value))

  function t(key: ShopTextKey): string {
    return shopText[locale.value][key]
  }

  /** `t()` with `{name}` placeholders filled from `params`. */
  function tf(key: ShopTextKey, params: Record<string, string | number>): string {
    return t(key).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
  }

  function setLocale(next: ShopLocale) {
    locale.value = next
    cookie.value = next
  }

  return {
    locale,
    tag,
    t,
    tf,
    setLocale,
    /** Picks the `...One` / `...Other` key: French says "one" for 0 too, English does not. */
    one: (count: number) => plural.value.select(count) === 'one',
    money: (amount: number | null | undefined, currency: string | null | undefined) =>
      formatMoney(amount, currency, tag.value),
    formatDate: (date: string | Date) =>
      new Date(date).toLocaleDateString(tag.value, { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}
