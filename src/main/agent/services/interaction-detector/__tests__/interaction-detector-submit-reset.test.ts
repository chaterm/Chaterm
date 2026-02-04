import { describe, it, expect } from 'vitest'
import { InteractionDetector } from '../index'

describe('InteractionDetector submit reset', () => {
  it('does not re-trigger the same prompt after resume', () => {
    const detector = new InteractionDetector('sudo apt remove htop', 'cmd_test')
    const requests: Array<{ interactionType: string; promptHint: string }> = []

    detector.on('interaction-needed', (req) => {
      requests.push({ interactionType: req.interactionType, promptHint: req.promptHint })
    })

    detector.onOutput('[sudo] password for newuser:')
    expect(requests).toHaveLength(1)
    ;(detector as any).onInteractionSubmitted('password')
    detector.resume()
    detector.onOutput('\n')

    expect(requests).toHaveLength(1)

    detector.dispose()
  })
})
