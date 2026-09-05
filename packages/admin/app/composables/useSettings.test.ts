import { describe, expect, it } from 'vitest'
import {
  COUNTRY_CODES,
  countryList,
  DOMAIN_EVENT_GROUPS,
  countryName,
  deliveryStatusDisplay,
  inviteStatusDisplay,
  notificationStatusDisplay,
  roleLabelKey,
  type AdminInvite,
} from './useSettings'

/**
 * The framework-free half of the Réglages screens: status derivation (a
 * tone AND a label, never a colour alone) and the webhook
 * event catalogue. The screens themselves are covered as flows by
 * `apps/playground/test/admin-settings.e2e.spec.ts`.
 *
 * `useSettingsNav` is deliberately not tested here: it is nothing but Nuxt
 * auto-imports (`computed` + `useVocabulary`).
 */

function invite(overrides: Partial<AdminInvite> = {}): AdminInvite {
  return {
    id: 'inv_1',
    email: 'a@b.c',
    role: 'manager',
    invitedBy: null,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('settings statuses', () => {
  it('an invite is pending until it is accepted, revoked, or its expiry passes', () => {
    expect(inviteStatusDisplay(invite()).key).toBe('setInvitePending')
    expect(inviteStatusDisplay(invite({ acceptedAt: new Date().toISOString() })).key).toBe('setInviteAccepted')
    expect(inviteStatusDisplay(invite({ revokedAt: new Date().toISOString() })).key).toBe('setInviteRevoked')
    expect(inviteStatusDisplay(invite({ expiresAt: new Date(Date.now() - 1000).toISOString() })).key).toBe(
      'setInviteExpired',
    )
  })

  it('accepted wins over expired — a burnt invite is not "expired", it worked', () => {
    const burnt = invite({ acceptedAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString() })
    expect(inviteStatusDisplay(burnt).key).toBe('setInviteAccepted')
  })

  it('maps every delivery and notification status to a tone + a label', () => {
    expect(deliveryStatusDisplay('delivered')).toEqual({ tone: 'success', key: 'setDeliveryDelivered' })
    expect(deliveryStatusDisplay('failed')).toEqual({ tone: 'error', key: 'setDeliveryFailed' })
    expect(deliveryStatusDisplay('pending')).toEqual({ tone: 'warning', key: 'setDeliveryPending' })
    expect(notificationStatusDisplay('sent').key).toBe('setMessageSent')
    expect(notificationStatusDisplay('failed').key).toBe('setMessageFailed')
    expect(notificationStatusDisplay('pending').key).toBe('setMessagePending')
  })

  it('translates the three real staff roles and never crashes on an unknown one', () => {
    expect(roleLabelKey('owner')).toBe('setRoleOwner')
    expect(roleLabelKey('manager')).toBe('setRoleManager')
    expect(roleLabelKey('fulfiller')).toBe('setRoleFulfiller')
    expect(roleLabelKey(null)).toBe('setRoleUnknown')
    expect(roleLabelKey('admin')).toBe('setRoleUnknown')
  })
})

describe('country mirror of COUNTRY_SEED', () => {
  it('resolves a known code, is case-insensitive, and falls back to the raw code', () => {
    expect(countryName('FR')).toBe('France')
    expect(countryName('fr')).toBe('France')
    expect(countryName('DE', 'fr-FR')).toBe('Allemagne')
    expect(countryName('DE', 'en-US')).toBe('Germany')
    expect(countryName('Z')).toBe('Z')
  })

  it('has one row per iso2 (a duplicate would render two identical checkboxes)', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
    expect(countryList('en-US').map((c) => c.iso2).sort()).toEqual([...COUNTRY_CODES].sort())
  })
})

describe('webhook event catalogue', () => {
  const all = DOMAIN_EVENT_GROUPS.flatMap((g) => g.events)

  it('lists every event exactly once across the groups', () => {
    expect(new Set(all).size).toBe(all.length)
  })

  it('carries only real `<domain>.<action>` names — never the `*` wildcard, never a test fixture', () => {
    expect(all).not.toContain('*')
    expect(all.every((e) => /^[a-z0-9-]+\.[a-z0-9-]+$/.test(e))).toBe(true)
    expect(all.some((e) => e.startsWith('demo.'))).toBe(false)
  })

  it('covers the events the settings screens themselves emit', () => {
    for (const event of ['region.created', 'api-key.revoked', 'staff-invite.created', 'shipping-option.created']) {
      expect(all).toContain(event)
    }
  })
})
