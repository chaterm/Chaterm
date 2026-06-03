import { describe, expect, it, vi } from 'vitest'
import { createTerminalWriteQueue } from '../terminalWriteQueue'

describe('terminalWriteQueue', () => {
  it('batches queued writes into one terminal write', () => {
    const writes: string[] = []
    const scheduled: Array<() => void> = []
    const queue = createTerminalWriteQueue({
      write: (data, callback) => {
        writes.push(data)
        callback?.()
      },
      scheduleFrame: (callback) => {
        scheduled.push(callback)
        return scheduled.length
      },
      cancelFrame: vi.fn()
    })

    queue.enqueue('a')
    queue.enqueue('b')
    scheduled.shift()?.()

    expect(writes).toEqual(['ab'])
    expect(queue.getPendingBytes()).toBe(0)
  })

  it('keeps protected chunks when trimming pending output', () => {
    const writes: string[] = []
    const scheduled: Array<() => void> = []
    const queue = createTerminalWriteQueue({
      write: (data, callback) => {
        writes.push(data)
        callback?.()
      },
      maxPendingBytes: 8,
      scheduleFrame: (callback) => {
        scheduled.push(callback)
        return scheduled.length
      },
      cancelFrame: vi.fn(),
      dropNotice: (bytes) => `[dropped:${bytes}]`
    })

    queue.enqueue('keep', { droppable: false })
    queue.enqueue('drop-a')
    queue.enqueue('drop-b')
    scheduled.shift()?.()

    expect(writes.join('')).toContain('keep')
    expect(writes.join('')).toContain('[dropped:')
    expect(writes.join('')).not.toContain('drop-a')
  })

  it('splits writes by batch budget', () => {
    const writes: string[] = []
    const scheduled: Array<() => void> = []
    const queue = createTerminalWriteQueue({
      write: (data, callback) => {
        writes.push(data)
        callback?.()
      },
      maxBatchBytes: 4,
      scheduleFrame: (callback) => {
        scheduled.push(callback)
        return scheduled.length
      },
      cancelFrame: vi.fn()
    })

    queue.enqueue('ab')
    queue.enqueue('cd')
    queue.enqueue('ef')
    scheduled.shift()?.()
    scheduled.shift()?.()

    expect(writes).toEqual(['abcd', 'ef'])
  })

  it('pauses terminal writes until resumed', () => {
    const writes: string[] = []
    const scheduled: Array<() => void> = []
    const queue = createTerminalWriteQueue({
      write: (data, callback) => {
        writes.push(data)
        callback?.()
      },
      scheduleFrame: (callback) => {
        scheduled.push(callback)
        return scheduled.length
      },
      cancelFrame: vi.fn()
    })

    queue.setPaused(true)
    queue.enqueue('a')
    queue.enqueue('b')

    expect(writes).toEqual([])
    expect(scheduled).toHaveLength(0)

    queue.setPaused(false)
    scheduled.shift()?.()

    expect(writes).toEqual(['ab'])
  })
})
