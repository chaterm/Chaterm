import { describe, it, expect } from 'vitest'
import { InteractionDetector, InteractionRequest } from '../index'

describe('interaction-detector pager patterns', () => {
  it('detects pager for lines X-Y without total', () => {
    const detector = new InteractionDetector('journalctl -b', 'cmd_test')
    let seen: InteractionRequest | null = null
    detector.on('interaction-needed', (req) => {
      seen = req
    })

    detector.onOutput('lines 1-23\n')

    expect(seen).not.toBeNull()
    expect(seen!.interactionType).toBe('pager')
  })

  it('detects pager for lines X-Y (END)', () => {
    const detector = new InteractionDetector('journalctl -b', 'cmd_test')
    let seen: InteractionRequest | null = null
    detector.on('interaction-needed', (req) => {
      seen = req
    })

    detector.onOutput('lines 1-23 (END)\n')

    expect(seen).not.toBeNull()
    expect(seen!.interactionType).toBe('pager')
  })
})
