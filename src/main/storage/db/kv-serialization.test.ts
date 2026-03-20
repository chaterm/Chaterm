import { describe, expect, it } from 'vitest'

import { deserializeStoredKvValue, serializeKvTransactionOps } from './kv-serialization'

describe('kv serialization helpers', () => {
  it('serializes transaction set values so they round-trip through the KV read path', async () => {
    const ops = await serializeKvTransactionOps([
      {
        action: 'set',
        key: 'userConfig',
        value: JSON.stringify({ theme: 'light', watermark: 'open' })
      }
    ])

    expect(ops[0]?.action).toBe('set')
    if (ops[0]?.action !== 'set') {
      throw new Error('Expected first op to be a set op')
    }
    expect(ops[0].value).not.toBe(JSON.stringify({ theme: 'light', watermark: 'open' }))

    const decoded = await deserializeStoredKvValue(ops[0].value)

    expect(decoded.source).toBe('superjson')
    expect(decoded.value).toEqual({ theme: 'light', watermark: 'open' })
  })

  it('falls back to plain JSON for legacy transaction-written rows', async () => {
    const decoded = await deserializeStoredKvValue(JSON.stringify({ theme: 'light', watermark: 'open' }))

    expect(decoded.source).toBe('plain_json')
    expect(decoded.value).toEqual({ theme: 'light', watermark: 'open' })
  })
})
