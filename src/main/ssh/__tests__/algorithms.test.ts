import { describe, expect, it } from 'vitest'
import { getAlgorithmsByAssetType, isSwitchAssetType, LEGACY_ALGORITHMS, SWITCH_COMPAT_ALGORITHMS } from '../algorithms'

describe('ssh algorithms', () => {
  it('detects switch asset types', () => {
    expect(isSwitchAssetType('person-switch-huawei')).toBe(true)
    expect(isSwitchAssetType('person-switch-cisco')).toBe(true)
    expect(isSwitchAssetType('person')).toBe(false)
    expect(isSwitchAssetType(undefined)).toBe(false)
  })

  it('selects switch compatible algorithms for switches', () => {
    expect(getAlgorithmsByAssetType('person-switch-huawei')).toBe(SWITCH_COMPAT_ALGORITHMS)
    expect(getAlgorithmsByAssetType('person-switch-cisco')).toBe(SWITCH_COMPAT_ALGORITHMS)
  })

  it('defaults to legacy algorithms for non-switch assets', () => {
    expect(getAlgorithmsByAssetType('person')).toBe(LEGACY_ALGORITHMS)
    expect(getAlgorithmsByAssetType(undefined)).toBe(LEGACY_ALGORITHMS)
  })
})
