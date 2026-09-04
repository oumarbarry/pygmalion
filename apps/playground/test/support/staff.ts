import { $fetch, fetch } from '@nuxt/test-utils/e2e'

/**
 * E2E bootstrap for `/api/admin/**` auth: staff sign-up is
 * invite-only past the very first user, so owners are seeded server-side via
 * the playground-only `_test/seed-owner` route, then signed in through the
 * public better-auth endpoint to obtain a session cookie. (`fetch`, not
 * `$fetch` — we need the raw Response for the `set-cookie` header.)
 */
export async function seedOwnerSession(email: string): Promise<{ cookie: string, password: string }> {
  const password = 'sup3r-secret-owner-pw!'
  await $fetch('/api/_test/seed-owner', { method: 'POST', body: { email, password } })
  const res = await fetch('/api/admin/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`)
  const cookie = res.headers.get('set-cookie')
  if (!cookie) throw new Error('sign-in did not return a session cookie')
  return { cookie, password }
}
