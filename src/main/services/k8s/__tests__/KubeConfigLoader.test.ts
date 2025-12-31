import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { KubeConfigLoader } from '../KubeConfigLoader'

// Mock @kubernetes/client-node module
const mockLoadFromFile = vi.fn()
const mockLoadFromDefault = vi.fn()
const mockGetContexts = vi.fn()
const mockGetCurrentContext = vi.fn()
const mockGetClusters = vi.fn()
const mockGetUsers = vi.fn()
const mockSetCurrentContext = vi.fn()
const mockMakeApiClient = vi.fn()

class MockKubeConfig {
  loadFromFile = mockLoadFromFile
  loadFromDefault = mockLoadFromDefault
  contexts: any[] = []
  clusters: any[] = []
  users: any[] = []
  currentContext = ''

  getContexts() {
    return mockGetContexts()
  }

  getCurrentContext() {
    return mockGetCurrentContext()
  }

  getClusters() {
    return mockGetClusters()
  }

  getUsers() {
    return mockGetUsers()
  }

  setCurrentContext(name: string) {
    return mockSetCurrentContext(name)
  }

  makeApiClient(type: any) {
    return mockMakeApiClient(type)
  }

  getContextObject(name: string) {
    return this.getContexts().find((c: any) => c.name === name)
  }

  getCluster(name: string) {
    return this.getClusters().find((c: any) => c.name === name)
  }
}

// Mock the ES module import
vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: MockKubeConfig,
  CoreV1Api: vi.fn()
}))

describe('KubeConfigLoader', () => {
  let loader: KubeConfigLoader

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Setup default kubernetes mock responses
    mockGetContexts.mockReturnValue([
      {
        name: 'context1',
        cluster: 'cluster1',
        user: 'user1',
        namespace: 'default'
      },
      {
        name: 'context2',
        cluster: 'cluster2',
        user: 'user2',
        namespace: 'production'
      }
    ])

    mockGetCurrentContext.mockReturnValue('context1')

    mockGetClusters.mockReturnValue([
      {
        name: 'cluster1',
        server: 'https://cluster1.example.com'
      },
      {
        name: 'cluster2',
        server: 'https://cluster2.example.com'
      }
    ])

    mockGetUsers.mockReturnValue([
      {
        name: 'user1',
        token: 'token1'
      },
      {
        name: 'user2',
        certFile: '/path/to/cert',
        keyFile: '/path/to/key'
      }
    ])

    loader = new KubeConfigLoader()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadFromDefault', () => {
    it('should successfully load config from default location', async () => {
      const result = await loader.loadFromDefault()

      expect(result.success).toBe(true)
      expect(result.contexts).toHaveLength(2)
      expect(result.currentContext).toBe('context1')
      expect(mockLoadFromDefault).toHaveBeenCalled()
    })

    it('should return contexts with correct structure', async () => {
      const result = await loader.loadFromDefault()

      expect(result.contexts[0]).toEqual({
        name: 'context1',
        cluster: 'cluster1',
        namespace: 'default',
        server: 'https://cluster1.example.com',
        isActive: true
      })

      expect(result.contexts[1]).toEqual({
        name: 'context2',
        cluster: 'cluster2',
        namespace: 'production',
        server: 'https://cluster2.example.com',
        isActive: false
      })
    })

    it('should handle errors gracefully', async () => {
      mockLoadFromDefault.mockImplementationOnce(() => {
        throw new Error('Failed to load config')
      })

      const result = await loader.loadFromDefault()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to load config')
      expect(result.contexts).toEqual([])
    })

    it('should use default namespace when not specified', async () => {
      mockGetContexts.mockReturnValue([
        {
          name: 'context-no-ns',
          cluster: 'cluster1',
          user: 'user1'
          // namespace is undefined
        }
      ])

      const result = await loader.loadFromDefault()

      expect(result.contexts[0].namespace).toBe('default')
    })
  })

  describe('getContextDetail', () => {
    it('should return detailed context information', async () => {
      await loader.loadFromDefault()

      const detail = loader.getContextDetail('context1')

      expect(detail).toBeDefined()
      expect(detail?.name).toBe('context1')
      expect(detail?.cluster).toBe('cluster1')
      expect(detail?.clusterInfo?.server).toBe('https://cluster1.example.com')
      expect(detail?.userInfo?.token).toBe('token1')
    })

    it('should return undefined for non-existent context', async () => {
      await loader.loadFromDefault()

      const detail = loader.getContextDetail('non-existent')

      expect(detail).toBeUndefined()
    })

    it('should return undefined before initialization', () => {
      const detail = loader.getContextDetail('context1')

      expect(detail).toBeUndefined()
    })
  })

  describe('getCurrentContext', () => {
    it('should return current context name', async () => {
      await loader.loadFromDefault()

      const current = loader.getCurrentContext()

      expect(current).toBe('context1')
    })

    it('should return empty string before initialization', () => {
      const current = loader.getCurrentContext()

      expect(current).toBe('')
    })
  })

  describe('setCurrentContext', () => {
    it('should successfully set current context', async () => {
      await loader.loadFromDefault()

      const result = loader.setCurrentContext('context2')

      expect(result).toBe(true)
      expect(mockSetCurrentContext).toHaveBeenCalledWith('context2')
    })

    it('should return false before initialization', () => {
      const result = loader.setCurrentContext('context1')

      expect(result).toBe(false)
    })

    it('should handle errors when setting context', async () => {
      await loader.loadFromDefault()
      mockSetCurrentContext.mockImplementation(() => {
        throw new Error('Invalid context')
      })

      const result = loader.setCurrentContext('invalid-context')

      expect(result).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty contexts list', async () => {
      mockGetContexts.mockReturnValue([])

      const result = await loader.loadFromDefault()

      expect(result.success).toBe(true)
      expect(result.contexts).toEqual([])
    })

    it('should handle missing cluster info gracefully', async () => {
      mockGetClusters.mockReturnValue([])

      const result = await loader.loadFromDefault()

      expect(result.success).toBe(true)
      expect(result.contexts[0].server).toBe('unknown')
    })
  })
})
