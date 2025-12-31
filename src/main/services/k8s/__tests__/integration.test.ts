/**
 * Integration Tests for K8s Steps 1-3
 *
 * Tests the full pipeline:
 * Step 1: KubeConfigLoader - Load and parse kubeconfig
 * Step 2: InformerPool - Watch K8s resources with cache
 * Step 3: DeltaPusher - Calculate deltas and push to IPC
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { KubeConfigLoader } from '../KubeConfigLoader'
import { InformerPool } from '../InformerPool'
import { DeltaPusher } from '../DeltaPusher'

// Mock Informer
class MockInformer extends EventEmitter {
  private started = false

  isStarted() {
    return this.started
  }

  async start() {
    this.started = true
    setTimeout(() => this.emit('connect'), 10)
    return Promise.resolve()
  }

  async stop() {
    this.started = false
    setTimeout(() => this.emit('disconnect'), 10)
    return Promise.resolve()
  }

  simulateAdd(resource: any) {
    this.emit('add', resource)
  }

  simulateUpdate(resource: any) {
    this.emit('update', resource)
  }

  simulateDelete(resource: any) {
    this.emit('delete', resource)
  }

  simulateError(error: Error) {
    this.emit('error', error)
  }
}

let mockInformerInstance: MockInformer | null = null

const mockKubeConfig = {
  loadFromDefault: vi.fn(),
  setCurrentContext: vi.fn(),
  getCurrentContext: vi.fn().mockReturnValue('test-context'),
  getContexts: vi.fn().mockReturnValue([
    {
      name: 'test-context',
      cluster: 'test-cluster',
      user: 'test-user',
      namespace: 'default'
    },
    {
      name: 'prod-context',
      cluster: 'prod-cluster',
      user: 'prod-user',
      namespace: 'production'
    }
  ]),
  getClusters: vi.fn().mockReturnValue([
    {
      name: 'test-cluster',
      server: 'https://127.0.0.1:6443',
      skipTLSVerify: true
    },
    {
      name: 'prod-cluster',
      server: 'https://prod.k8s.example.com:6443',
      caFile: '/path/to/ca.crt'
    }
  ]),
  getUsers: vi.fn().mockReturnValue([
    {
      name: 'test-user',
      token: 'test-token-123'
    },
    {
      name: 'prod-user',
      certFile: '/path/to/client.crt',
      keyFile: '/path/to/client.key'
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
}

vi.mock('@kubernetes/client-node', () => {
  return {
    KubeConfig: vi.fn().mockImplementation(() => mockKubeConfig),
    CoreV1Api: vi.fn(),
    makeInformer: vi.fn().mockImplementation(() => {
      mockInformerInstance = new MockInformer()
      return mockInformerInstance
    })
  }
})

// Mock Electron BrowserWindow
const mockMainWindow = {
  webContents: {
    send: vi.fn()
  },
  isDestroyed: vi.fn().mockReturnValue(false)
}

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

describe('K8s Integration Tests - Steps 1-3', () => {
  let configLoader: KubeConfigLoader
  let informerPool: InformerPool
  let deltaPusher: DeltaPusher

  beforeEach(async () => {
    vi.clearAllMocks()
    mockInformerInstance = null

    configLoader = new KubeConfigLoader()

    // Properly mock initialization
    await configLoader.loadFromDefault()

    informerPool = new InformerPool(configLoader)
    deltaPusher = new DeltaPusher(informerPool, {
      throttleWindowMs: 50,
      maxBatchSize: 10
    })

    deltaPusher.setMainWindow(mockMainWindow as any)

    informerPool.on('error', () => {})
  })

  afterEach(async () => {
    if (deltaPusher) {
      deltaPusher.destroy()
    }
    if (informerPool) {
      await informerPool.stopAll()
    }
  })

  describe('Step 1: KubeConfig Loading', () => {
    it('should load kubeconfig with multiple contexts', async () => {
      const result = await configLoader.loadFromDefault()

      expect(result.success).toBe(true)
      expect(result.contexts).toHaveLength(2)
      expect(result.contexts[0].name).toBe('test-context')
      expect(result.contexts[1].name).toBe('prod-context')
    })

    it('should extract context details correctly', async () => {
      await configLoader.loadFromDefault()

      const testContext = configLoader.getContextDetail('test-context')
      expect(testContext?.clusterInfo?.server).toBe('https://127.0.0.1:6443')
      expect(testContext?.userInfo?.token).toBe('test-token-123')

      const prodContext = configLoader.getContextDetail('prod-context')
      expect(prodContext?.clusterInfo?.server).toBe('https://prod.k8s.example.com:6443')
      expect(prodContext?.userInfo?.clientCertificate).toBe('/path/to/client.crt')
    })
  })

  describe('Step 2: Informer Pool Integration', () => {
    it('should start informer using loaded kubeconfig', async () => {
      await configLoader.loadFromDefault()

      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state).toBeDefined()
      expect(state?.running).toBe(true)
      expect(state?.contextName).toBe('test-context')
    })

    it('should maintain separate informers for different contexts', async () => {
      await configLoader.loadFromDefault()

      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Pod', { contextName: 'prod-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(2)
      expect(stats.runningInformers).toBe(2)
    })
  })

  describe('Step 3: Delta Calculation and IPC', () => {
    it('should push deltas to renderer after receiving informer events', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      mockMainWindow.webContents.send.mockClear()

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            uid: 'pod-123',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Running' }
        })
      }

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

    it('should batch multiple events within throttle window', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      mockMainWindow.webContents.send.mockClear()

      if (mockInformerInstance) {
        for (let i = 0; i < 5; i++) {
          mockInformerInstance.simulateAdd({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              uid: `pod-${i}`,
              name: `test-pod-${i}`,
              namespace: 'default'
            },
            spec: {},
            status: {}
          })
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      const deltaBatchCalls = mockMainWindow.webContents.send.mock.calls.filter((call: any[]) => call[0] === 'k8s:delta-batch')

      expect(deltaBatchCalls.length).toBeGreaterThan(0)
      expect(deltaBatchCalls.length).toBeLessThan(5)

      let totalDeltas = 0
      deltaBatchCalls.forEach((call: any[]) => {
        totalDeltas += call[1].deltas.length
      })
      expect(totalDeltas).toBe(5)
    })
  })

  describe('Full Pipeline - End to End', () => {
    it('should handle complete lifecycle: load config -> start informer -> receive events -> push deltas', async () => {
      const loadResult = await configLoader.loadFromDefault()
      expect(loadResult.success).toBe(true)

      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.running).toBe(true)

      mockMainWindow.webContents.send.mockClear()

      if (mockInformerInstance) {
        const pod = {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            uid: 'end-to-end-pod',
            name: 'e2e-test-pod',
            namespace: 'default'
          },
          spec: {},
          status: { phase: 'Pending' }
        }

        mockInformerInstance.simulateAdd(pod)
        await new Promise((resolve) => setTimeout(resolve, 100))

        mockInformerInstance.simulateUpdate({
          ...pod,
          status: { phase: 'Running' }
        })
        await new Promise((resolve) => setTimeout(resolve, 100))

        mockInformerInstance.simulateDelete(pod)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      const allCalls = mockMainWindow.webContents.send.mock.calls.filter((call: any[]) => call[0] === 'k8s:delta-batch')

      expect(allCalls.length).toBeGreaterThan(0)

      const hasAddEvent = allCalls.some((call: any[]) => call[1].deltas.some((delta: any) => delta.type === 'ADD'))
      const hasUpdateEvent = allCalls.some((call: any[]) => call[1].deltas.some((delta: any) => delta.type === 'UPDATE'))
      const hasDeleteEvent = allCalls.some((call: any[]) => call[1].deltas.some((delta: any) => delta.type === 'DELETE'))

      expect(hasAddEvent).toBe(true)
      expect(hasUpdateEvent).toBe(true)
      expect(hasDeleteEvent).toBe(true)
    })

    it('should handle multiple contexts simultaneously', async () => {
      await configLoader.loadFromDefault()

      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Pod', { contextName: 'prod-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      mockMainWindow.webContents.send.mockClear()

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            uid: 'multi-context-pod',
            name: 'pod-1',
            namespace: 'default'
          },
          spec: {},
          status: {}
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockMainWindow.webContents.send).toHaveBeenCalled()

      const stats = deltaPusher.getStatistics()
      expect(stats.totalCalculators).toBeGreaterThan(0)
    })

    it('should maintain resource cache and push accurate deltas', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        for (let i = 0; i < 3; i++) {
          mockInformerInstance.simulateAdd({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              uid: `cache-pod-${i}`,
              name: `pod-${i}`,
              namespace: 'default'
            },
            spec: {},
            status: {}
          })
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      const resources = informerPool.getResources('test-context', 'Pod')
      expect(resources.length).toBe(3)

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.resourceCount).toBe(3)
    })
  })

  describe('Error Handling Across Pipeline', () => {
    it('should handle informer errors without crashing', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('K8s API connection lost'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.errorCount).toBeGreaterThan(0)
      expect(state?.running).toBe(true)
    })

    it('should handle IPC send errors gracefully', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      mockMainWindow.webContents.send.mockImplementation(() => {
        throw new Error('IPC channel closed')
      })

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            uid: 'error-pod',
            name: 'test-pod',
            namespace: 'default'
          },
          spec: {},
          status: {}
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(() => deltaPusher.flushAll()).not.toThrow()
    })
  })

  describe('Performance - Throttling Validation', () => {
    it('should reduce IPC overhead through throttling', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      mockMainWindow.webContents.send.mockClear()

      if (mockInformerInstance) {
        for (let i = 0; i < 100; i++) {
          mockInformerInstance.simulateAdd({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              uid: `perf-pod-${i}`,
              name: `pod-${i}`,
              namespace: 'default'
            },
            spec: {},
            status: {}
          })
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200))

      const ipcCalls = mockMainWindow.webContents.send.mock.calls.filter((call: any[]) => call[0] === 'k8s:delta-batch').length

      expect(ipcCalls).toBeLessThan(100)
      expect(ipcCalls).toBeGreaterThan(0)
    })
  })

  describe('Cleanup and Resource Management', () => {
    it('should cleanup all resources properly', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Node', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      let stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(2)

      deltaPusher.destroy()
      await informerPool.stopAll()

      stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(0)
      expect(stats.runningInformers).toBe(0)

      const pusherStats = deltaPusher.getStatistics()
      expect(pusherStats.totalCalculators).toBe(0)
    })

    it('should stop specific context informers', async () => {
      await configLoader.loadFromDefault()
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Pod', { contextName: 'prod-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      await informerPool.stopContextInformers('test-context')

      expect(informerPool.isInformerRunning('test-context', 'Pod')).toBe(false)
      expect(informerPool.isInformerRunning('prod-context', 'Pod')).toBe(true)

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(1)
    })
  })
})
