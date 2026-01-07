import { describe, it, expect } from 'vitest'
import { hasNoAssetsPrompt } from '../navigator'

describe('hasNoAssetsPrompt', () => {
  it('detects english message', () => {
    expect(hasNoAssetsPrompt('No Assets')).toBe(true)
    expect(hasNoAssetsPrompt('no assets found')).toBe(true)
  })

  it('detects chinese message', () => {
    expect(hasNoAssetsPrompt('没有资产')).toBe(true)
  })

  it('detects japanese message', () => {
    expect(hasNoAssetsPrompt('資産なし')).toBe(true)
  })

  it('detects korean message', () => {
    expect(hasNoAssetsPrompt('자산이 없습니다')).toBe(true)
  })

  it('returns false for unrelated text', () => {
    expect(hasNoAssetsPrompt('Assets list loaded')).toBe(false)
  })
})
