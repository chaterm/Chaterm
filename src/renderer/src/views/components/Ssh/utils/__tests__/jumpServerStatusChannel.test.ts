import { describe, it, expect } from 'vitest'
import { shouldUseBastionStatusChannel } from '../jumpServerStatusHandler'

describe('shouldUseBastionStatusChannel', () => {
  it('returns true for jumpserver', () => {
    expect(shouldUseBastionStatusChannel('jumpserver')).toBe(true)
  })

  it('returns true for plugin bastions', () => {
    expect(shouldUseBastionStatusChannel('qizhi')).toBe(true)
    expect(shouldUseBastionStatusChannel('tencent')).toBe(true)
  })

  it('returns false for plain ssh or empty', () => {
    expect(shouldUseBastionStatusChannel('ssh')).toBe(false)
    expect(shouldUseBastionStatusChannel(undefined)).toBe(false)
    expect(shouldUseBastionStatusChannel('')).toBe(false)
  })
})
