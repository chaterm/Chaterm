import { describe, expect, it } from 'vitest'
import { shouldSkipAssetLookup } from '../wakeupConnection'

describe('shouldSkipAssetLookup', () => {
  it('returns true for explicit xshell wakeup source', () => {
    expect(
      shouldSkipAssetLookup({
        wakeupSource: 'xshell-direct',
        uuid: 'normal-uuid'
      })
    ).toBe(true)
  })

  it('returns true for generated xshell uuid', () => {
    expect(
      shouldSkipAssetLookup({
        uuid: 'xshell-1742800000000-12345'
      })
    ).toBe(true)
  })

  it('returns false for normal asset data', () => {
    expect(
      shouldSkipAssetLookup({
        uuid: 'asset-uuid-123',
        wakeupSource: 'workspace'
      })
    ).toBe(false)
  })
})
