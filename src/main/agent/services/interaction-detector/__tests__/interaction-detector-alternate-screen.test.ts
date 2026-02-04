import { describe, it, expect, vi, afterEach } from 'vitest'
import { InteractionDetector } from '../index'

interface AlternateScreenPayload {
  commandId: string
  taskId?: string
  autoCancel: boolean
}

describe('interaction-detector alternate screen events', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits alternate-screen-entered with autoCancel boolean during observation timeout', () => {
    vi.useFakeTimers()

    const detector = new InteractionDetector('top', 'cmd_test', {
      pagerObservationTimeout: 5,
      tuiCancelSilenceMs: 1000
    })

    const events: AlternateScreenPayload[] = []
    detector.on('alternate-screen-entered', (data) => {
      events.push(data)
    })

    detector.onOutput('\x1b[?1049h')

    vi.advanceTimersByTime(10)

    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => typeof event.autoCancel === 'boolean')).toBe(true)

    detector.dispose()
  })

  it('includes taskId in alternate-screen-entered events when provided', () => {
    vi.useFakeTimers()

    const detector = new InteractionDetector(
      'top',
      'cmd_test',
      {
        pagerObservationTimeout: 5,
        tuiCancelSilenceMs: 1000
      },
      'task-1'
    )

    let payload: AlternateScreenPayload | null = null
    detector.on('alternate-screen-entered', (data) => {
      payload = data
    })

    detector.onOutput('\x1b[?1049h')
    vi.advanceTimersByTime(10)

    expect(payload).not.toBeNull()
    expect(payload!.taskId).toBe('task-1')

    detector.dispose()
  })
})
