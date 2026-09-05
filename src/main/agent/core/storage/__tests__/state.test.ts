import { describe, expect, it } from 'vitest'

import { buildApiConfigurationForProviderModel } from '../state'

describe('buildApiConfigurationForProviderModel', () => {
  it('preserves the selected provider and model without custom limits', () => {
    expect(buildApiConfigurationForProviderModel({ apiProvider: 'openai' }, 'openai', 'gpt-5')).toMatchObject({
      apiProvider: 'openai',
      openAiModelId: 'gpt-5'
    })
  })

  it('injects per-model limits into OpenAI-compatible configuration', () => {
    const configuration = buildApiConfigurationForProviderModel({ apiProvider: 'openai', openAiModelId: 'old-model' }, 'openai', 'claude-opus-5', {
      contextWindow: 1_000_000,
      maxTokens: 32_768
    })

    expect(configuration).toMatchObject({
      apiProvider: 'openai',
      openAiModelId: 'claude-opus-5',
      openAiModelInfo: expect.objectContaining({
        contextWindow: 1_000_000,
        maxTokens: 32_768
      })
    })
  })

  it('keeps default gateway model metadata while applying per-model overrides', () => {
    const configuration = buildApiConfigurationForProviderModel(
      {
        apiProvider: 'default',
        defaultModelInfoMap: {
          'claude-opus-5': { contextWindow: 200_000, maxTokens: 8_192 }
        }
      },
      'default',
      'claude-opus-5',
      { contextWindow: 1_000_000 }
    )

    expect(configuration.defaultModelInfoMap?.['claude-opus-5']).toEqual({
      contextWindow: 1_000_000,
      maxTokens: 8_192
    })
  })
})
