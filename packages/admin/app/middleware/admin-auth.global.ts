import { getAuthClient } from '../utils/auth-client'

const PUBLIC_ADMIN_PATHS = ['/admin/sign-in', '/admin/first-boot', '/admin/accept-invite']

/**
 * Guards /admin/** only — this is a GLOBAL middleware, and once the admin
 * layer is extended into a host app it runs for every route in that app
 * (e.g. a storefront `/`), not just ours.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/admin')) return
  if (PUBLIC_ADMIN_PATHS.includes(to.path)) return

  const { data } = await getAuthClient().getSession()
  if (!data?.user) {
    return navigateTo({ path: '/admin/sign-in', query: { redirect: to.fullPath } })
  }
})
