import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { DeltaCalculator } from '../DeltaCalculator'
import { K8sEventType, K8sResourceEvent, DeltaBatch } from '../types'

describe('DeltaCalculator', () => {
  let calculator: DeltaCalculator
  let batchReadyCallback: Mock

  beforeEach(() => {
    batchReadyCallback = vi.fn()
    calculator = new DeltaCalculator({
      throttleWindowMs: 50,
      maxBatchSize: 10,
      onBatchReady: batchReadyCallback
    })
  })

  describe('processEvent - ADD event', () => {
    it('should handle new resource addition', async () => {
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

      calculator.processEvent(event, 'Pod')

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(batchReadyCallback).toHaveBeenCalledTimes(1)
      const batch: DeltaBatch = batchReadyCallback.mock.calls[0][0]

      expect(batch.totalChanges).toBe(1)
      expect(batch.deltas[0].type).toBe('ADD')
      expect(batch.deltas[0].uid).toBe('pod-123')
      expect(batch.deltas[0].fullResource).toBeDefined()
      expect(batch.deltas[0].fullResource?.metadata.name).toBe('test-pod')
    })

    it('should sanitize resource by removing managedFields', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-456',
            name: 'test-pod-2',
            namespace: 'default',
            managedFields: [{ manager: 'test' }],
            selfLink: '/api/v1/namespaces/default/pods/test-pod-2'
          },
          spec: {},
          status: {}
        }
      }

      calculator.processEvent(event, 'Pod')

      await new Promise((resolve) => setTimeout(resolve, 100))

      const batch: DeltaBatch = batchReadyCallback.mock.calls[0][0]
      const resource = batch.deltas[0].fullResource

      expect(resource?.metadata.managedFields).toBeUndefined()
      expect(resource?.metadata.selfLink).toBeUndefined()
    })
  })

  describe('processEvent - MODIFIED event', () => {
    it('should compute diff patches for modified resource', async () => {
      const addEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-789',
            name: 'test-pod-3',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Pending' }
        }
      }

      calculator.processEvent(addEvent, 'Pod')
      await new Promise((resolve) => setTimeout(resolve, 100))

      batchReadyCallback.mockClear()

      const modifyEvent: K8sResourceEvent = {
        type: K8sEventType.MODIFIED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-789',
            name: 'test-pod-3',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Running' }
        }
      }

      calculator.processEvent(modifyEvent, 'Pod')
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(batchReadyCallback).toHaveBeenCalledTimes(1)
      const batch: DeltaBatch = batchReadyCallback.mock.calls[0][0]

      expect(batch.deltas[0].type).toBe('UPDATE')
      expect(batch.deltas[0].patches).toBeDefined()
      expect(batch.deltas[0].patches!.length).toBeGreaterThan(0)
    })

    it('should skip update if no changes detected', async () => {
      const addEvent: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-999',
            name: 'test-pod-4',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Running' }
        }
      }

      calculator.processEvent(addEvent, 'Pod')
      await new Promise((resolve) => setTimeout(resolve, 100))

      batchReadyCallback.mockClear()

      const sameEvent: K8sResourceEvent = {
        type: K8sEventType.MODIFIED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-999',
            name: 'test-pod-4',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Running' }
        }
      }

      calculator.processEvent(sameEvent, 'Pod')
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(batchReadyCallback).not.toHaveBeenCalled()
    })
  })

  describe('processEvent - DELETED event', () => {
    it('should handle resource deletion', async () => {
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

      calculator.processEvent(addEvent, 'Pod')
      await new Promise((resolve) => setTimeout(resolve, 100))

      batchReadyCallback.mockClear()

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

      calculator.processEvent(deleteEvent, 'Pod')
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(batchReadyCallback).toHaveBeenCalledTimes(1)
      const batch: DeltaBatch = batchReadyCallback.mock.calls[0][0]

      expect(batch.deltas[0].type).toBe('DELETE')
      expect(batch.deltas[0].uid).toBe('pod-del')
      expect(batch.deltas[0].fullResource).toBeUndefined()
      expect(batch.deltas[0].patches).toBeUndefined()
    })
  })

  describe('throttling and batching', () => {
    it('should batch multiple changes within throttle window', async () => {
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

      events.forEach((event) => calculator.processEvent(event, 'Pod'))

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(batchReadyCallback).toHaveBeenCalledTimes(1)
      const batch: DeltaBatch = batchReadyCallback.mock.calls[0][0]

      expect(batch.totalChanges).toBe(5)
      expect(batch.deltas.length).toBe(5)
    })

    it('should flush immediately when maxBatchSize is reached', async () => {
      const newCallback = vi.fn()
      calculator = new DeltaCalculator({
        throttleWindowMs: 1000,
        maxBatchSize: 3,
        onBatchReady: newCallback
      })

      const events: K8sResourceEvent[] = Array.from({ length: 5 }, (_, i) => ({
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: `pod-max-${i}`,
            name: `test-pod-${i}`,
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }))

      events.forEach((event) => calculator.processEvent(event, 'Pod'))

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(newCallback).toHaveBeenCalledTimes(1)
      const firstBatch: DeltaBatch = newCallback.mock.calls[0][0]
      expect(firstBatch.totalChanges).toBe(3)
    })
  })

  describe('flush', () => {
    it('should manually flush pending deltas', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-flush',
            name: 'test-pod-flush',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      calculator.processEvent(event, 'Pod')

      calculator.flush()

      expect(batchReadyCallback).toHaveBeenCalledTimes(1)
    })

    it('should not call callback if no pending deltas', () => {
      calculator.flush()

      expect(batchReadyCallback).not.toHaveBeenCalled()
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const events: K8sResourceEvent[] = Array.from({ length: 3 }, (_, i) => ({
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: `pod-stats-${i}`,
            name: `test-pod-${i}`,
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }))

      events.forEach((event) => calculator.processEvent(event, 'Pod'))

      const stats = calculator.getStats()

      expect(stats.cachedResources).toBe(3)
      expect(stats.totalChangesProcessed).toBe(3)
      expect(stats.pendingDeltas).toBe(3)

      await new Promise((resolve) => setTimeout(resolve, 100))

      const statsAfterFlush = calculator.getStats()
      expect(statsAfterFlush.pendingDeltas).toBe(0)
    })
  })

  describe('clearCache', () => {
    it('should clear all cached resources and pending deltas', async () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-clear',
            name: 'test-pod-clear',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      calculator.processEvent(event, 'Pod')

      calculator.clearCache()

      const stats = calculator.getStats()
      expect(stats.cachedResources).toBe(0)
      expect(stats.pendingDeltas).toBe(0)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(batchReadyCallback).not.toHaveBeenCalled()
    })
  })

  describe('destroy', () => {
    it('should clean up all resources', () => {
      const event: K8sResourceEvent = {
        type: K8sEventType.ADDED,
        contextName: 'test-context',
        resource: {
          kind: 'Pod',
          metadata: {
            uid: 'pod-destroy',
            name: 'test-pod-destroy',
            namespace: 'default'
          },
          spec: {},
          status: {}
        }
      }

      calculator.processEvent(event, 'Pod')

      calculator.destroy()

      const stats = calculator.getStats()
      expect(stats.cachedResources).toBe(0)
      expect(stats.pendingDeltas).toBe(0)
    })
  })
})
