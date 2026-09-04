import { describe, expect, it } from 'vitest'
import { combineOptionValues, parseOptionValues, suggestReference, variantTitle } from './variants'

// Product wizard: the only non-trivial pure logic in the admin layer, the
// déclinaison generator. Everything else is API plumbing covered by the
// playground e2e suite.
describe('parseOptionValues', () => {
  it('trims, drops blanks and de-duplicates case-insensitively', () => {
    expect(parseOptionValues(' S , M ,, s,L ')).toEqual(['S', 'M', 'L'])
  })

  it('returns an empty list for an empty input', () => {
    expect(parseOptionValues('  ,  ')).toEqual([])
  })
})

describe('combineOptionValues', () => {
  it('gives one empty combination when there is no option (single déclinaison)', () => {
    expect(combineOptionValues([])).toEqual([[]])
  })

  it('multiplies every option against every other, in the typed order', () => {
    expect(
      combineOptionValues([
        { title: 'Taille', values: ['S', 'M'] },
        { title: 'Couleur', values: ['bleu', 'rouge'] },
      ]),
    ).toEqual([
      ['S', 'bleu'],
      ['S', 'rouge'],
      ['M', 'bleu'],
      ['M', 'rouge'],
    ])
  })

  it('ignores a half-typed option instead of wiping the list', () => {
    expect(combineOptionValues([{ title: 'Taille', values: ['S'] }, { title: 'Couleur', values: [] }])).toEqual([['S']])
  })
})

describe('variantTitle / suggestReference', () => {
  it('joins values, falling back to the product name for a single déclinaison', () => {
    expect(variantTitle(['S', 'bleu'], 'Chemise')).toBe('S / bleu')
    expect(variantTitle([], 'Chemise')).toBe('Chemise')
  })

  it('slugifies accents and separators into a reference', () => {
    expect(suggestReference('chemise-été', ['Bleu Ciel'])).toBe('chemise-ete-bleu-ciel')
  })
})
