import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { seedOwnerSession } from './support/staff'

interface StaffUser {
  id: string
  email: string
  role: string
}
interface Invite {
  id: string
  email: string
  role: string
  token: string
}

// Staff auth domain: better-auth `staff`
// instance, RBAC (owner/manager/fulfiller), invite→accept, api-key access.
describe('staff auth (e2e)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    nuxtConfig: {
      runtimeConfig: {
        pygmalion: { dataDir: 'memory://', drainIntervalMs: 200 },
      },
    },
  })

  it('401s on /api/admin/** with no session and no api-key', async () => {
    await expect($fetch('/api/admin/products', { method: 'POST', body: { title: 'x' } })).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('public staff sign-up is disabled; bootstrap 403s once staff exist', async () => {
    await seedOwnerSession('bootstrap-owner@test.pygmalion.dev')
    // Public sign-up: hard-disabled on the staff instance (any 4xx).
    let signUpStatus = 0
    try {
      await $fetch('/api/admin/auth/sign-up/email', {
        method: 'POST',
        body: { email: 'intruder@test.pygmalion.dev', password: 'try-me-anyway-1!', name: 'Intruder' },
      })
    } catch (err) {
      signUpStatus = (err as { statusCode?: number, status?: number }).statusCode
        ?? (err as { status?: number }).status ?? 0
    }
    expect(signUpStatus).toBeGreaterThanOrEqual(400)
    expect(signUpStatus).toBeLessThan(500)
    // First-boot bootstrap: single-shot, 403 once any staff exists.
    await expect(
      $fetch('/api/admin/auth-bootstrap', {
        method: 'POST',
        body: { email: 'late-owner@test.pygmalion.dev', name: 'Late', password: 'late-owner-pw-1!' },
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('signs a staff user in via POST /api/admin/auth/sign-in/email', async () => {
    const { password } = await seedOwnerSession('login-owner@test.pygmalion.dev')
    const res = await $fetch<{ user: StaffUser }>('/api/admin/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'login-owner@test.pygmalion.dev', password },
    })
    expect(res.user.email).toBe('login-owner@test.pygmalion.dev')
  })

  it('invite -> accept creates the staff user with its role, atomically', async () => {
    const { cookie } = await seedOwnerSession('invite-owner@test.pygmalion.dev')

    const created = await $fetch<{ invite: Invite }>('/api/admin/invites', {
      method: 'POST',
      headers: { cookie },
      body: { email: 'new-manager@test.pygmalion.dev', role: 'manager' },
    })
    expect(created.invite.token).toBeTruthy()

    const accepted = await $fetch<{ user: StaffUser }>('/api/admin/invites/accept', {
      method: 'POST',
      body: { token: created.invite.token, name: 'New Manager', password: 'manager-pw-12345' },
    })
    expect(accepted.user.email).toBe('new-manager@test.pygmalion.dev')
    expect(accepted.user.role).toBe('manager')

    // Token is single-use: a second accept fails.
    await expect(
      $fetch('/api/admin/invites/accept', {
        method: 'POST',
        body: { token: created.invite.token, name: 'New Manager', password: 'manager-pw-12345' },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('403s a fulfiller on an owner-only operation (staff:create)', async () => {
    const { cookie: ownerCookie } = await seedOwnerSession('fulfiller-owner@test.pygmalion.dev')
    const invite = await $fetch<{ invite: Invite }>('/api/admin/invites', {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: { email: 'fulfiller@test.pygmalion.dev', role: 'fulfiller' },
    })
    await $fetch('/api/admin/invites/accept', {
      method: 'POST',
      body: { token: invite.invite.token, name: 'Test Fulfiller', password: 'fulfiller-pw-12345' },
    })
    const signIn = await fetch('/api/admin/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'fulfiller@test.pygmalion.dev', password: 'fulfiller-pw-12345' }),
    })
    const fulfillerCookie = signIn.headers.get('set-cookie')!

    await expect(
      $fetch('/api/admin/invites', {
        method: 'POST',
        headers: { cookie: fulfillerCookie },
        body: { email: 'someone-else@test.pygmalion.dev', role: 'fulfiller' },
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('a secret api-key authenticates /api/admin/** via the x-api-key header', async () => {
    const { cookie } = await seedOwnerSession('apikey-owner@test.pygmalion.dev')
    const key = await $fetch<{ key: string }>('/api/admin/auth/api-key/create', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'ci-key' },
    })
    expect(key.key).toBeTruthy()

    const res = await $fetch<{ users: StaffUser[] }>('/api/admin/users', {
      headers: { 'x-api-key': key.key },
    })
    expect(res.users.some((u) => u.email === 'apikey-owner@test.pygmalion.dev')).toBe(true)
  })
})
