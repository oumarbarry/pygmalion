import { describe, expect, it } from 'vitest'
import { PYGMALION_VERSION } from './index'

describe('PYGMALION_VERSION', () => {
  it('is defined', () => {
    expect(PYGMALION_VERSION).toBe('0.1.0')
  })
})
