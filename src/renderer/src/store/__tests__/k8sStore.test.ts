import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useK8sStore } from '../k8sStore'
import * as k8sApi from '@/api/k8s'

// Mock k8s API
vi.mock('@/api/k8s')

describe('useK8sStore', () => {
  let store: ReturnType<typeof useK8sStore>

  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia())
    store = useK8sStore()

    vi.clearAllMocks()

    // Setup default mock responses
    vi.mocked(k8sApi.initialize).mockResolvedValue({
      success: true,
      data: [
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

    vi.mocked(k8sApi.getContexts).mockResolvedValue({
      success: true,
      data: [
        {
          name: 'context1',
          cluster: 'cluster1',
          namespace: 'default',
          server: 'https://cluster1.example.com',
          isActive: true
        }
      ],
      currentContext: 'context1'
    })

    vi.mocked(k8sApi.switchContext).mockResolvedValue({
      success: true,
      currentContext: 'context2'
    })

    vi.mocked(k8sApi.reloadConfig).mockResolvedValue({
      success: true,
      data: [],
      currentContext: 'context1'
    })

    vi.mocked(k8sApi.validateContext).mockResolvedValue({
      success: true,
      data: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have empty contexts initially', () => {
      expect(store.contexts).toEqual([])
    })

    it('should have empty current context', () => {
      expect(store.currentContext).toBe('')
    })

    it('should not be loading initially', () => {
      expect(store.loading).toBe(false)
    })

    it('should have no error initially', () => {
      expect(store.error).toBeNull()
    })

    it('should not be initialized initially', () => {
      expect(store.initialized).toBe(false)
    })
  })

  describe('getters', () => {
    beforeEach(async () => {
      await store.initialize()
    })

    describe('activeContext', () => {
      it('should return the active context', () => {
        expect(store.activeContext?.name).toBe('context1')
        expect(store.activeContext?.isActive).toBe(true)
      })

      it('should return undefined when no active context', async () => {
        store.contexts = [
          {
            name: 'context1',
            cluster: 'cluster1',
            namespace: 'default',
            server: 'https://example.com',
            isActive: false
          }
        ]

        expect(store.activeContext).toBeUndefined()
      })
    })

    describe('contextCount', () => {
      it('should return the number of contexts', () => {
        expect(store.contextCount).toBe(2)
      })

      it('should return 0 when no contexts', () => {
        store.contexts = []
        expect(store.contextCount).toBe(0)
      })
    })

    describe('hasContexts', () => {
      it('should return true when contexts exist', () => {
        expect(store.hasContexts).toBe(true)
      })

      it('should return false when no contexts', () => {
        store.contexts = []
        expect(store.hasContexts).toBe(false)
      })
    })
  })

  describe('initialize', () => {
    it('should successfully initialize the store', async () => {
      await store.initialize()

      expect(store.initialized).toBe(true)
      expect(store.contexts).toHaveLength(2)
      expect(store.currentContext).toBe('context1')
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('should not reinitialize if already initialized', async () => {
      await store.initialize()
      await store.initialize()

      expect(k8sApi.initialize).toHaveBeenCalledTimes(1)
    })

    it('should set loading state during initialization', async () => {
      let loadingDuringCall = false

      vi.mocked(k8sApi.initialize).mockImplementation(async () => {
        loadingDuringCall = store.loading
        return {
          success: true,
          data: [],
          currentContext: ''
        }
      })

      await store.initialize()

      expect(loadingDuringCall).toBe(true)
      expect(store.loading).toBe(false)
    })

    it('should handle initialization failure', async () => {
      vi.mocked(k8sApi.initialize).mockResolvedValue({
        success: false,
        error: 'Config file not found'
      })

      await store.initialize()

      expect(store.initialized).toBe(false)
      expect(store.error).toBe('Config file not found')
      expect(store.contexts).toEqual([])
    })

    it('should handle exceptions during initialization', async () => {
      vi.mocked(k8sApi.initialize).mockRejectedValue(new Error('Network error'))

      await store.initialize()

      expect(store.error).toBe('Network error')
      expect(store.initialized).toBe(false)
    })

    it('should log initialization events', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      await store.initialize()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s Store] Initializing'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s Store] Initialized with'))

      consoleSpy.mockRestore()
    })
  })

  describe('loadContexts', () => {
    it('should load contexts successfully', async () => {
      await store.loadContexts()

      expect(store.contexts).toHaveLength(1)
      expect(store.currentContext).toBe('context1')
      expect(store.error).toBeNull()
    })

    it('should set loading state', async () => {
      let loadingDuringCall = false

      vi.mocked(k8sApi.getContexts).mockImplementation(async () => {
        loadingDuringCall = store.loading
        return {
          success: true,
          data: [],
          currentContext: ''
        }
      })

      await store.loadContexts()

      expect(loadingDuringCall).toBe(true)
      expect(store.loading).toBe(false)
    })

    it('should handle load failure', async () => {
      vi.mocked(k8sApi.getContexts).mockResolvedValue({
        success: false,
        error: 'Failed to load'
      })

      await store.loadContexts()

      expect(store.error).toBe('Failed to load')
    })

    it('should clear previous error on successful load', async () => {
      store.error = 'Previous error'

      await store.loadContexts()

      expect(store.error).toBeNull()
    })
  })

  describe('switchContext', () => {
    beforeEach(async () => {
      await store.initialize()
    })

    it('should switch context successfully', async () => {
      await store.switchContext('context2')

      expect(store.currentContext).toBe('context2')
      expect(k8sApi.switchContext).toHaveBeenCalledWith('context2')
      expect(store.error).toBeNull()
    })

    it('should update isActive flag for contexts', async () => {
      await store.switchContext('context2')

      const context1 = store.contexts.find((c) => c.name === 'context1')
      const context2 = store.contexts.find((c) => c.name === 'context2')

      expect(context1?.isActive).toBe(false)
      expect(context2?.isActive).toBe(true)
    })

    it('should handle switch failure', async () => {
      vi.mocked(k8sApi.switchContext).mockResolvedValue({
        success: false,
        error: 'Switch failed'
      })

      await store.switchContext('context2')

      expect(store.error).toBe('Switch failed')
    })

    it('should set loading state during switch', async () => {
      let loadingDuringCall = false

      vi.mocked(k8sApi.switchContext).mockImplementation(async () => {
        loadingDuringCall = store.loading
        return {
          success: true,
          currentContext: 'context2'
        }
      })

      await store.switchContext('context2')

      expect(loadingDuringCall).toBe(true)
      expect(store.loading).toBe(false)
    })
  })

  describe('reloadConfig', () => {
    it('should reload configuration successfully', async () => {
      vi.mocked(k8sApi.reloadConfig).mockResolvedValue({
        success: true,
        data: [
          {
            name: 'new-context',
            cluster: 'new-cluster',
            namespace: 'default',
            server: 'https://new.example.com',
            isActive: true
          }
        ],
        currentContext: 'new-context'
      })

      await store.reloadConfig()

      expect(store.contexts).toHaveLength(1)
      expect(store.contexts[0].name).toBe('new-context')
      expect(store.currentContext).toBe('new-context')
    })

    it('should handle reload failure', async () => {
      vi.mocked(k8sApi.reloadConfig).mockResolvedValue({
        success: false,
        error: 'Reload failed'
      })

      await store.reloadConfig()

      expect(store.error).toBe('Reload failed')
    })
  })

  describe('validateContext', () => {
    it('should validate context successfully', async () => {
      const isValid = await store.validateContext('context1')

      expect(isValid).toBe(true)
      expect(k8sApi.validateContext).toHaveBeenCalledWith('context1')
    })

    it('should return false for invalid context', async () => {
      vi.mocked(k8sApi.validateContext).mockResolvedValue({
        success: true,
        data: false
      })

      const isValid = await store.validateContext('invalid')

      expect(isValid).toBe(false)
    })

    it('should handle validation failure', async () => {
      vi.mocked(k8sApi.validateContext).mockResolvedValue({
        success: false,
        error: 'Validation failed'
      })

      const isValid = await store.validateContext('context1')

      expect(isValid).toBe(false)
    })

    it('should handle exceptions during validation', async () => {
      vi.mocked(k8sApi.validateContext).mockRejectedValue(new Error('Network error'))

      const isValid = await store.validateContext('context1')

      expect(isValid).toBe(false)
    })
  })

  describe('clearError', () => {
    it('should clear error message', async () => {
      store.error = 'Some error'

      store.clearError()

      expect(store.error).toBeNull()
    })
  })

  describe('reset', () => {
    it('should reset store to initial state', async () => {
      await store.initialize()
      store.error = 'Some error'

      store.reset()

      expect(store.contexts).toEqual([])
      expect(store.currentContext).toBe('')
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.initialized).toBe(false)
    })

    it('should be safe to call multiple times', () => {
      store.reset()
      store.reset()

      expect(() => store.reset()).not.toThrow()
    })
  })

  describe('error scenarios', () => {
    it('should handle API returning undefined data', async () => {
      vi.mocked(k8sApi.initialize).mockResolvedValue({
        success: true,
        data: undefined
      } as any)

      await store.initialize()

      expect(store.contexts).toEqual([])
    })

    it('should handle concurrent initialize calls', async () => {
      const promises = [store.initialize(), store.initialize(), store.initialize()]

      await Promise.all(promises)

      expect(k8sApi.initialize).toHaveBeenCalledTimes(1)
      expect(store.initialized).toBe(true)
    })

    it('should handle empty context name in switch', async () => {
      await store.switchContext('')

      expect(k8sApi.switchContext).toHaveBeenCalledWith('')
    })
  })

  describe('state reactivity', () => {
    it('should update contexts reactively', async () => {
      const contextsBefore = store.contexts.length

      await store.initialize()

      const contextsAfter = store.contexts.length

      expect(contextsAfter).toBeGreaterThan(contextsBefore)
    })

    it('should update loading state reactively', async () => {
      const loadingStates: boolean[] = []

      // Track loading state changes
      store.$subscribe(() => {
        loadingStates.push(store.loading)
      })

      await store.loadContexts()

      expect(loadingStates).toContain(true)
      expect(loadingStates).toContain(false)
    })
  })
})
