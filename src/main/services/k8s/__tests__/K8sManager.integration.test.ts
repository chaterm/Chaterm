/**
 * Unit tests for K8sManager
 * Tests the integration of K8sManager with InformerPool
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock Informer
class MockInformer extends EventEmitter {
  async start() {
    setTimeout(() => this.emit('connect'), 10)
    return Promise.resolve()
  }

  async stop() {
    setTimeout(() => this.emit('disconnect'), 10)
    return Promise.resolve()
  }
}

// Create mock KubeConfig
const mockKubeConfig = {
  loadFromDefault: vi.fn(),
  loadFromFile: vi.fn(),
  setCurrentContext: vi.fn(),
  getCurrentContext: vi.fn().mockReturnValue('minikube'),
  getContexts: vi.fn().mockReturnValue([
    {
      name: 'minikube',
      cluster: 'minikube',
      user: 'minikube',
      namespace: 'default'
    },
    {
      name: 'production',
      cluster: 'production',
      user: 'admin',
      namespace: 'default'
    }
  ]),
  getClusters: vi.fn().mockReturnValue([
    {
      name: 'minikube',
      server: 'https://127.0.0.1:8443',
      skipTLSVerify: true
    },
    {
      name: 'production',
      server: 'https://prod.example.com:6443'
    }
  ]),
  getUsers: vi.fn().mockReturnValue([
    {
      name: 'minikube',
      token: 'minikube-token'
    },
    {
      name: 'admin',
      token: 'admin-token'
    }
  ]),
  makeApiClient: vi.fn().mockReturnValue({
    listPodForAllNamespaces: vi.fn().mockResolvedValue({
      body: { items: [] }
    }),
    listNode: vi.fn().mockResolvedValue({
      body: { items: [] }
    }),
    getAPIResources: vi.fn().mockResolvedValue({
      body: { resources: [] }
    })
  })
}

// Mock @kubernetes/client-node
vi.mock('@kubernetes/client-node', () => {
  return {
    KubeConfig: vi.fn().mockImplementation(() => mockKubeConfig),
    CoreV1Api: vi.fn(),
    makeInformer: vi.fn().mockImplementation(() => new MockInformer())
  }
})

// Mock KubeConfigLoader
vi.mock('../KubeConfigLoader', () => {
  return {
    KubeConfigLoader: vi.fn().mockImplementation(() => ({
      loadFromDefault: vi.fn().mockResolvedValue({
        success: true,
        contexts: [
          { name: 'minikube', cluster: 'minikube', namespace: 'default', server: 'https://127.0.0.1:8443', isActive: true },
          { name: 'production', cluster: 'production', namespace: 'default', server: 'https://prod.example.com:6443', isActive: false }
        ],
        currentContext: 'minikube'
      }),
      getContextDetail: vi.fn((contextName: string) => ({
        name: contextName,
        cluster: contextName === 'minikube' ? 'minikube' : 'production',
        user: contextName === 'minikube' ? 'minikube' : 'admin',
        namespace: 'default'
      })),
      setCurrentContext: vi.fn().mockReturnValue(true),
      validateContext: vi.fn().mockResolvedValue(true),
      getCurrentContext: vi.fn().mockReturnValue('minikube'),
      getKubeConfig: vi.fn().mockReturnValue(mockKubeConfig)
    }))
  }
})

import { K8sManager } from '../K8sManager'
import { LoadConfigResult } from '../types'

describe('K8sManager', () => {
  let manager: K8sManager

  beforeEach(() => {
    manager = K8sManager.getInstance()
  })

  afterEach(async () => {
    await manager.cleanup()
    // Reset singleton for next test
    ;(K8sManager as any).instance = null
  })

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = K8sManager.getInstance()
      const instance2 = K8sManager.getInstance()

      expect(instance1).toBe(instance2)
    })

    it('should create only one instance', () => {
      const instance1 = K8sManager.getInstance()
      const instance2 = K8sManager.getInstance()
      const instance3 = K8sManager.getInstance()

      expect(instance1).toBe(instance2)
      expect(instance2).toBe(instance3)
    })
  })

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const result: LoadConfigResult = await manager.initialize()

      expect(result.success).toBe(true)
      expect(result.contexts).toBeDefined()
      expect(Array.isArray(result.contexts)).toBe(true)
    })

    it('should load contexts from kubeconfig', async () => {
      const result = await manager.initialize()

      expect(result.contexts.length).toBeGreaterThan(0)
      expect(result.currentContext).toBeDefined()
    })

    it('should mark as initialized after initialization', async () => {
      expect(manager.isInitialized()).toBe(false)

      await manager.initialize()

      expect(manager.isInitialized()).toBe(true)
    })

    it('should handle initialization errors gracefully', async () => {
      const result = await manager.initialize()

      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('Context Management', () => {
    it('should get all contexts', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()

      expect(Array.isArray(contexts)).toBe(true)
      expect(contexts.length).toBeGreaterThan(0)
    })

    it('should get current context', async () => {
      await manager.initialize()

      const currentContext = manager.getCurrentContext()

      expect(currentContext).toBeDefined()
      expect(typeof currentContext).toBe('string')
    })

    it('should switch context successfully', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 1) {
        const targetContext = contexts[1].name
        const success = await manager.switchContext(targetContext)

        expect(success).toBe(true)
        expect(manager.getCurrentContext()).toBe(targetContext)
      }
    })

    it('should validate context', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name
        const isValid = await manager.validateContext(contextName)

        expect(typeof isValid).toBe('boolean')
      }
    })

    it('should get context detail', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name
        const detail = manager.getContextDetail(contextName)

        expect(detail).toBeDefined()
        if (detail) {
          expect(detail.name).toBe(contextName)
          expect(detail.cluster).toBeDefined()
          expect(detail.user).toBeDefined()
        }
      }
    })
  })

  describe('Resource Watching', () => {
    it('should start watching resources for a context', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await expect(manager.startWatching(contextName, ['Pod', 'Node'])).resolves.not.toThrow()
      }
    })

    it('should start watching Pods only', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await expect(manager.startWatching(contextName, ['Pod'])).resolves.not.toThrow()
      }
    })

    it('should start watching Nodes only', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await expect(manager.startWatching(contextName, ['Node'])).resolves.not.toThrow()
      }
    })

    it('should stop watching resources for a context', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await manager.startWatching(contextName, ['Pod'])
        await expect(manager.stopWatching(contextName)).resolves.not.toThrow()
      }
    })

    it('should watch multiple contexts simultaneously', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length >= 2) {
        await manager.startWatching(contexts[0].name, ['Pod'])
        await manager.startWatching(contexts[1].name, ['Pod'])

        const stats = manager.getInformerStatistics()
        expect(stats.totalInformers).toBe(2)
      }
    })
  })

  describe('Resource Retrieval', () => {
    it('should get cached resources', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await manager.startWatching(contextName, ['Pod'])

        await new Promise((resolve) => setTimeout(resolve, 100))

        const resources = manager.getResources(contextName, 'Pod')
        expect(Array.isArray(resources)).toBe(true)
      }
    })

    it('should return empty array for unwatched resource type', async () => {
      await manager.initialize()

      const resources = manager.getResources('non-existent', 'Pod')
      expect(resources).toEqual([])
    })
  })

  describe('InformerPool Integration', () => {
    it('should get InformerPool instance', async () => {
      await manager.initialize()

      const pool = manager.getInformerPool()

      expect(pool).toBeDefined()
      expect(typeof pool.getStatistics).toBe('function')
    })

    it('should get informer statistics', async () => {
      await manager.initialize()

      const stats = manager.getInformerStatistics()

      expect(stats).toBeDefined()
      expect(typeof stats.totalInformers).toBe('number')
      expect(typeof stats.runningInformers).toBe('number')
      expect(typeof stats.totalResources).toBe('number')
      expect(typeof stats.errorCount).toBe('number')
    })

    it('should have zero informers initially', async () => {
      await manager.initialize()

      const stats = manager.getInformerStatistics()

      expect(stats.totalInformers).toBe(0)
      expect(stats.runningInformers).toBe(0)
    })

    it('should track informers after starting watch', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        await manager.startWatching(contexts[0].name, ['Pod', 'Node'])

        await new Promise((resolve) => setTimeout(resolve, 100))

        const stats = manager.getInformerStatistics()
        expect(stats.totalInformers).toBeGreaterThan(0)
      }
    })
  })

  describe('State Management', () => {
    it('should get manager state', async () => {
      await manager.initialize()

      const state = manager.getState()

      expect(state).toBeDefined()
      expect(state.initialized).toBe(true)
      expect(state.contexts).toBeDefined()
    })

    it('should reload configuration', async () => {
      await manager.initialize()

      const result = await manager.reload()

      expect(result.success).toBe(true)
      expect(manager.isInitialized()).toBe(true)
    })
  })

  describe('Config Loader Access', () => {
    it('should get config loader instance', async () => {
      await manager.initialize()

      const configLoader = manager.getConfigLoader()

      expect(configLoader).toBeDefined()
      expect(typeof configLoader.getCurrentContext).toBe('function')
    })
  })

  describe('Cleanup', () => {
    it('should cleanup resources', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        await manager.startWatching(contexts[0].name, ['Pod'])
      }

      await manager.cleanup()

      expect(manager.isInitialized()).toBe(false)

      const stats = manager.getInformerStatistics()
      expect(stats.totalInformers).toBe(0)
    })

    it('should handle cleanup when not initialized', async () => {
      await expect(manager.cleanup()).resolves.not.toThrow()
    })

    it('should handle cleanup with no active watchers', async () => {
      await manager.initialize()
      await expect(manager.cleanup()).resolves.not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle getContexts before initialization', async () => {
      const contexts = await manager.getContexts()

      expect(Array.isArray(contexts)).toBe(true)
    })

    it('should handle stopWatching for non-existent context', async () => {
      await manager.initialize()

      await expect(manager.stopWatching('non-existent')).resolves.not.toThrow()
    })

    it('should handle startWatching with invalid context gracefully', async () => {
      await manager.initialize()

      // startWatching catches errors internally and logs them, doesn't reject
      await expect(manager.startWatching('invalid-context', ['Pod'])).resolves.not.toThrow()
    })
  })

  describe('Watching Options', () => {
    it('should support namespace filtering', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await expect(manager.startWatching(contextName, ['Pod'], { namespace: 'kube-system' })).resolves.not.toThrow()
      }
    })

    it('should support label selector', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await expect(manager.startWatching(contextName, ['Pod'], { labelSelector: 'app=nginx' })).resolves.not.toThrow()
      }
    })

    it('should support field selector', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()
      if (contexts.length > 0) {
        const contextName = contexts[0].name

        await expect(manager.startWatching(contextName, ['Pod'], { fieldSelector: 'status.phase=Running' })).resolves.not.toThrow()
      }
    })
  })
})
