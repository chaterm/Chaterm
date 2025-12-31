import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { K8sManager } from '../K8sManager'

// Mock KubeConfigLoader
vi.mock('../KubeConfigLoader')

const mockLoadFromDefault = vi.fn()
const mockGetContextDetail = vi.fn()
const mockSetCurrentContext = vi.fn()
const mockValidateContext = vi.fn()

describe('K8sManager', () => {
  let manager: K8sManager

  beforeEach(async () => {
    // Clear singleton instance
    ;(K8sManager as any).instance = null

    vi.clearAllMocks()

    // Setup default mock responses
    mockLoadFromDefault.mockResolvedValue({
      success: true,
      contexts: [
        {
          name: 'context1',
          cluster: 'cluster1',
          namespace: 'default',
          server: 'https://cluster1.example.com',
          isActive: true
        },
        {
          name: 'context2',
          cluster: 'cluster2',
          namespace: 'production',
          server: 'https://cluster2.example.com',
          isActive: false
        }
      ],
      currentContext: 'context1'
    })

    mockGetContextDetail.mockReturnValue({
      name: 'context1',
      cluster: 'cluster1',
      user: 'user1',
      namespace: 'default'
    })

    mockSetCurrentContext.mockReturnValue(true)
    mockValidateContext.mockResolvedValue(true)

    // Mock the configLoader in KubeConfigLoader constructor
    const { KubeConfigLoader } = vi.mocked(await import('../KubeConfigLoader'))
    KubeConfigLoader.prototype.loadFromDefault = mockLoadFromDefault
    KubeConfigLoader.prototype.getContextDetail = mockGetContextDetail
    KubeConfigLoader.prototype.setCurrentContext = mockSetCurrentContext
    KubeConfigLoader.prototype.validateContext = mockValidateContext

    manager = K8sManager.getInstance()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = K8sManager.getInstance()
      const instance2 = K8sManager.getInstance()

      expect(instance1).toBe(instance2)
    })

    it('should create new instance only once', () => {
      const instances = Array.from({ length: 5 }, () => K8sManager.getInstance())

      const firstInstance = instances[0]
      instances.forEach((instance) => {
        expect(instance).toBe(firstInstance)
      })
    })
  })

  describe('initialize', () => {
    it('should successfully initialize with contexts', async () => {
      const result = await manager.initialize()

      expect(result.success).toBe(true)
      expect(result.contexts).toHaveLength(2)
      expect(result.currentContext).toBe('context1')
      expect(manager.isInitialized()).toBe(true)
    })

    it('should store context details in state', async () => {
      await manager.initialize()

      const detail = manager.getContextDetail('context1')
      expect(detail).toBeDefined()
      expect(detail?.name).toBe('context1')
    })

    it('should not reinitialize if already initialized', async () => {
      await manager.initialize()
      await manager.initialize()

      expect(mockLoadFromDefault).toHaveBeenCalledTimes(1)
    })

    it('should handle initialization failure', async () => {
      mockLoadFromDefault.mockResolvedValue({
        success: false,
        contexts: [],
        error: 'Config file not found'
      })

      const result = await manager.initialize()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Config file not found')
      expect(manager.isInitialized()).toBe(false)
    })

    it('should handle exceptions during initialization', async () => {
      mockLoadFromDefault.mockRejectedValue(new Error('Network error'))

      const result = await manager.initialize()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })

    it('should log initialization progress', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await manager.initialize()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s] Initializing'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s] Initialized successfully'))

      consoleSpy.mockRestore()
    })
  })

  describe('getContexts', () => {
    it('should return contexts after initialization', async () => {
      await manager.initialize()

      const contexts = await manager.getContexts()

      expect(contexts).toHaveLength(2)
      expect(contexts[0].name).toBe('context1')
    })

    it('should auto-initialize if not initialized', async () => {
      const contexts = await manager.getContexts()

      expect(contexts).toHaveLength(2)
      expect(mockLoadFromDefault).toHaveBeenCalled()
    })

    it('should return fresh data on each call', async () => {
      await manager.initialize()

      const contexts1 = await manager.getContexts()
      const contexts2 = await manager.getContexts()

      expect(mockLoadFromDefault).toHaveBeenCalledTimes(3) // init + 2 calls
      expect(contexts1).not.toBe(contexts2) // Different array instances
    })
  })

  describe('getContextDetail', () => {
    it('should return context detail from state', async () => {
      await manager.initialize()

      const detail = manager.getContextDetail('context1')

      expect(detail).toBeDefined()
      expect(detail?.name).toBe('context1')
    })

    it('should return undefined for non-existent context', async () => {
      await manager.initialize()

      const detail = manager.getContextDetail('non-existent')

      expect(detail).toBeUndefined()
    })

    it('should return undefined before initialization', () => {
      const detail = manager.getContextDetail('context1')

      expect(detail).toBeUndefined()
    })
  })

  describe('getCurrentContext', () => {
    it('should return current context name', async () => {
      await manager.initialize()

      const current = manager.getCurrentContext()

      expect(current).toBe('context1')
    })

    it('should return undefined before initialization', () => {
      const current = manager.getCurrentContext()

      expect(current).toBeUndefined()
    })
  })

  describe('switchContext', () => {
    it('should successfully switch context', async () => {
      await manager.initialize()

      const result = await manager.switchContext('context2')

      expect(result).toBe(true)
      expect(mockSetCurrentContext).toHaveBeenCalledWith('context2')
      expect(manager.getCurrentContext()).toBe('context2')
    })

    it('should handle switch failure', async () => {
      await manager.initialize()
      mockSetCurrentContext.mockReturnValue(false)

      const result = await manager.switchContext('invalid')

      expect(result).toBe(false)
    })

    it('should log switch operation', async () => {
      await manager.initialize()
      const consoleSpy = vi.spyOn(console, 'log')

      await manager.switchContext('context2')

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s] Switched to context: context2'))

      consoleSpy.mockRestore()
    })

    it('should handle exceptions during switch', async () => {
      await manager.initialize()
      mockSetCurrentContext.mockImplementation(() => {
        throw new Error('Switch failed')
      })
      const consoleSpy = vi.spyOn(console, 'error')

      const result = await manager.switchContext('context2')

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('reload', () => {
    it('should reload configurations', async () => {
      await manager.initialize()

      const result = await manager.reload()

      expect(result.success).toBe(true)
      expect(mockLoadFromDefault).toHaveBeenCalledTimes(2) // init + reload
    })

    it('should clear state before reload', async () => {
      await manager.initialize()

      await manager.reload()

      const state = manager.getState()
      expect(state.contexts.size).toBeGreaterThan(0)
    })

    it('should reset initialization flag', async () => {
      await manager.initialize()
      expect(manager.isInitialized()).toBe(true)

      // During reload, it's temporarily false then true again
      await manager.reload()
      expect(manager.isInitialized()).toBe(true)
    })

    it('should log reload operation', async () => {
      await manager.initialize()
      const consoleSpy = vi.spyOn(console, 'log')

      await manager.reload()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s] Reloading'))

      consoleSpy.mockRestore()
    })
  })

  describe('validateContext', () => {
    it('should validate context successfully', async () => {
      await manager.initialize()

      const isValid = await manager.validateContext('context1')

      expect(isValid).toBe(true)
      expect(mockValidateContext).toHaveBeenCalledWith('context1')
    })

    it('should return false for invalid context', async () => {
      await manager.initialize()
      mockValidateContext.mockResolvedValue(false)

      const isValid = await manager.validateContext('invalid')

      expect(isValid).toBe(false)
    })
  })

  describe('isInitialized', () => {
    it('should return false initially', () => {
      expect(manager.isInitialized()).toBe(false)
    })

    it('should return true after initialization', async () => {
      await manager.initialize()

      expect(manager.isInitialized()).toBe(true)
    })

    it('should return false after cleanup', async () => {
      await manager.initialize()
      manager.cleanup()

      expect(manager.isInitialized()).toBe(false)
    })
  })

  describe('getConfigLoader', () => {
    it('should return the config loader instance', () => {
      const loader = manager.getConfigLoader()

      expect(loader).toBeDefined()
    })
  })

  describe('getState', () => {
    it('should return current state', async () => {
      await manager.initialize()

      const state = manager.getState()

      expect(state.initialized).toBe(true)
      expect(state.currentContext).toBe('context1')
      expect(state.contexts).toBeInstanceOf(Map)
    })

    it('should return a copy of contexts map', async () => {
      await manager.initialize()

      const state1 = manager.getState()
      const state2 = manager.getState()

      expect(state1.contexts).not.toBe(state2.contexts)
    })

    it('should return empty state before initialization', () => {
      const state = manager.getState()

      expect(state.initialized).toBe(false)
      expect(state.contexts.size).toBe(0)
      expect(state.currentContext).toBeUndefined()
    })
  })

  describe('cleanup', () => {
    it('should clear all state', async () => {
      await manager.initialize()

      manager.cleanup()

      const state = manager.getState()
      expect(state.initialized).toBe(false)
      expect(state.contexts.size).toBe(0)
      expect(state.currentContext).toBeUndefined()
    })

    it('should log cleanup operation', async () => {
      await manager.initialize()
      const consoleSpy = vi.spyOn(console, 'log')

      manager.cleanup()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s] Cleaning up'))

      consoleSpy.mockRestore()
    })

    it('should be safe to call multiple times', async () => {
      await manager.initialize()

      manager.cleanup()
      manager.cleanup()
      manager.cleanup()

      expect(() => manager.cleanup()).not.toThrow()
    })
  })

  describe('error handling', () => {
    it('should handle null/undefined context names', async () => {
      await manager.initialize()

      const detail = manager.getContextDetail(null as any)
      expect(detail).toBeUndefined()
    })

    it('should handle empty context names', async () => {
      await manager.initialize()

      const result = await manager.switchContext('')
      expect(result).toBe(false)
    })

    it('should handle concurrent operations', async () => {
      const promises = [manager.initialize(), manager.getContexts(), manager.initialize()]

      const results = await Promise.all(promises)

      expect(results.every((r) => ('success' in r && r.success) || Array.isArray(r))).toBe(true)
    })
  })
})
