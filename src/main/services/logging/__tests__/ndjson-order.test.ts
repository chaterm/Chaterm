import { describe, expect, it } from 'vitest'
import { formatNdjsonLine } from '../ndjson'

describe('ndjson field order', () => {
  it('puts core fields first and keeps extras in insertion order', () => {
    const line = formatNdjsonLine({
      level: 'info',
      data: [
        {
          zeta: 'z',
          timestamp: '2026-02-12T00:00:00.000Z',
          alpha: 'a',
          level: 'info',
          process: 'main',
          event: 'agent.task.created',
          channel: 'app',
          module: 'agent',
          message: 'created'
        }
      ]
    })[0]

    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['timestamp', 'level', 'process', 'channel', 'module', 'message', 'zeta', 'alpha', 'event'])
  })
})
