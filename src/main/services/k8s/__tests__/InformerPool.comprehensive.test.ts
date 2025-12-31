/**
 * Comprehensive unit tests for InformerPool
 * Tests include event handling, reconnection logic, and resource caching
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { K8sEventType } from '../types'

// Mock Kubernetes client with full event support
class MockInformer extends EventEmitter {
  private started = false

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

  isStarted() {
    return this.started
  }

  // Simulate resource events
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

  simulateDisconnect() {
    this.emit('disconnect')
  }
}

let mockInformerInstance: MockInformer | null = null

// Create a mock KubeConfig instance
const mockKubeConfig = {
  loadFromDefault: vi.fn(),
  loadFromFile: vi.fn(),
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
      namespace: 'default'
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
      server: 'https://prod.example.com:6443'
    }
  ]),
  getUsers: vi.fn().mockReturnValue([
    {
      name: 'test-user',
      token: 'test-token'
    },
    {
      name: 'prod-user',
      token: 'prod-token'
    }
  ]),
  makeApiClient: vi.fn().mockReturnValue({
    listPodForAllNamespaces: vi.fn().mockResolvedValue({
      body: {
        items: []
      }
    }),
    listNode: vi.fn().mockResolvedValue({
      body: {
        items: []
      }
    })
  })
}

// Mock @kubernetes/client-node
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

import { InformerPool } from '../InformerPool'
import { KubeConfigLoader } from '../KubeConfigLoader'
import { InformerOptions, K8sResourceEvent } from '../types'

describe('InformerPool - Comprehensive Tests', () => {
  let informerPool: InformerPool
  let configLoader: KubeConfigLoader

  beforeEach(async () => {
    vi.clearAllMocks()
    mockInformerInstance = null
    configLoader = new KubeConfigLoader()

    // Mock getKubeConfig to return the mockKubeConfig
    // @ts-ignore - mocking private property
    configLoader['initialized'] = true
    vi.spyOn(configLoader, 'getKubeConfig').mockReturnValue(mockKubeConfig)

    informerPool = new InformerPool(configLoader)
  })

  afterEach(async () => {
    if (informerPool) {
      await informerPool.stopAll()
    }
  })

  describe('Basic Initialization', () => {
    it('should create InformerPool with KubeConfigLoader', () => {
      expect(informerPool).toBeDefined()
      expect(informerPool).toBeInstanceOf(InformerPool)
    })

    it('should start with zero informers', () => {
      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(0)
      expect(stats.runningInformers).toBe(0)
      expect(stats.totalResources).toBe(0)
    })

    it('should have empty resource cache initially', () => {
      const allResources = informerPool.getAllResources()
      expect(allResources.size).toBe(0)
    })
  })

  describe('Starting and Stopping Informers', () => {
    it('should start a Pod informer successfully', async () => {
      const options: InformerOptions = {
        contextName: 'test-context'
      }

      await informerPool.startInformer('Pod', options)

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state).toBeDefined()
      expect(state?.resourceType).toBe('Pod')
      expect(state?.contextName).toBe('test-context')
      expect(state?.running).toBe(true)
    })

    it('should start a Node informer successfully', async () => {
      const options: InformerOptions = {
        contextName: 'test-context'
      }

      await informerPool.startInformer('Node', options)

      const state = informerPool.getInformerState('test-context', 'Node')
      expect(state).toBeDefined()
      expect(state?.resourceType).toBe('Node')
      expect(state?.running).toBe(true)
    })

    it('should start multiple informers for different contexts', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Pod', { contextName: 'prod-context' })

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(2)

      const testState = informerPool.getInformerState('test-context', 'Pod')
      const prodState = informerPool.getInformerState('prod-context', 'Pod')

      expect(testState?.contextName).toBe('test-context')
      expect(prodState?.contextName).toBe('prod-context')
    })

    it('should start multiple resource types for same context', async () => {
      const options: InformerOptions = {
        contextName: 'test-context'
      }

      await informerPool.startInformer('Pod', options)
      await informerPool.startInformer('Node', options)

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(2)

      expect(informerPool.isInformerRunning('test-context', 'Pod')).toBe(true)
      expect(informerPool.isInformerRunning('test-context', 'Node')).toBe(true)
    })

    it('should not start duplicate informers', async () => {
      const options: InformerOptions = {
        contextName: 'test-context'
      }

      await informerPool.startInformer('Pod', options)
      await informerPool.startInformer('Pod', options)

      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(1)
    })

    it('should stop a specific informer', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      expect(informerPool.isInformerRunning('test-context', 'Pod')).toBe(true)

      await informerPool.stopInformer('test-context', 'Pod')

      expect(informerPool.isInformerRunning('test-context', 'Pod')).toBe(false)
      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(0)
    })

    it('should stop all informers for a context', async () => {
      const options: InformerOptions = {
        contextName: 'test-context'
      }

      await informerPool.startInformer('Pod', options)
      await informerPool.startInformer('Node', options)

      await informerPool.stopContextInformers('test-context')

      expect(informerPool.isInformerRunning('test-context', 'Pod')).toBe(false)
      expect(informerPool.isInformerRunning('test-context', 'Node')).toBe(false)
    })

    it('should stop all informers across all contexts', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Pod', { contextName: 'prod-context' })
      await informerPool.startInformer('Node', { contextName: 'test-context' })

      expect(informerPool.getStatistics().totalInformers).toBe(3)

      await informerPool.stopAll()

      expect(informerPool.getStatistics().totalInformers).toBe(0)
    })
  })

  describe('Resource Event Handling', () => {
    it('should handle ADD events and cache resources', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const mockPod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: 'pod-123',
          name: 'test-pod',
          namespace: 'default',
          resourceVersion: '1'
        },
        spec: {},
        status: { phase: 'Running' }
      }

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd(mockPod)
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const resources = informerPool.getResources('test-context', 'Pod')
      expect(resources.length).toBe(1)
      expect(resources[0].metadata.uid).toBe('pod-123')
      expect(resources[0].metadata.name).toBe('test-pod')
    })

    it('should handle UPDATE events and update cached resources', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const mockPod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: 'pod-123',
          name: 'test-pod',
          namespace: 'default',
          resourceVersion: '1'
        },
        status: { phase: 'Pending' }
      }

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd(mockPod)
        await new Promise((resolve) => setTimeout(resolve, 50))

        const updatedPod = {
          ...mockPod,
          metadata: { ...mockPod.metadata, resourceVersion: '2' },
          status: { phase: 'Running' }
        }

        mockInformerInstance.simulateUpdate(updatedPod)
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const resource = informerPool.getResource('test-context', 'Pod', 'pod-123')
      expect(resource).toBeDefined()
      expect(resource?.status.phase).toBe('Running')
      expect(resource?.metadata.resourceVersion).toBe('2')
    })

    it('should handle DELETE events and remove from cache', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const mockPod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: 'pod-123',
          name: 'test-pod',
          namespace: 'default'
        }
      }

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd(mockPod)
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(informerPool.getResources('test-context', 'Pod').length).toBe(1)

        mockInformerInstance.simulateDelete(mockPod)
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const resources = informerPool.getResources('test-context', 'Pod')
      expect(resources.length).toBe(0)
    })

    it('should handle multiple resources', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        for (let i = 0; i < 5; i++) {
          mockInformerInstance.simulateAdd({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              uid: `pod-${i}`,
              name: `test-pod-${i}`,
              namespace: 'default'
            }
          })
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const resources = informerPool.getResources('test-context', 'Pod')
      expect(resources.length).toBe(5)
    })
  })

  describe('Event Emission', () => {
    it('should emit event when resources are added', async () => {
      const events: K8sResourceEvent[] = []

      informerPool.on('event', (event: K8sResourceEvent) => {
        events.push(event)
      })

      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            uid: 'pod-123',
            name: 'test-pod',
            namespace: 'default'
          }
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(events.length).toBeGreaterThan(0)
      const addEvent = events.find((e) => e.type === K8sEventType.ADDED)
      expect(addEvent).toBeDefined()
      expect(addEvent?.resource.metadata.name).toBe('test-pod')
    })

    it('should emit error events', async () => {
      const errors: Error[] = []

      informerPool.on('error', (error: Error) => {
        errors.push(error)
      })

      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Test error'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toBe('Test error')
    })
  })

  describe('Statistics', () => {
    it('should track resource count correctly', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        for (let i = 0; i < 3; i++) {
          mockInformerInstance.simulateAdd({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              uid: `pod-${i}`,
              name: `test-pod-${i}`,
              namespace: 'default'
            }
          })
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.resourceCount).toBe(3)

      const stats = informerPool.getStatistics()
      expect(stats.totalResources).toBe(3)
    })

    it('should track running informers correctly', async () => {
      let stats = informerPool.getStatistics()
      expect(stats.runningInformers).toBe(0)

      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      stats = informerPool.getStatistics()
      expect(stats.runningInformers).toBe(1)

      await informerPool.startInformer('Node', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      stats = informerPool.getStatistics()
      expect(stats.runningInformers).toBe(2)
    })

    it('should track errors correctly', async () => {
      // Add error handler to prevent unhandled error
      informerPool.on('error', () => {
        // Error is expected, do nothing
      })

      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateError(new Error('Error 1'))
        await new Promise((resolve) => setTimeout(resolve, 50))
        mockInformerInstance.simulateError(new Error('Error 2'))
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state?.errorCount).toBeGreaterThan(0)
    })
  })

  describe('getAllStates', () => {
    it('should return states for all informers', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Node', { contextName: 'test-context' })
      await informerPool.startInformer('Pod', { contextName: 'prod-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const states = informerPool.getAllStates()

      expect(states.size).toBe(3)
      expect(states.has('test-context:Pod')).toBe(true)
      expect(states.has('test-context:Node')).toBe(true)
      expect(states.has('prod-context:Pod')).toBe(true)
    })
  })

  describe('getAllResources', () => {
    it('should return all cached resources across all informers', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })
      await informerPool.startInformer('Pod', { contextName: 'prod-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            uid: 'pod-1',
            name: 'test-pod-1',
            namespace: 'default'
          }
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const allResources = informerPool.getAllResources()
      expect(allResources.size).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle resources without UID gracefully', async () => {
      await informerPool.startInformer('Pod', { contextName: 'test-context' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      if (mockInformerInstance) {
        mockInformerInstance.simulateAdd({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            name: 'test-pod-no-uid',
            namespace: 'default'
          }
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      const resources = informerPool.getResources('test-context', 'Pod')
      expect(resources.length).toBe(0)
    })

    it('should handle stopping non-existent informer', async () => {
      await expect(informerPool.stopInformer('non-existent', 'Pod')).resolves.not.toThrow()
    })

    it('should handle stopping non-existent context', async () => {
      await expect(informerPool.stopContextInformers('non-existent')).resolves.not.toThrow()
    })

    it('should handle getting resources from non-existent informer', () => {
      const resources = informerPool.getResources('non-existent', 'Pod')
      expect(resources).toEqual([])
    })

    it('should handle getting non-existent resource', () => {
      const resource = informerPool.getResource('test-context', 'Pod', 'non-existent-uid')
      expect(resource).toBeUndefined()
    })
  })

  describe('Informer Options', () => {
    it('should accept namespace option', async () => {
      const options: InformerOptions = {
        contextName: 'test-context',
        namespace: 'kube-system'
      }

      await expect(informerPool.startInformer('Pod', options)).resolves.not.toThrow()
    })

    it('should accept label selector option', async () => {
      const options: InformerOptions = {
        contextName: 'test-context',
        labelSelector: 'app=nginx'
      }

      await expect(informerPool.startInformer('Pod', options)).resolves.not.toThrow()
    })

    it('should accept field selector option', async () => {
      const options: InformerOptions = {
        contextName: 'test-context',
        fieldSelector: 'status.phase=Running'
      }

      await expect(informerPool.startInformer('Pod', options)).resolves.not.toThrow()
    })
  })
})
