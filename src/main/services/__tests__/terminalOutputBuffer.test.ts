import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTerminalOutputBuffer } from '../terminalOutputBuffer'

describe('terminalOutputBuffer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces output until the flush timer fires', () => {
    vi.useFakeTimers()
    const sent: string[] = []
    const buffer = createTerminalOutputBuffer({
      send: (data) => sent.push(data),
      flushIntervalMs: 16
    })

    buffer.push('a')
    buffer.push('b')

    expect(sent).toEqual([])
    vi.advanceTimersByTime(16)
    expect(sent).toEqual(['ab'])
  })

  it('flushes immediately when the buffer reaches the size limit', () => {
    vi.useFakeTimers()
    const sent: string[] = []
    const buffer = createTerminalOutputBuffer({
      send: (data) => sent.push(data),
      maxBufferBytes: 4
    })

    buffer.push('ab')
    buffer.push('cd')

    expect(sent).toEqual(['abcd'])
  })

  it('flushes pending output before close events are sent', () => {
    const sent: string[] = []
    const buffer = createTerminalOutputBuffer({
      send: (data) => sent.push(data)
    })

    buffer.push('tail')
    buffer.flush()

    expect(sent).toEqual(['tail'])
  })
})
