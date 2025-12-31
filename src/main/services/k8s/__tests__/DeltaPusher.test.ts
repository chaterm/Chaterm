import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DeltaPusher } from '../DeltaPusher'
import { K8sEventType, K8sResourceEvent } from '../types'

// Mock Electron BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

// Mock InformerPool
vi.mock('../InformerPool')

describe('DeltaPusher', () => {
  let deltaPusher: DeltaPusher
  let mockInformerPool: any
  let mockMainWindow: any
  let eventListeners: Map<string, (event: any) => void>

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create event listeners storage
    eventListeners = new Map()

    // Create mock InformerPool
    mockInformerPool = {
      on: vi.fn((event: string, listener: (event: any) => void) => {
        eventListeners.set(event, listener)
      }),
      removeAllListeners: vi.fn()
    }

    // Create mock BrowserWindow
    mockMainWindow = {
      webContents: {
        send: vi.fn()
      },
      isDestroyed: vi.fn().mockReturnValue(false)
    }

    // Create DeltaPusher instance
    deltaPusher = new DeltaPusher(mockInformerPool as any, {
      throttleWindowMs: 50,
      maxBatchSize: 10
    })
  })

  describe('constructor', () => {
    it('should setup event listeners on InformerPool', () => {
      expect(mockInformerPool.on).toHaveBeenCalledWith('event', expect.any(Function))
      expect(mockInformerPool.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('should accept custom options', () => {
      const customPusher = new DeltaPusher(mockInformerPool as any, {
        throttleWindowMs: 200,
        maxBatchSize: 50
      })

      expect(customPusher).toBeDefined()
    })

    it('should use default options when not provided', () => {
      const defaultPusher = new DeltaPusher(mockInformerPool as any)

      expect(defaultPusher).toBeDefined()
    })
  })

  describe('setMainWindow', () => {
    it('should set main window for IPC communication', () => {
      deltaPusher.setMainWindow(mockMainWindow as any)

      expect(() => deltaPusher.setMainWindow(mockMainWindow as any)).not.toThrow()
    })

    it('should accept null to clear main window', () => {
      deltaPusher.setMainWindow(mockMainWindow as any)
      deltaPusher.setMainWindow(null)

      expect(() => deltaPusher.setMainWindow(null)).not.toThrow()
    })
  })

  describe('handleInformerEvent', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should process Pod ADD event', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-123',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Running' }
        }
      }

      const eventListener = eventListeners.get('event')
      expect(eventListener).toBeDefined()

      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'k8s:delta-batch',
        expect.objectContaining({
          contextName: 'test-context',
          resourceType: 'Pod',
          deltas: expect.arrayContaining([
            expect.objectContaining({
              type: 'ADD',
              uid: 'pod-123'
            })
          ])
        })
      )
    })

    it('should process Node ADD event', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Node',
          metadata: {
            uid: 'node-456',
            name: 'worker-node-1',
            namespace: undefined
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'k8s:delta-batch',
        expect.objectContaining({
          contextName: 'test-context',
          resourceType: 'Node'
        })
      )
    })

    it('should process MODIFIED event', async () => {
      const addEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-789',
            name: 'test-pod-mod',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Pending' }
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(addEvent)

      await new Promise((resolve) => setTimeout(resolve, 100))

      mockMainWindow.webContents.send.mockClear()

      const modifyEvent: K8sResourceEvent = {
        type: K8sEventType.MODIFIED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-789',
            name: 'test-pod-mod',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Running' }
        }
      }

      eventListener!(modifyEvent)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'k8s:delta-batch',
        expect.objectContaining({
          deltas: expect.arrayContaining([
            expect.objectContaining({
              type: 'UPDATE',
              patches: expect.any(Array)
            })
          ])
        })
      )
    })

    it('should process DELETE event', async () => {
      const addEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-del',
            name: 'test-pod-del',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(addEvent)

      await new Promise((resolve) => setTimeout(resolve, 100))

      mockMainWindow.webContents.send.mockClear()

      const deleteEvent: K8sResourceEvent = {
        type: K8sEventType.DELETED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-del',
            name: 'test-pod-del',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      eventListener!(deleteEvent)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'k8s:delta-batch',
        expect.objectContaining({
          deltas: expect.arrayContaining([
            expect.objectContaining({
              type: 'DELETE',
              uid: 'pod-del'
            })
          ])
        })
      )
    })

    it('should handle event without recognized resource kind', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'UnknownResource',
          metadata: {
            uid: 'unknown-123',
            name: 'test-unknown',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('should handle event without main window', async () => {
      deltaPusher.setMainWindow(null)

      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-no-window',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('should handle event when window is destroyed', async () => {
      mockMainWindow.isDestroyed.mockReturnValue(true)
      deltaPusher.setMainWindow(mockMainWindow as any)

      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-destroyed',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('should handle IPC send errors gracefully', async () => {
      mockMainWindow.webContents.send.mockImplementation(() => {
        throw new Error('IPC send failed')
      })

      deltaPusher.setMainWindow(mockMainWindow as any)

      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-error',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')

      expect(() => eventListener!(event)).not.toThrow()

      await new Promise((resolve) => setTimeout(resolve, 100))
    })
  })

  describe('error handling', () => {
    it('should handle informer errors', () => {
      const errorListener = eventListeners.get('error')
      expect(errorListener).toBeDefined()

      const error = new Error('Informer connection failed')

      expect(() => errorListener!(error)).not.toThrow()
    })
  })

  describe('multiple contexts and resource types', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should create separate calculators for different contexts', async () => {
      const event1: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'context-1',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-ctx1',
            name: 'pod-1',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const event2: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'context-2',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-ctx2',
            name: 'pod-2',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event1)
      eventListener!(event2)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(2)
    })

    it('should create separate calculators for different resource types', async () => {
      const podEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-123',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const nodeEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Node',
          metadata: {
            uid: 'node-456',
            name: 'test-node'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(podEvent)
      eventListener!(nodeEvent)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(2)
    })
  })

  describe('flushAll', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should flush all pending deltas', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-flush',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      deltaPusher.flushAll()

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'k8s:delta-batch',
        expect.objectContaining({
          deltas: expect.arrayContaining([
            expect.objectContaining({
              uid: 'pod-flush'
            })
          ])
        })
      )
    })

    it('should not throw if no calculators exist', () => {
      expect(() => deltaPusher.flushAll()).not.toThrow()
    })
  })

  describe('getStatistics', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should return statistics for all calculators', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-stats',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      const stats = deltaPusher.getStatistics()

      expect(stats).toHaveProperty('totalCalculators')
      expect(stats).toHaveProperty('calculators')
      expect(stats.totalCalculators).toBe(1)
      expect(stats.calculators).toHaveProperty('test-context:Pod')
    })

    it('should return empty statistics when no calculators exist', () => {
      const stats = deltaPusher.getStatistics()

      expect(stats.totalCalculators).toBe(0)
      expect(Object.keys(stats.calculators).length).toBe(0)
    })
  })

  describe('removeCalculator', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should remove specific calculator', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-remove',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      deltaPusher.removeCalculator('test-context', 'Pod')

      const stats = deltaPusher.getStatistics()
      expect(stats.totalCalculators).toBe(0)
    })

    it('should not throw when removing non-existent calculator', () => {
      expect(() => deltaPusher.removeCalculator('non-existent', 'Pod')).not.toThrow()
    })
  })

  describe('destroy', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should destroy all calculators and remove listeners', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-destroy',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      const eventListener = eventListeners.get('event')
      eventListener!(event)

      await new Promise((resolve) => setTimeout(resolve, 100))

      deltaPusher.destroy()

      expect(mockInformerPool.removeAllListeners).toHaveBeenCalledWith('event')
      expect(mockInformerPool.removeAllListeners).toHaveBeenCalledWith('error')

      const stats = deltaPusher.getStatistics()
      expect(stats.totalCalculators).toBe(0)
    })

    it('should not throw when destroying empty pusher', () => {
      expect(() => deltaPusher.destroy()).not.toThrow()
    })
  })

  describe('batching behavior', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should batch multiple events within throttle window', async () => {
      const events: K8sResourceEvent[] = Array.from({ length: 5 }, (_, i) => ({
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: `pod-batch-${i}`,
            name: `test-pod-${i}`,
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }))

      const eventListener = eventListeners.get('event')
      events.forEach((event) => eventListener!(event))

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(1)

      const callArgs = mockMainWindow.webContents.send.mock.calls[0]
      expect(callArgs[1].deltas.length).toBe(5)
    })

    it('should respect maxBatchSize and create multiple batches', async () => {
      const pusher = new DeltaPusher(mockInformerPool as any, {
        throttleWindowMs: 50,
        maxBatchSize: 3
      })

      pusher.setMainWindow(mockMainWindow as any)

      const events: K8sResourceEvent[] = Array.from({ length: 10 }, (_, i) => ({
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: `pod-${i}`,
            name: `test-pod-${i}`,
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }))

      const eventListener = eventListeners.get('event')
      events.forEach((event) => eventListener!(event))

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(4)

      pusher.destroy()
    })

    it('should create separate batches after throttle window expires', async () => {
      mockMainWindow.webContents.send.mockClear()

      const eventListener = eventListeners.get('event')

      eventListener!({
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-1',
            name: 'pod-1',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(1)
      mockMainWindow.webContents.send.mockClear()

      eventListener!({
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-2',
            name: 'pod-2',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(1)
    })

    it('should handle rapid burst of events', async () => {
      mockMainWindow.webContents.send.mockClear()

      const eventListener = eventListeners.get('event')

      for (let i = 0; i < 100; i++) {
        eventListener!({
          type: K8sEventType.ADDED,
          contextName: 'test-context',
          resource: {
            kind: 'Pod',
            metadata: {
              uid: `pod-burst-${i}`,
              name: `pod-burst-${i}`,
              namespace: 'default'
            },
            spec: {},
            status: {}
          }
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(mockMainWindow.webContents.send).toHaveBeenCalled()

      let totalDeltas = 0
      mockMainWindow.webContents.send.mock.calls.forEach((call: any[]) => {
        if (call[0] === 'k8s:delta-batch') {
          totalDeltas += call[1].deltas.length
        }
      })

      expect(totalDeltas).toBe(100)
    })

    it('should batch UPDATE events with patches', async () => {
      mockMainWindow.webContents.send.mockClear()

      const eventListener = eventListeners.get('event')

      const addEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-update',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Pending' }
        }
      }

      eventListener!(addEvent)
      await new Promise((resolve) => setTimeout(resolve, 100))

      mockMainWindow.webContents.send.mockClear()

      for (let i = 0; i < 5; i++) {
        eventListener!({
          type: K8sEventType.MODIFIED,
          contextName: 'test-context',
          resource: {
            kind: 'Pod',
            metadata: {
              uid: 'pod-update',
              name: 'test-pod',
              namespace: 'default'
            },
            spec: {},
            status: { phase: 'Running', restartCount: i }
          }
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalled()

      const updateCalls = mockMainWindow.webContents.send.mock.calls.filter((call: any[]) => call[0] === 'k8s:delta-batch')

      expect(updateCalls.length).toBeGreaterThan(0)
    })
  })

  describe('performance optimization', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should reduce IPC calls through batching', async () => {
      mockMainWindow.webContents.send.mockClear()

      const eventListener = eventListeners.get('event')
      const eventCount = 50

      for (let i = 0; i < eventCount; i++) {
        eventListener!({
          type: K8sEventType.ADDED,
          contextName: 'test-context',
          resource: {
            kind: 'Pod',
            metadata: {
              uid: `pod-${i}`,
              name: `pod-${i}`,
              namespace: 'default'
            },
            spec: {},
            status: {}
          }
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 200))

      const ipcCalls = mockMainWindow.webContents.send.mock.calls.filter((call: any[]) => call[0] === 'k8s:delta-batch').length

      expect(ipcCalls).toBeLessThan(eventCount)
      expect(ipcCalls).toBeGreaterThan(0)
    })

    it('should handle mixed event types efficiently', async () => {
      mockMainWindow.webContents.send.mockClear()

      const eventListener = eventListeners.get('event')

      const addEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-mixed',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      eventListener!(addEvent)
      await new Promise((resolve) => setTimeout(resolve, 100))

      mockMainWindow.webContents.send.mockClear()

      for (let i = 0; i < 10; i++) {
        eventListener!({
          type: K8sEventType.MODIFIED,
          contextName: 'test-context',
          resource: {
            ...addEvent.resource,
            status: { phase: 'Running', restartCount: i }
          }
        })
      }

      eventListener!({
        type: K8sEventType.DELETED,
        contextName: 'test-context',
        resource: addEvent.resource
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      const calls = mockMainWindow.webContents.send.mock.calls.filter((call: any[]) => call[0] === 'k8s:delta-batch')

      expect(calls.length).toBeGreaterThan(0)
    })
  })

  describe('edge cases in batching', () => {
    beforeEach(() => {
      deltaPusher.setMainWindow(mockMainWindow as any)
    })

    it('should handle empty batches gracefully', () => {
      expect(() => deltaPusher.flushAll()).not.toThrow()
    })

    it('should handle events for unknown resource types', async () => {
      mockMainWindow.webContents.send.mockClear()

      const eventListener = eventListeners.get('event')

      eventListener!({
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'CustomResource',
          metadata: {
            uid: 'custom-1',
            name: 'custom-resource'
          },
          spec: {},
          status: {}
        }
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('should handle resources without metadata gracefully', async () => {
      const eventListener = eventListeners.get('event')

      const malformedEvent: any = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          spec: {},
          status: {}
        }
      }

      expect(() => eventListener!(malformedEvent)).not.toThrow()
    })
  })
})
