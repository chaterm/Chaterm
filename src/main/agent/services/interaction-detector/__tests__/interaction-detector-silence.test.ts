import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InteractionDetector } from '../index'

describe('InteractionDetector silence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps polling instead of prompting when the output stays unchanged', async () => {
    const detector = new InteractionDetector('fuser -m /mnt/data', 'cmd_silence')
    const llmCaller = vi.fn().mockResolvedValue({ needsInteraction: false, interactionType: 'freeform', promptHint: '' })
    detector.setLlmCaller(llmCaller)
    const requests: unknown[] = []
    detector.on('interaction-needed', (req) => requests.push(req))

    detector.onOutput('scanning mounts\n')
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    // The unchanged output is checked once; silence by itself never opens the input panel
    expect(llmCaller).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(0)

    detector.dispose()
  })

  it('keeps detecting after a free-text prompt without re-checking the same output', async () => {
    const detector = new InteractionDetector('./setup.sh', 'cmd_freeform')
    const llmCaller = vi
      .fn()
      .mockResolvedValueOnce({ needsInteraction: true, interactionType: 'freeform', promptHint: 'name' })
      .mockResolvedValue({ needsInteraction: false, interactionType: 'freeform', promptHint: '' })
    detector.setLlmCaller(llmCaller)
    const requests: Array<{ interactionType: string }> = []
    detector.on('interaction-needed', (req) => requests.push(req))

    detector.onOutput('Project name\n')
    await vi.advanceTimersByTimeAsync(5000)

    expect(requests.map((r) => r.interactionType)).toEqual(['freeform'])
    expect(detector.getState().isPaused).toBe(false)

    // The reported output does not trigger another LLM call or prompt
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(llmCaller).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(1)

    // A later prompt is still detected
    detector.onOutput('[sudo] password for dsd:')
    expect(requests.map((r) => r.interactionType)).toEqual(['freeform', 'password'])
    expect(detector.getState().isPaused).toBe(true)

    detector.dispose()
  })
})
