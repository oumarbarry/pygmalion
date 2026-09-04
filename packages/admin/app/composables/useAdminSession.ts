import { getAuthClient } from '../utils/auth-client'

/** Reactive staff session (better-auth vue client — see utils/auth-client.ts). */
export function useAdminSession() {
  return getAuthClient().useSession()
}

export async function signInWithPassword(email: string, password: string) {
  return getAuthClient().signIn.email({ email, password })
}

export async function signOutAdmin() {
  await getAuthClient().signOut()
  return navigateTo('/admin/sign-in')
}
