/**
 * Variant generation for the product wizard. Pure (no Nuxt, no DOM),
 * so it is unit-testable next to this file.
 */

export interface DraftOption {
  /** « Taille », « Couleur »… — the merchant's own words, never "option". */
  title: string
  values: string[]
}

/**
 * Splits the comma-separated list a merchant types into clean values:
 * trims, drops blanks, de-duplicates (case-insensitively) while keeping the
 * first spelling and the typed order.
 */
export function parseOptionValues(input: string): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const raw of input.split(',')) {
    const value = raw.trim()
    if (!value) continue
    const key = value.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    values.push(value)
  }
  return values
}

/**
 * Cartesian product of the option values — « Taille: S,M » × « Couleur: bleu »
 * gives 2 déclinaisons. Options with no value are ignored (a half-typed row
 * must not wipe the whole list). No option at all => one combination with no
 * values, i.e. the single default déclinaison.
 */
export function combineOptionValues(options: DraftOption[]): string[][] {
  return options
    .filter((option) => option.values.length > 0)
    .reduce<string[][]>((combos, option) => combos.flatMap((combo) => option.values.map((value) => [...combo, value])), [[]])
}

/** « S / bleu » — the title a merchant reads on a déclinaison. */
export function variantTitle(values: string[], fallback: string): string {
  return values.length ? values.join(' / ') : fallback
}

/**
 * Suggested référence (never shown as "SKU"): product handle +
 * the option values, slugified. Merchants can overwrite it; it exists so stock
 * can be counted per déclinaison without asking them to invent a code.
 */
export function suggestReference(handle: string, values: string[]): string {
  const slug = (input: string) =>
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  return [slug(handle), ...values.map(slug)].filter(Boolean).join('-')
}
