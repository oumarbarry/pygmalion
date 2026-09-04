import { describe, expect, it } from 'vitest'
import { parseListQuery } from './utils/list-query'

// One uniform parsing of the list conventions (q / limit / offset /
// order) for every `GET` collection endpoint.
describe('parseListQuery', () => {
  it('defaults to limit 20, offset 0, no q, no order', () => {
    expect(parseListQuery({})).toEqual({ limit: 20, offset: 0, q: undefined, order: undefined })
  })

  it('parses limit/offset/q/order', () => {
    expect(parseListQuery({ limit: '5', offset: '10', q: 'mug', order: '-created_at' })).toEqual({
      limit: 5,
      offset: 10,
      q: 'mug',
      order: '-created_at',
    })
  })

  it('caps limit at 100 and floors offset at 0', () => {
    expect(parseListQuery({ limit: '5000', offset: '-3' })).toMatchObject({ limit: 100, offset: 0 })
  })

  it('ignores garbage (non-numeric, empty q) instead of throwing', () => {
    expect(parseListQuery({ limit: 'abc', offset: 'x', q: '' })).toEqual({ limit: 20, offset: 0, q: undefined, order: undefined })
  })

  it('honours a caller-provided default/max limit', () => {
    expect(parseListQuery({}, { defaultLimit: 50 })).toMatchObject({ limit: 50 })
    expect(parseListQuery({ limit: '40' }, { maxLimit: 25 })).toMatchObject({ limit: 25 })
  })
})
