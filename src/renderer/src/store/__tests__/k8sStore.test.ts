/**
 * K8s Store Unit Tests
 *
 * Tests for the K8s Pinia store including:
 * - State initialization
 * - Context actions
 * - Cluster management actions
 * - Terminal actions
 * - Proxy configuration
 * - Getters
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useK8sStore } from '../k8sStore'
import * as k8sApi from '@/api/k8s'

// Mock the k8sApi module
vi.mock('@/api/k8s', () => ({
  initialize: vi.fn(),
  getContexts: vi.fn(),
  switchContext: vi.fn(),
  reloadConfig: vi.fn(),
  validateContext: vi.fn(),
  listClusters: vi.fn(),
  addCluster: vi.fn(),
  updateCluster: vi.fn(),
  removeCluster: vi.fn(),
  connectCluster: vi.fn(),
  disconnectCluster: vi.fn(),
  importKubeconfig: vi.fn(),
  setProxyConfig: vi.fn(),
  getProxyConfig: vi.fn(),
  agentSetCluster: vi.fn(),
  agentSetProxy: vi.fn()
}))

describe('K8s Store', () => {
  let store: ReturnType<typeof useK8sStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useK8sStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should have empty contexts', () => {
      expect(store.contexts).toEqual([])
    })

    it('should have empty current context', () => {
      expect(store.currentContext).toBe('')
    })

    it('should have empty clusters', () => {
      expect(store.clusters).toEqual([])
    })

    it('should have null active cluster id', () => {
      expect(store.activeClusterId).toBeNull()
    })

    it('should have empty terminal tabs', () => {
      expect(store.terminalTabs).toEqual([])
    })

    it('should have null active terminal id', () => {
      expect(store.activeTerminalId).toBeNull()
    })

    it('should not be loading', () => {
      expect(store.loading).toBe(false)
    })

    it('should have no error', () => {
      expect(store.error).toBeNull()
    })

    it('should not be initialized', () => {
      expect(store.initialized).toBe(false)
    })

    it('should have null proxy config', () => {
      expect(store.proxyConfig).toBeNull()
    })
  })

  describe('Getters', () => {
    describe('activeContext', () => {
      it('should return undefined when no contexts', () => {
        expect(store.activeContext).toBeUndefined()
      })

      it('should return active context', () => {
        store.contexts = [
          { name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: false },
          { name: 'ctx2', cluster: 'c2', namespace: 'ns2', server: 'http://s2', isActive: true }
        ]
        expect(store.activeContext?.name).toBe('ctx2')
      })
    })

    describe('contextCount', () => {
      it('should return 0 when empty', () => {
        expect(store.contextCount).toBe(0)
      })

      it('should return correct count', () => {
        store.contexts = [
          { name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: true },
          { name: 'ctx2', cluster: 'c2', namespace: 'ns2', server: 'http://s2', isActive: false }
        ]
        expect(store.contextCount).toBe(2)
      })
    })

    describe('hasContexts', () => {
      it('should return false when empty', () => {
        expect(store.hasContexts).toBe(false)
      })

      it('should return true when has contexts', () => {
        store.contexts = [{ name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: true }]
        expect(store.hasContexts).toBe(true)
      })
    })

    describe('activeCluster', () => {
      it('should return null when no active cluster', () => {
        expect(store.activeCluster).toBeNull()
      })

      it('should return active cluster', () => {
        const cluster = {
          id: 'c1',
          name: 'Cluster 1',
          kubeconfig_path: '/path',
          kubeconfig_content: null,
          context_name: 'ctx1',
          server_url: 'http://s1',
          auth_type: 'token',
          is_active: 1,
          connection_status: 'connected',
          auto_connect: 1,
          default_namespace: 'default',
          created_at: '2024-01-01',
          updated_at: '2024-01-01'
        }
        store.clusters = [cluster]
        store.activeClusterId = 'c1'
        expect(store.activeCluster).toEqual(cluster)
      })
    })

    describe('clusterCount', () => {
      it('should return 0 when empty', () => {
        expect(store.clusterCount).toBe(0)
      })

      it('should return correct count', () => {
        store.clusters = [{ id: 'c1' } as any, { id: 'c2' } as any]
        expect(store.clusterCount).toBe(2)
      })
    })

    describe('hasClusters', () => {
      it('should return false when empty', () => {
        expect(store.hasClusters).toBe(false)
      })

      it('should return true when has clusters', () => {
        store.clusters = [{ id: 'c1' } as any]
        expect(store.hasClusters).toBe(true)
      })
    })

    describe('connectedClusters', () => {
      it('should return empty array when no clusters', () => {
        expect(store.connectedClusters).toEqual([])
      })

      it('should return only connected clusters', () => {
        store.clusters = [
          { id: 'c1', connection_status: 'connected' } as any,
          { id: 'c2', connection_status: 'disconnected' } as any,
          { id: 'c3', connection_status: 'connected' } as any
        ]
        expect(store.connectedClusters).toHaveLength(2)
        expect(store.connectedClusters.map((c) => c.id)).toEqual(['c1', 'c3'])
      })
    })

    describe('activeTerminal', () => {
      it('should return null when no active terminal', () => {
        expect(store.activeTerminal).toBeNull()
      })

      it('should return active terminal', () => {
        const tab = { id: 't1', clusterId: 'c1', name: 'Tab 1', namespace: 'default', isActive: true }
        store.terminalTabs = [tab]
        store.activeTerminalId = 't1'
        expect(store.activeTerminal).toEqual(tab)
      })
    })
  })

  describe('Context Actions', () => {
    describe('initialize', () => {
      it('should initialize contexts and clusters', async () => {
        const mockContexts = [{ name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: true }]
        const mockClusters = [{ id: 'c1', name: 'Cluster 1', is_active: 1 } as any]

        vi.mocked(k8sApi.initialize).mockResolvedValue({
          success: true,
          data: mockContexts,
          currentContext: 'ctx1'
        })
        vi.mocked(k8sApi.listClusters).mockResolvedValue({
          success: true,
          data: mockClusters
        })

        await store.initialize()

        expect(store.contexts).toEqual(mockContexts)
        expect(store.currentContext).toBe('ctx1')
        expect(store.clusters).toEqual(mockClusters)
        expect(store.activeClusterId).toBe('c1')
        expect(store.initialized).toBe(true)
      })

      it('should not reinitialize if already initialized', async () => {
        store.initialized = true

        await store.initialize()

        expect(k8sApi.initialize).not.toHaveBeenCalled()
      })

      it('should handle initialization errors', async () => {
        vi.mocked(k8sApi.initialize).mockRejectedValue(new Error('Init failed'))

        await store.initialize()

        expect(store.error).toBe('Init failed')
        expect(store.initialized).toBe(false)
      })
    })

    describe('loadContexts', () => {
      it('should load contexts', async () => {
        const mockContexts = [{ name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: true }]

        vi.mocked(k8sApi.getContexts).mockResolvedValue({
          success: true,
          data: mockContexts,
          currentContext: 'ctx1'
        })

        await store.loadContexts()

        expect(store.contexts).toEqual(mockContexts)
        expect(store.currentContext).toBe('ctx1')
      })

      it('should handle load errors', async () => {
        vi.mocked(k8sApi.getContexts).mockResolvedValue({
          success: false,
          error: 'Failed to load'
        })

        await store.loadContexts()

        expect(store.error).toBe('Failed to load')
      })
    })

    describe('switchContext', () => {
      it('should switch to specified context', async () => {
        store.contexts = [
          { name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: true },
          { name: 'ctx2', cluster: 'c2', namespace: 'ns2', server: 'http://s2', isActive: false }
        ]

        vi.mocked(k8sApi.switchContext).mockResolvedValue({
          success: true,
          currentContext: 'ctx2'
        })

        await store.switchContext('ctx2')

        expect(store.currentContext).toBe('ctx2')
        expect(store.contexts[0].isActive).toBe(false)
        expect(store.contexts[1].isActive).toBe(true)
      })

      it('should handle switch errors', async () => {
        vi.mocked(k8sApi.switchContext).mockResolvedValue({
          success: false,
          error: 'Switch failed'
        })

        await store.switchContext('invalid')

        expect(store.error).toBe('Switch failed')
      })
    })

    describe('reloadConfig', () => {
      it('should reload config', async () => {
        const mockContexts = [{ name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: true }]

        vi.mocked(k8sApi.reloadConfig).mockResolvedValue({
          success: true,
          data: mockContexts,
          currentContext: 'ctx1'
        })

        await store.reloadConfig()

        expect(store.contexts).toEqual(mockContexts)
      })

      it('should handle reload errors', async () => {
        vi.mocked(k8sApi.reloadConfig).mockResolvedValue({
          success: false,
          error: 'Reload failed'
        })

        await store.reloadConfig()

        expect(store.error).toBe('Reload failed')
      })
    })

    describe('validateContext', () => {
      it('should return true for valid context', async () => {
        vi.mocked(k8sApi.validateContext).mockResolvedValue({
          success: true,
          data: true
        })

        const result = await store.validateContext('ctx1')

        expect(result).toBe(true)
      })

      it('should return false for invalid context', async () => {
        vi.mocked(k8sApi.validateContext).mockResolvedValue({
          success: true,
          data: false
        })

        const result = await store.validateContext('invalid')

        expect(result).toBe(false)
      })

      it('should return false on error', async () => {
        vi.mocked(k8sApi.validateContext).mockRejectedValue(new Error('Validation failed'))

        const result = await store.validateContext('ctx1')

        expect(result).toBe(false)
      })
    })
  })

  describe('Cluster Actions', () => {
    describe('loadClusters', () => {
      it('should load clusters', async () => {
        const mockClusters = [{ id: 'c1', name: 'Cluster 1', is_active: 1 } as any]

        vi.mocked(k8sApi.listClusters).mockResolvedValue({
          success: true,
          data: mockClusters
        })

        await store.loadClusters()

        expect(store.clusters).toEqual(mockClusters)
        expect(store.activeClusterId).toBe('c1')
      })

      it('should handle load errors', async () => {
        vi.mocked(k8sApi.listClusters).mockResolvedValue({
          success: false,
          error: 'Failed to load clusters'
        })

        await store.loadClusters()

        expect(store.error).toBe('Failed to load clusters')
      })
    })

    describe('addCluster', () => {
      it('should add cluster and reload', async () => {
        vi.mocked(k8sApi.addCluster).mockResolvedValue({
          success: true,
          data: { id: 'new-cluster' }
        })
        vi.mocked(k8sApi.listClusters).mockResolvedValue({
          success: true,
          data: [{ id: 'new-cluster' } as any]
        })

        const result = await store.addCluster({
          name: 'New Cluster',
          contextName: 'ctx1',
          serverUrl: 'http://s1'
        })

        expect(result.success).toBe(true)
        expect(result.id).toBe('new-cluster')
        expect(k8sApi.listClusters).toHaveBeenCalled()
      })

      it('should return error on failure', async () => {
        vi.mocked(k8sApi.addCluster).mockResolvedValue({
          success: false,
          error: 'Add failed'
        })

        const result = await store.addCluster({
          name: 'New Cluster',
          contextName: 'ctx1',
          serverUrl: 'http://s1'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Add failed')
      })
    })

    describe('updateCluster', () => {
      it('should update cluster and reload', async () => {
        vi.mocked(k8sApi.updateCluster).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.listClusters).mockResolvedValue({
          success: true,
          data: []
        })

        const result = await store.updateCluster('c1', { name: 'Updated' })

        expect(result.success).toBe(true)
        expect(k8sApi.listClusters).toHaveBeenCalled()
      })

      it('should return error on failure', async () => {
        vi.mocked(k8sApi.updateCluster).mockResolvedValue({
          success: false,
          error: 'Update failed'
        })

        const result = await store.updateCluster('c1', { name: 'Updated' })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Update failed')
      })
    })

    describe('removeCluster', () => {
      it('should remove cluster from state', async () => {
        store.clusters = [{ id: 'c1' } as any, { id: 'c2' } as any]
        store.activeClusterId = 'c1'
        store.terminalTabs = [{ id: 't1', clusterId: 'c1' } as any, { id: 't2', clusterId: 'c2' } as any]

        vi.mocked(k8sApi.removeCluster).mockResolvedValue({ success: true })

        const result = await store.removeCluster('c1')

        expect(result.success).toBe(true)
        expect(store.clusters).toHaveLength(1)
        expect(store.clusters[0].id).toBe('c2')
        expect(store.activeClusterId).toBeNull()
        expect(store.terminalTabs).toHaveLength(1)
        expect(store.terminalTabs[0].id).toBe('t2')
      })

      it('should return error on failure', async () => {
        vi.mocked(k8sApi.removeCluster).mockResolvedValue({
          success: false,
          error: 'Remove failed'
        })

        const result = await store.removeCluster('c1')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Remove failed')
      })
    })

    describe('connectCluster', () => {
      it('should connect to cluster and update state', async () => {
        store.clusters = [
          { id: 'c1', connection_status: 'disconnected', is_active: 0, context_name: 'ctx1' } as any,
          { id: 'c2', connection_status: 'connected', is_active: 1 } as any
        ]

        vi.mocked(k8sApi.connectCluster).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetCluster).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetProxy).mockResolvedValue({ success: true })

        const result = await store.connectCluster('c1')

        expect(result.success).toBe(true)
        expect(store.clusters[0].connection_status).toBe('connected')
        expect(store.clusters[0].is_active).toBe(1)
        expect(store.clusters[1].is_active).toBe(0)
        expect(store.activeClusterId).toBe('c1')
        expect(k8sApi.agentSetCluster).toHaveBeenCalled()
      })

      it('should apply proxy config when set', async () => {
        store.clusters = [{ id: 'c1', connection_status: 'disconnected', is_active: 0, context_name: 'ctx1' } as any]
        store.proxyConfig = { host: '127.0.0.1', port: 8080 }

        vi.mocked(k8sApi.connectCluster).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetCluster).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetProxy).mockResolvedValue({ success: true })

        await store.connectCluster('c1')

        expect(k8sApi.agentSetProxy).toHaveBeenCalledWith(store.proxyConfig)
      })

      it('should return error on failure', async () => {
        vi.mocked(k8sApi.connectCluster).mockResolvedValue({
          success: false,
          error: 'Connection refused'
        })

        const result = await store.connectCluster('c1')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Connection refused')
      })
    })

    describe('disconnectCluster', () => {
      it('should disconnect from cluster', async () => {
        store.clusters = [{ id: 'c1', connection_status: 'connected' } as any]

        vi.mocked(k8sApi.disconnectCluster).mockResolvedValue({ success: true })

        const result = await store.disconnectCluster('c1')

        expect(result.success).toBe(true)
        expect(store.clusters[0].connection_status).toBe('disconnected')
      })

      it('should return error on failure', async () => {
        vi.mocked(k8sApi.disconnectCluster).mockResolvedValue({
          success: false,
          error: 'Disconnect failed'
        })

        const result = await store.disconnectCluster('c1')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Disconnect failed')
      })
    })

    describe('importFromKubeconfig', () => {
      it('should import and return contexts', async () => {
        const mockContexts = [{ name: 'ctx1', cluster: 'c1', namespace: 'ns1', server: 'http://s1', isActive: true }]

        vi.mocked(k8sApi.importKubeconfig).mockResolvedValue({
          success: true,
          data: {
            contexts: mockContexts,
            kubeconfigPath: '/path',
            kubeconfigContent: 'yaml content'
          }
        })

        const result = await store.importFromKubeconfig('/path')

        expect(result.success).toBe(true)
        expect(result.contexts).toEqual(mockContexts)
        expect(result.kubeconfigContent).toBe('yaml content')
      })

      it('should return error on failure', async () => {
        vi.mocked(k8sApi.importKubeconfig).mockResolvedValue({
          success: false,
          error: 'File not found'
        })

        const result = await store.importFromKubeconfig('/invalid')

        expect(result.success).toBe(false)
        expect(result.error).toBe('File not found')
      })
    })
  })

  describe('Terminal Actions', () => {
    describe('addTerminalTab', () => {
      it('should add terminal tab and set active', () => {
        const tab = { id: 't1', clusterId: 'c1', name: 'Tab 1', namespace: 'default', isActive: true }

        store.addTerminalTab(tab)

        expect(store.terminalTabs).toHaveLength(1)
        expect(store.terminalTabs[0]).toEqual(tab)
        expect(store.activeTerminalId).toBe('t1')
      })
    })

    describe('removeTerminalTab', () => {
      it('should remove terminal tab', () => {
        store.terminalTabs = [
          { id: 't1', clusterId: 'c1', name: 'Tab 1', namespace: 'default', isActive: true },
          { id: 't2', clusterId: 'c1', name: 'Tab 2', namespace: 'default', isActive: false }
        ]
        store.activeTerminalId = 't1'

        store.removeTerminalTab('t1')

        expect(store.terminalTabs).toHaveLength(1)
        expect(store.activeTerminalId).toBe('t2')
      })

      it('should set next active tab when removing active tab', () => {
        store.terminalTabs = [
          { id: 't1', clusterId: 'c1', name: 'Tab 1', namespace: 'default', isActive: true },
          { id: 't2', clusterId: 'c1', name: 'Tab 2', namespace: 'default', isActive: false }
        ]
        store.activeTerminalId = 't2'

        store.removeTerminalTab('t2')

        expect(store.activeTerminalId).toBe('t1')
      })

      it('should set activeTerminalId to null when removing last tab', () => {
        store.terminalTabs = [{ id: 't1', clusterId: 'c1', name: 'Tab 1', namespace: 'default', isActive: true }]
        store.activeTerminalId = 't1'

        store.removeTerminalTab('t1')

        expect(store.terminalTabs).toHaveLength(0)
        expect(store.activeTerminalId).toBeNull()
      })
    })

    describe('setActiveTerminal', () => {
      it('should set active terminal', () => {
        store.terminalTabs = [
          { id: 't1', clusterId: 'c1', name: 'Tab 1', namespace: 'default', isActive: true },
          { id: 't2', clusterId: 'c1', name: 'Tab 2', namespace: 'default', isActive: false }
        ]

        store.setActiveTerminal('t2')

        expect(store.activeTerminalId).toBe('t2')
        expect(store.terminalTabs[0].isActive).toBe(false)
        expect(store.terminalTabs[1].isActive).toBe(true)
      })
    })
  })

  describe('Proxy Actions', () => {
    describe('setProxyConfig', () => {
      it('should set proxy config', async () => {
        const proxyConfig = { host: '127.0.0.1', port: 8080 }

        vi.mocked(k8sApi.setProxyConfig).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetProxy).mockResolvedValue({ success: true })

        const result = await store.setProxyConfig(proxyConfig)

        expect(result.success).toBe(true)
        expect(store.proxyConfig).toEqual(proxyConfig)
        expect(k8sApi.agentSetProxy).toHaveBeenCalledWith(proxyConfig)
      })

      it('should return error on failure', async () => {
        vi.mocked(k8sApi.setProxyConfig).mockResolvedValue({
          success: false,
          error: 'Invalid proxy'
        })

        const result = await store.setProxyConfig({ host: 'invalid', port: -1 })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Invalid proxy')
      })
    })

    describe('getProxyConfig', () => {
      it('should get and store proxy config', async () => {
        const proxyConfig = { host: '127.0.0.1', port: 8080 }

        vi.mocked(k8sApi.getProxyConfig).mockResolvedValue({
          success: true,
          data: proxyConfig
        })

        const result = await store.getProxyConfig()

        expect(result).toEqual(proxyConfig)
        expect(store.proxyConfig).toEqual(proxyConfig)
      })

      it('should return null on error', async () => {
        vi.mocked(k8sApi.getProxyConfig).mockRejectedValue(new Error('Failed'))

        const result = await store.getProxyConfig()

        expect(result).toBeNull()
      })
    })

    describe('applyUserProxyConfig', () => {
      it('should set proxy when enabled', async () => {
        vi.mocked(k8sApi.setProxyConfig).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetProxy).mockResolvedValue({ success: true })

        await store.applyUserProxyConfig(true, { host: '127.0.0.1', port: 8080 })

        expect(k8sApi.setProxyConfig).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8080 })
      })

      it('should clear proxy when disabled', async () => {
        vi.mocked(k8sApi.setProxyConfig).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetProxy).mockResolvedValue({ success: true })

        await store.applyUserProxyConfig(false, { host: '127.0.0.1', port: 8080 })

        expect(k8sApi.setProxyConfig).toHaveBeenCalledWith(null)
      })

      it('should clear proxy when config is incomplete', async () => {
        vi.mocked(k8sApi.setProxyConfig).mockResolvedValue({ success: true })
        vi.mocked(k8sApi.agentSetProxy).mockResolvedValue({ success: true })

        await store.applyUserProxyConfig(true, { host: '', port: 0 })

        expect(k8sApi.setProxyConfig).toHaveBeenCalledWith(null)
      })
    })
  })

  describe('Utility Actions', () => {
    describe('clearError', () => {
      it('should clear error', () => {
        store.error = 'Some error'

        store.clearError()

        expect(store.error).toBeNull()
      })
    })

    describe('reset', () => {
      it('should reset all state', () => {
        // Set some state
        store.contexts = [{ name: 'ctx1' } as any]
        store.currentContext = 'ctx1'
        store.clusters = [{ id: 'c1' } as any]
        store.activeClusterId = 'c1'
        store.terminalTabs = [{ id: 't1' } as any]
        store.activeTerminalId = 't1'
        store.loading = true
        store.error = 'Some error'
        store.initialized = true
        store.proxyConfig = { host: '127.0.0.1', port: 8080 }

        store.reset()

        expect(store.contexts).toEqual([])
        expect(store.currentContext).toBe('')
        expect(store.clusters).toEqual([])
        expect(store.activeClusterId).toBeNull()
        expect(store.terminalTabs).toEqual([])
        expect(store.activeTerminalId).toBeNull()
        expect(store.loading).toBe(false)
        expect(store.error).toBeNull()
        expect(store.initialized).toBe(false)
        expect(store.proxyConfig).toBeNull()
      })
    })
  })

  describe('Loading State', () => {
    it('should set loading true during async operations', async () => {
      let loadingDuringOperation = false

      vi.mocked(k8sApi.getContexts).mockImplementation(async () => {
        loadingDuringOperation = store.loading
        return { success: true, data: [] }
      })

      const promise = store.loadContexts()
      await promise

      expect(loadingDuringOperation).toBe(true)
      expect(store.loading).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should capture exception errors', async () => {
      vi.mocked(k8sApi.getContexts).mockRejectedValue(new Error('Network error'))

      await store.loadContexts()

      expect(store.error).toBe('Network error')
    })

    it('should handle unknown errors', async () => {
      vi.mocked(k8sApi.getContexts).mockRejectedValue('string error')

      await store.loadContexts()

      expect(store.error).toBe('Unknown error')
    })
  })
})
