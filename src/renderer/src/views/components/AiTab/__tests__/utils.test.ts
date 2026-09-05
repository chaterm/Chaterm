import { describe, expect, it } from 'vitest'

import { formatTokenCount } from '../utils'

describe('formatTokenCount', () => {
  it('formats million-token context windows with M units', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M')
    expect(formatTokenCount(1_500_000)).toBe('1.5M')
  })

  it('keeps smaller token counts in compact K units', () => {
    expect(formatTokenCount(1_000)).toBe('1K')
    expect(formatTokenCount(16_800)).toBe('16.8K')
    expect(formatTokenCount(999)).toBe('999')
  })
})
