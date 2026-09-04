import type { PygStatusTone } from '../components/PygStatus.vue'
import type { PygSubNavItem } from '../components/PygSubNav.vue'
import type { VocabKey } from '../utils/vocabulary'

/**
 * Shared shapes + helpers for the Promotions section. The translation
 * between merchant words and the promotions engine lives in
 * `utils/promotion-form.ts` (pure, tested); this file is the Nuxt-side glue.
 */

/** Row shape of `GET /api/admin/promotions` — the raw record, no application method. */
export interface AdminPromotionRow {
  id: string
  code: string | null
  isAutomatic: boolean
  status: string
  type: string
  campaignId: string | null
  createdAt: string
}

/** Second-level nav of the « Promotions » section: the 6-item sidebar never grows. */
export function usePromotionsNav(): ComputedRef<PygSubNavItem[]> {
  const { t } = useVocabulary()
  return computed(() => [
    { label: t('navPromotionsList'), to: '/admin/promotions', icon: 'i-lucide-tag', exact: true },
    { label: t('navCampaigns'), to: '/admin/promotions/campagnes', icon: 'i-lucide-megaphone' },
  ])
}

/** Running / stopped / draft: icon + colour + label, never colour alone. */
export function promotionStatusDisplay(status: string): { tone: PygStatusTone; key: VocabKey; icon: string } {
  switch (status) {
    case 'active':
      return { tone: 'success', key: 'promoStatusActive', icon: 'i-lucide-circle-check' }
    case 'inactive':
      return { tone: 'neutral', key: 'promoStatusInactive', icon: 'i-lucide-circle-pause' }
    default:
      return { tone: 'info', key: 'promoStatusDraft', icon: 'i-lucide-pencil' }
  }
}

/** Target -> the plain-language label used by the list, the wizard and the summary. */
export function promotionTargetKey(target: 'order' | 'products' | 'categories' | 'shipping'): VocabKey {
  switch (target) {
    case 'products':
      return 'promoTargetProducts'
    case 'categories':
      return 'promoTargetCategories'
    case 'shipping':
      return 'promoTargetShipping'
    default:
      return 'promoTargetOrder'
  }
}
