import { vocabulary, defaultLocale } from '../utils/vocabulary'

/**
 * Homogeneous error handling for every /api/admin/** call:
 * 401 -> bounce to sign-in (session expired), everything else -> one toast.
 * The staff session cookie is httpOnly and same-origin, so plain $fetch
 * already sends it — no manual header wiring needed.
 */
export default defineNuxtPlugin(() => {
  const toast = useToast()

  const adminFetch = $fetch.create({
    onResponseError({ response }) {
      // Read locale via useState directly (not useVocabulary) — plugin setup
      // runs once per app instance, outside a component's reactive template,
      // and this keeps the dependency one-directional (util -> here).
      const locale = useState('admin-locale', () => defaultLocale)
      const t = vocabulary[locale.value]

      if (response.status === 401) {
        navigateTo({ path: '/admin/sign-in', query: { redirect: useRoute().fullPath } })
        return
      }

      const data = response._data as { statusMessage?: string; message?: string } | undefined
      toast.add({
        title: t.errorTitle,
        description: data?.statusMessage ?? data?.message ?? t.errorGeneric,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      })
    },
  })

  return { provide: { adminFetch } }
})
