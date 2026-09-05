import { describe, expect, it } from 'vitest'

import { getContextWindowInfo } from '../context-window-utils'

describe('getContextWindowInfo', () => {
  it('uses configured context windows larger than the built-in presets', () => {
    const result = getContextWindowInfo({
      getModel: () => ({ id: 'claude-opus-5', info: { contextWindow: 1_000_000, supportsPromptCache: true } })
    } as any)

    expect(result.contextWindow).toBe(1_000_000)
    expect(result.maxAllowedSize).toBe(960_000)
  })

  it('falls back to the default context window when model metadata is missing', () => {
    const result = getContextWindowInfo({
      getModel: () => ({ id: 'custom-model', info: { supportsPromptCache: false } })
    } as any)

    expect(result.contextWindow).toBe(128_000)
    expect(result.maxAllowedSize).toBe(98_000)
  })
})
