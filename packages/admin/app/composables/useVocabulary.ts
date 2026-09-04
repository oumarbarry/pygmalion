import { defaultLocale, vocabulary, type Locale, type VocabKey } from '../utils/vocabulary'

/**
 * The one place every screen goes through for user-facing
 * text. `useState` keeps the chosen locale shared app-wide (client-only,
 * /admin/** is ssr:false) without needing a routing-aware i18n module.
 */
export function useVocabulary() {
  const locale = useState<Locale>('admin-locale', () => defaultLocale)

  function t(key: VocabKey): string {
    return vocabulary[locale.value][key]
  }

  function setLocale(next: Locale) {
    locale.value = next
  }

  return { locale, t, setLocale }
}

/**
 * BCP-47 tag for the chosen admin language.
 *
 * `Intl` was called with `undefined` everywhere, i.e. the *browser's* locale:
 * a French admin on an en-US machine printed "€43.20" and "27 Jul 2026".
 * Money and dates now follow the language the admin is displayed in.
 */
const bcp47: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' }

export function useAdminFormat() {
  const { locale } = useVocabulary()
  const tag = computed(() => bcp47[locale.value])

  return {
    tag,
    money: (cents: number, currency: string) => {
      try {
        return new Intl.NumberFormat(tag.value, { style: 'currency', currency }).format(cents / 100)
      } catch {
        // Unknown/invalid currency code — never let a formatting error break a page.
        return `${(cents / 100).toFixed(2)} ${currency}`
      }
    },
    formatDate: (iso: string) =>
      new Date(iso).toLocaleDateString(tag.value, { day: '2-digit', month: 'short', year: 'numeric' }),
    formatDateTime: (iso: string) =>
      new Date(iso).toLocaleString(tag.value, {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
  }
}
