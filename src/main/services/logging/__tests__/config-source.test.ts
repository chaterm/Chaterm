import { describe, expect, it } from 'vitest'
import * as logging from '../index'
import { DEFAULT_CONFIG } from '../types'

describe('logging config source', () => {
  it('does not expose runtime config store APIs', () => {
    expect('getConfig' in logging).toBe(false)
    expect('updateConfig' in logging).toBe(false)
  })

  it('uses static in-code defaults', () => {
    expect(DEFAULT_CONFIG).toEqual({
      level: 'info',
      retentionDays: 30,
      maxFileSizeMB: 20,
      maxTotalSizeMB: 500,
      enabled: true
    })
  })
})
