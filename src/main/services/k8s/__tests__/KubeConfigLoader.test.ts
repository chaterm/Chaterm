import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { KubeConfigLoader } from '../KubeConfigLoader'
import * as fs from 'fs'

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true)
}))

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

    loader = new KubeConfigLoader(() => new MockKubeConfig())
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
      mockSetCurrentContext.mockImplementationOnce(() => {
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

    it('should handle contexts with null/undefined properties', async () => {
      mockGetContexts.mockReturnValue([
        {
          name: 'minimal-context',
          cluster: null,
          user: null,
          namespace: null
        }
      ])

      const result = await loader.loadFromDefault()

      expect(result.success).toBe(true)
      expect(result.contexts[0].namespace).toBe('default')
      expect(result.contexts[0].server).toBe('unknown')
    })

    it('should handle missing user information', async () => {
      mockGetUsers.mockReturnValue([])

      await loader.loadFromDefault()

      const detail = loader.getContextDetail('context1')

      expect(detail).toBeDefined()
      expect(detail?.userInfo).toBeUndefined()
    })

    it('should handle mixed authentication types', async () => {
      mockGetContexts.mockReturnValue([
        {
          name: 'context1',
          cluster: 'cluster1',
          user: 'user-with-certs',
          namespace: 'default'
        }
      ])

      mockGetUsers.mockReturnValue([
        {
          name: 'user-with-certs',
          certFile: '/path/to/cert.pem',
          keyFile: '/path/to/key.pem'
        },
        {
          name: 'user-with-token',
          token: 'bearer-token-123'
        },
        {
          name: 'user-with-basic',
          username: 'admin',
          password: 'secret'
        }
      ])

      await loader.loadFromDefault()

      const certDetail = loader.getContextDetail('context1')
      expect(certDetail?.userInfo?.clientCertificate).toBe('/path/to/cert.pem')
      expect(certDetail?.userInfo?.clientKey).toBe('/path/to/key.pem')
    })
  })

  describe('loadFromFile', () => {
    it('should load from custom path', async () => {
      const customPath = '/custom/path/kubeconfig'
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const result = await loader.loadFromFile(customPath)

      expect(mockLoadFromFile).toHaveBeenCalledWith(customPath)
      expect(result.success).toBe(true)
    })

    it('should return error for non-existent file', async () => {
      const nonExistentPath = '/does/not/exist/config'
      vi.mocked(fs.existsSync).mockReturnValue(false)
      const result = await loader.loadFromFile(nonExistentPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('validateContext', () => {
    it('should validate a working context', async () => {
      await loader.loadFromDefault()
      mockMakeApiClient.mockReturnValue({
        getAPIResources: vi.fn().mockResolvedValue({})
      })

      const isValid = await loader.validateContext('context1')

      expect(isValid).toBe(true)
      expect(mockSetCurrentContext).toHaveBeenCalledWith('context1')
    })

    it('should return false for invalid context', async () => {
      await loader.loadFromDefault()
      mockMakeApiClient.mockReturnValue({
        getAPIResources: vi.fn().mockRejectedValue(new Error('Connection refused'))
      })

      const isValid = await loader.validateContext('context1')

      expect(isValid).toBe(false)
    })

    it('should restore original context after validation', async () => {
      await loader.loadFromDefault()
      mockGetCurrentContext.mockReturnValue('context2')
      mockMakeApiClient.mockReturnValue({
        getAPIResources: vi.fn().mockResolvedValue({})
      })

      await loader.validateContext('context1')

      expect(mockSetCurrentContext).toHaveBeenCalledTimes(2)
      expect(mockSetCurrentContext).toHaveBeenNthCalledWith(1, 'context1')
      expect(mockSetCurrentContext).toHaveBeenNthCalledWith(2, 'context2')
    })

    it('should handle validation before initialization', async () => {
      const freshLoader = new KubeConfigLoader(() => new MockKubeConfig())
      mockMakeApiClient.mockReturnValue({
        getAPIResources: vi.fn().mockResolvedValue({})
      })

      const isValid = await freshLoader.validateContext('context1')

      expect(isValid).toBe(true)
    })
  })

  describe('getKubeConfig', () => {
    it('should return the internal KubeConfig instance', async () => {
      await loader.loadFromDefault()

      const kc = loader.getKubeConfig()

      expect(kc).toBeDefined()
      expect(kc.getContexts).toBeDefined()
    })

    it('should return undefined before initialization', () => {
      const freshLoader = new KubeConfigLoader(() => new MockKubeConfig())
      const kc = freshLoader.getKubeConfig()

      expect(kc).toBeUndefined()
    })
  })

  describe('concurrent operations', () => {
    it('should handle multiple simultaneous loadFromDefault calls', async () => {
      const results = await Promise.all([loader.loadFromDefault(), loader.loadFromDefault(), loader.loadFromDefault()])

      results.forEach((result) => {
        expect(result.success).toBe(true)
        expect(result.contexts).toHaveLength(2)
      })
    })

    it('should handle rapid context switching', async () => {
      await loader.loadFromDefault()

      const results = [loader.setCurrentContext('context1'), loader.setCurrentContext('context2'), loader.setCurrentContext('context1')]

      expect(results.every((r) => r === true)).toBe(true)
    })
  })

  describe('cluster information extraction', () => {
    it('should extract full cluster details', async () => {
      mockGetClusters.mockReturnValue([
        {
          name: 'cluster1',
          server: 'https://192.168.1.100:6443',
          caFile: '/path/to/ca.crt',
          skipTLSVerify: false
        }
      ])

      await loader.loadFromDefault()

      const detail = loader.getContextDetail('context1')

      expect(detail?.clusterInfo?.server).toBe('https://192.168.1.100:6443')
      expect(detail?.clusterInfo?.certificateAuthority).toBe('/path/to/ca.crt')
      expect(detail?.clusterInfo?.skipTLSVerify).toBe(false)
    })

    it('should handle insecure clusters with skipTLSVerify', async () => {
      mockGetClusters.mockReturnValue([
        {
          name: 'cluster1',
          server: 'https://dev-cluster:6443',
          skipTLSVerify: true
        }
      ])

      await loader.loadFromDefault()

      const detail = loader.getContextDetail('context1')

      expect(detail?.clusterInfo?.skipTLSVerify).toBe(true)
    })
  })
})
