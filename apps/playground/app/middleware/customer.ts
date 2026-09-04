/**
 * Account pages need a customer session.
 *
 * Route middleware runs BEFORE any layout or page setup, so it cannot lean on
 * the shell having resolved the session: on a hard load (or an SSR render) the
 * shared state is still empty, and reading it alone bounces a perfectly
 * signed-in customer to the login page. Resolve it here when it isn't known
 * yet — `refresh()` treats a 401 as "signed out", not as an error.
 *
 * The redirect carries the target back so signing in lands where you meant to go.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, refresh } = useCustomer()
  if (!isAuthenticated.value) await refresh()
  if (isAuthenticated.value) return
  return navigateTo({ path: '/account/login', query: { redirect: to.fullPath } })
})
