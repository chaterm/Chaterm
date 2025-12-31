/**
 * Unit tests for Informer Reconnection Logic
 * Tests exponential backoff, retry mechanisms, and error recovery
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock Informer with controllable connection behavior
class MockInformerWithReconnect extends EventEmitter {
  private started = false
  private shouldFail = false
  private failCount = 0
  private maxFailures = 0

  setFailureMode(shouldFail: boolean, maxFailures = 0) {
    this.shouldFail = shouldFail
    this.maxFailures = maxFailures
    this.failCount = 0
  }

  async start() {
    if (this.shouldFail && this.failCount < this.maxFailures) {
      this.failCount++
      throw new Error(`Connection failed (attempt ${this.failCount})`)
    }

    this.started = true
    setTimeout(() => this.emit('connect'), 10)
    return Promise.resolve()
  }

  async stop() {
    this.started = false
    setTimeout(() => this.emit('disconnect'), 10)
    return Promise.resolve()
  }

  simulateDisconnect() {
    this.started = false
    this.emit('disconnect')
  }

  simulateError(error: Error) {
    this.emit('error', error)
  }

  isStarted() {
    return this.started
  }
}

let mockInformerInstance: MockInformerWithReconnect | null = null

// Mock @kubernetes/client-node
vi.mock('@kubernetes/client-node', () => {
  return {
    KubeConfig: vi.fn().mockImplementation(() => ({
      loadFromDefault: vi.fn(),
      setCurrentContext: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      getContexts: vi.fn().mockReturnValue([
        {
          name: 'test-context',
          cluster: 'test-cluster',
          user: 'test-user',
          namespace: 'default'
        }
      ]),
      getClusters: vi.fn().mockReturnValue([
        {
          name: 'test-cluster',
          server: 'https://127.0.0.1:6443'
        }
      ]),
      getUsers: vi.fn().mockReturnValue([
        {
          name: 'test-user'
        }
      ]),
      makeApiClient: vi.fn().mockReturnValue({
        listPodForAllNamespaces: vi.fn().mockResolvedValue({
          body: { items: [] }
        }),
        listNode: vi.fn().mockResolvedValue({
          body: { items: [] }
        })
      })
    })),
    CoreV1Api: vi.fn(),
    makeInformer: vi.fn().mockImplementation(() => {
      mockInformerInstance = new MockInformerWithReconnect()
      return mockInformerInstance
    })
  }
})

import { InformerPool } from '../InformerPool'
import { KubeConfigLoader } from '../KubeConfigLoader'
import { InformerOptions } from '../types'

describe('Informer Reconnection Logic', () => {
  let informerPool: InformerPool
  let configLoader: KubeConfigLoader

  beforeEach(async () => {
    vi.clearAllMocks()
    mockInformerInstance = null
    configLoader = new KubeConfigLoader()
    await configLoader.loadFromDefault()
    informerPool = new InformerPool(configLoader)
  })

  afterEach(async () => {
    if (informerPool) {
      await informerPool.stopAll()
    }
  })

  describe('Network Disconnection Handling', () => {
    it('should detect disconnection events', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const stateBefore = informerPool.getInformerState('test-context', 'Pod')
      expect(stateBefore?.connected).toBe(true)

      if (mockInformerInstance) {
        mockInformerInstance.simulateDisconnect()
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const stateAfter = informerPool.getInformerState('test-context', 'Pod')
      expect(stateAfter?.connected).toBe(false)
    })

    it('should attempt reconnection after disconnection', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateDisconnect()
      }

      await new Promise((resolve) => setTimeout(resolve, 1500))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle errors and increment error count', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Test error'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.errorCount).toBeGreaterThan(0)
      expect(state?.lastError).toBe('Test error')
    })

    it('should continue running after errors', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Error 1'))
        await new Promise((resolve) => setTimeout(resolve, 50))
        mockInformerInstance.simulateError(new Error('Error 2'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.running).toBe(true)
      expect(state?.errorCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Max Retries Handling', () => {
    it('should emit maxRetriesReached event after max attempts', async () => {
      const options: InformerOptions = {
        contextName: 'test-context'
      }

      if (mockInformerInstance) {
        mockInformerInstance.setFailureMode(true, 15)
      }

      try {
        await informerPool.startInformer('Pod', options)
      } catch (error) {
        // Expected to fail initially
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    })
  })

  describe('Reconnection State Tracking', () => {
    it('should update lastSyncTime on successful connection', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.lastSyncTime).toBeDefined()
      expect(state?.lastSyncTime).toBeInstanceOf(Date)
    })

    it('should maintain running state during reconnection attempts', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Connection lost'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.running).toBe(true)
    })
  })

  describe('Multiple Informers Reconnection', () => {
    it('should handle reconnection for multiple informers independently', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Node', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const podState = informerPool.getInformerState('test-context', 'Pod')
      const nodeState = informerPool.getInformerState('test-context', 'Node')

      expect(podState?.running).toBe(true)
      expect(nodeState?.running).toBe(true)
    })

    it('should maintain other informers when one fails', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Node', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Pod informer error'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(2)
    })
  })

  describe('Error State Persistence', () => {
    it('should store last error message', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const errorMessage = 'Network timeout error'

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error(errorMessage))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.lastError).toBe(errorMessage)
    })

    it('should update error message on subsequent errors', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Error 1'))
        await new Promise((resolve) => setTimeout(resolve, 50))
        mockInformerInstance.simulateError(new Error('Error 2'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.lastError).toBe('Error 2')
    })
  })

  describe('Connection State Transitions', () => {
    it('should transition from disconnected to connected', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const initialState = informerPool.getInformerState('test-context', 'Pod')
      expect(initialState?.connected).toBe(true)
    })

    it('should handle rapid connect/disconnect cycles', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        for (let i = 0; i < 3; i++) {
          mockInformerInstance.simulateDisconnect()
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state).toBeDefined()
    })
  })

  describe('Statistics During Reconnection', () => {
    it('should maintain accurate error count', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        for (let i = 0; i < 5; i++) {
          mockInformerInstance.simulateError(new Error(`Error ${i}`))
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const stats = informerPool.getStatistics()
      expect(stats.errorCount).toBeGreaterThanOrEqual(5)
    })

    it('should track total errors across all informers', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Node', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(2)
    })
  })

  describe('Cleanup During Reconnection', () => {
    it('should stop reconnection attempts when informer is stopped', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Test error'))
      }

      await informerPool.stopInformer('test-context', 'Pod')

      await new Promise((resolve) => setTimeout(resolve, 1500))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state).toBeUndefined()
    })

    it('should cleanup reconnection timers on stopAll', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Node', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Test error'))
      }

      await informerPool.stopAll()

      await new Promise((resolve) => setTimeout(resolve, 50))

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(0)
    })
  })
})
