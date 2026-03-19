/**
 * K8s API Unit Tests
 *
 * Tests for the K8s API wrapper functions including:
 * - Context management
 * - Cluster management
 * - Terminal operations
 * - Agent operations
 * - Proxy configuration
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as k8sApi from '../k8s'

// Mock window.api
const mockApi = {
  k8sGetContexts: vi.fn(),
  k8sGetContextDetail: vi.fn(),
  k8sSwitchContext: vi.fn(),
  k8sReloadConfig: vi.fn(),
  k8sValidateContext: vi.fn(),
  k8sInitialize: vi.fn(),
  k8sSetProxy: vi.fn(),
  k8sGetProxy: vi.fn(),
  k8sClusterList: vi.fn(),
  k8sClusterGet: vi.fn(),
  k8sClusterAdd: vi.fn(),
  k8sClusterUpdate: vi.fn(),
  k8sClusterRemove: vi.fn(),
  k8sClusterTest: vi.fn(),
  k8sClusterImportKubeconfig: vi.fn(),
  k8sClusterConnect: vi.fn(),
  k8sClusterDisconnect: vi.fn(),
  k8sTerminalCreate: vi.fn(),
  k8sTerminalWrite: vi.fn(),
  k8sTerminalResize: vi.fn(),
  k8sTerminalClose: vi.fn(),
  k8sTerminalList: vi.fn(),
  k8sOnTerminalData: vi.fn(),
  k8sOnTerminalExit: vi.fn(),
  k8sAgentSetCluster: vi.fn(),
  k8sAgentSetProxy: vi.fn(),
  k8sAgentKubectl: vi.fn(),
  k8sAgentGetPods: vi.fn(),
  k8sAgentGetNodes: vi.fn(),
  k8sAgentGetNamespaces: vi.fn(),
  k8sAgentGetServices: vi.fn(),
  k8sAgentGetDeployments: vi.fn(),
  k8sAgentGetPodLogs: vi.fn(),
  k8sAgentDescribe: vi.fn(),
  k8sAgentTestConnection: vi.fn(),
  k8sAgentGetCurrentCluster: vi.fn(),
  k8sAgentCleanup: vi.fn()
}

describe('K8s API', () => {
  beforeEach(() => {
    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as any).api = mockApi
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Context Management', () => {
    describe('getContexts', () => {
      it('should return contexts on success', async () => {
        const mockContexts = [
          { name: 'context1', cluster: 'cluster1', namespace: 'default', server: 'https://localhost:6443', isActive: true },
          { name: 'context2', cluster: 'cluster2', namespace: 'kube-system', server: 'https://localhost:6444', isActive: false }
        ]
        mockApi.k8sGetContexts.mockResolvedValue({
          success: true,
          data: mockContexts,
          currentContext: 'context1'
        })

        const result = await k8sApi.getContexts()

        expect(result.success).toBe(true)
        expect(result.data).toEqual(mockContexts)
        expect(result.currentContext).toBe('context1')
      })

      it('should handle errors gracefully', async () => {
        mockApi.k8sGetContexts.mockRejectedValue(new Error('Connection failed'))

        const result = await k8sApi.getContexts()

        expect(result.success).toBe(false)
        expect(result.error).toBe('Connection failed')
      })
    })

    describe('getContextDetail', () => {
      it('should return context details', async () => {
        const mockDetail = {
          name: 'context1',
          cluster: 'cluster1',
          namespace: 'default',
          server: 'https://localhost:6443'
        }
        mockApi.k8sGetContextDetail.mockResolvedValue({
          success: true,
          data: mockDetail
        })

        const result = await k8sApi.getContextDetail('context1')

        expect(mockApi.k8sGetContextDetail).toHaveBeenCalledWith('context1')
        expect(result.success).toBe(true)
      })

      it('should handle errors', async () => {
        mockApi.k8sGetContextDetail.mockRejectedValue(new Error('Context not found'))

        const result = await k8sApi.getContextDetail('invalid-context')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Context not found')
      })
    })

    describe('switchContext', () => {
      it('should switch to specified context', async () => {
        mockApi.k8sSwitchContext.mockResolvedValue({
          success: true,
          currentContext: 'context2'
        })

        const result = await k8sApi.switchContext('context2')

        expect(mockApi.k8sSwitchContext).toHaveBeenCalledWith('context2')
        expect(result.success).toBe(true)
      })

      it('should handle switch errors', async () => {
        mockApi.k8sSwitchContext.mockRejectedValue(new Error('Switch failed'))

        const result = await k8sApi.switchContext('invalid')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Switch failed')
      })
    })

    describe('reloadConfig', () => {
      it('should reload and return updated contexts', async () => {
        const mockContexts = [{ name: 'context1', cluster: 'cluster1', namespace: 'default', server: 'https://localhost:6443', isActive: true }]
        mockApi.k8sReloadConfig.mockResolvedValue({
          success: true,
          data: mockContexts,
          currentContext: 'context1'
        })

        const result = await k8sApi.reloadConfig()

        expect(result.success).toBe(true)
        expect(result.data).toEqual(mockContexts)
      })

      it('should handle reload errors', async () => {
        mockApi.k8sReloadConfig.mockRejectedValue(new Error('File not found'))

        const result = await k8sApi.reloadConfig()

        expect(result.success).toBe(false)
        expect(result.error).toBe('File not found')
      })
    })

    describe('validateContext', () => {
      it('should return true for valid context', async () => {
        mockApi.k8sValidateContext.mockResolvedValue({
          success: true,
          isValid: true
        })

        const result = await k8sApi.validateContext('context1')

        expect(mockApi.k8sValidateContext).toHaveBeenCalledWith('context1')
        expect(result.success).toBe(true)
        expect(result.data).toBe(true)
      })

      it('should return false for invalid context', async () => {
        mockApi.k8sValidateContext.mockResolvedValue({
          success: true,
          isValid: false,
          error: 'Unable to connect'
        })

        const result = await k8sApi.validateContext('invalid')

        expect(result.data).toBe(false)
      })

      it('should handle validation errors', async () => {
        mockApi.k8sValidateContext.mockRejectedValue(new Error('Network error'))

        const result = await k8sApi.validateContext('context1')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Network error')
      })
    })

    describe('initialize', () => {
      it('should initialize and return contexts', async () => {
        const mockContexts = [{ name: 'context1', cluster: 'cluster1', namespace: 'default', server: 'https://localhost:6443', isActive: true }]
        mockApi.k8sInitialize.mockResolvedValue({
          success: true,
          data: mockContexts,
          currentContext: 'context1'
        })

        const result = await k8sApi.initialize()

        expect(result.success).toBe(true)
        expect(result.data).toEqual(mockContexts)
      })

      it('should handle initialization errors', async () => {
        mockApi.k8sInitialize.mockRejectedValue(new Error('Init failed'))

        const result = await k8sApi.initialize()

        expect(result.success).toBe(false)
        expect(result.error).toBe('Init failed')
      })
    })
  })

  describe('Proxy Configuration', () => {
    describe('setProxyConfig', () => {
      it('should set proxy configuration', async () => {
        const proxyConfig = {
          type: 'HTTP' as const,
          host: '127.0.0.1',
          port: 8080
        }
        mockApi.k8sSetProxy.mockResolvedValue({ success: true })

        const result = await k8sApi.setProxyConfig(proxyConfig)

        expect(mockApi.k8sSetProxy).toHaveBeenCalledWith(proxyConfig)
        expect(result.success).toBe(true)
      })

      it('should handle null proxy config', async () => {
        mockApi.k8sSetProxy.mockResolvedValue({ success: true })

        const result = await k8sApi.setProxyConfig(null)

        expect(mockApi.k8sSetProxy).toHaveBeenCalledWith(null)
        expect(result.success).toBe(true)
      })

      it('should handle errors', async () => {
        mockApi.k8sSetProxy.mockRejectedValue(new Error('Invalid proxy'))

        const result = await k8sApi.setProxyConfig({ host: 'invalid', port: -1 })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Invalid proxy')
      })
    })

    describe('getProxyConfig', () => {
      it('should return current proxy config', async () => {
        const proxyConfig = {
          type: 'HTTP' as const,
          host: '127.0.0.1',
          port: 8080
        }
        mockApi.k8sGetProxy.mockResolvedValue({
          success: true,
          data: proxyConfig
        })

        const result = await k8sApi.getProxyConfig()

        expect(result.success).toBe(true)
        expect(result.data).toEqual(proxyConfig)
      })

      it('should handle errors', async () => {
        mockApi.k8sGetProxy.mockRejectedValue(new Error('Failed to get proxy'))

        const result = await k8sApi.getProxyConfig()

        expect(result.success).toBe(false)
        expect(result.error).toBe('Failed to get proxy')
      })
    })
  })

  describe('Cluster Management', () => {
    describe('listClusters', () => {
      it('should return list of clusters', async () => {
        const mockClusters = [
          {
            id: 'cluster-1',
            name: 'Test Cluster',
            kubeconfig_path: '/path/to/config',
            kubeconfig_content: null,
            context_name: 'context1',
            server_url: 'https://localhost:6443',
            auth_type: 'token',
            is_active: 1,
            connection_status: 'connected',
            auto_connect: 1,
            default_namespace: 'default',
            created_at: '2024-01-01',
            updated_at: '2024-01-01'
          }
        ]
        mockApi.k8sClusterList.mockResolvedValue({
          success: true,
          data: mockClusters
        })

        const result = await k8sApi.listClusters()

        expect(result.success).toBe(true)
        expect(result.data).toEqual(mockClusters)
      })

      it('should handle errors', async () => {
        mockApi.k8sClusterList.mockRejectedValue(new Error('Database error'))

        const result = await k8sApi.listClusters()

        expect(result.success).toBe(false)
        expect(result.error).toBe('Database error')
      })
    })

    describe('getCluster', () => {
      it('should return cluster by id', async () => {
        const mockCluster = {
          id: 'cluster-1',
          name: 'Test Cluster',
          context_name: 'context1',
          server_url: 'https://localhost:6443'
        }
        mockApi.k8sClusterGet.mockResolvedValue({
          success: true,
          data: mockCluster
        })

        const result = await k8sApi.getCluster('cluster-1')

        expect(mockApi.k8sClusterGet).toHaveBeenCalledWith('cluster-1')
        expect(result.success).toBe(true)
        expect(result.data).toEqual(mockCluster)
      })

      it('should handle not found', async () => {
        mockApi.k8sClusterGet.mockResolvedValue({
          success: true,
          data: null
        })

        const result = await k8sApi.getCluster('non-existent')

        expect(result.data).toBeNull()
      })
    })

    describe('addCluster', () => {
      it('should add new cluster', async () => {
        mockApi.k8sClusterAdd.mockResolvedValue({
          success: true,
          id: 'new-cluster-id'
        })

        const result = await k8sApi.addCluster({
          name: 'New Cluster',
          contextName: 'context1',
          serverUrl: 'https://localhost:6443',
          kubeconfigPath: '/path/to/config'
        })

        expect(result.success).toBe(true)
        expect(result.data?.id).toBe('new-cluster-id')
      })

      it('should handle validation errors', async () => {
        mockApi.k8sClusterAdd.mockResolvedValue({
          success: false,
          error: 'Invalid configuration'
        })

        const result = await k8sApi.addCluster({
          name: '',
          contextName: '',
          serverUrl: ''
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Invalid configuration')
      })

      it('should handle exceptions', async () => {
        mockApi.k8sClusterAdd.mockRejectedValue(new Error('Database error'))

        const result = await k8sApi.addCluster({
          name: 'Test',
          contextName: 'ctx',
          serverUrl: 'https://localhost'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Database error')
      })
    })

    describe('updateCluster', () => {
      it('should update cluster', async () => {
        mockApi.k8sClusterUpdate.mockResolvedValue({ success: true })

        const result = await k8sApi.updateCluster('cluster-1', {
          name: 'Updated Name'
        })

        expect(mockApi.k8sClusterUpdate).toHaveBeenCalledWith('cluster-1', { name: 'Updated Name' })
        expect(result.success).toBe(true)
      })

      it('should handle update errors', async () => {
        mockApi.k8sClusterUpdate.mockRejectedValue(new Error('Update failed'))

        const result = await k8sApi.updateCluster('cluster-1', { name: 'Test' })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Update failed')
      })
    })

    describe('removeCluster', () => {
      it('should remove cluster', async () => {
        mockApi.k8sClusterRemove.mockResolvedValue({ success: true })

        const result = await k8sApi.removeCluster('cluster-1')

        expect(mockApi.k8sClusterRemove).toHaveBeenCalledWith('cluster-1')
        expect(result.success).toBe(true)
      })

      it('should handle removal errors', async () => {
        mockApi.k8sClusterRemove.mockRejectedValue(new Error('Cannot delete active cluster'))

        const result = await k8sApi.removeCluster('cluster-1')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Cannot delete active cluster')
      })
    })

    describe('testCluster', () => {
      it('should return true for valid cluster', async () => {
        mockApi.k8sClusterTest.mockResolvedValue({
          success: true,
          isValid: true
        })

        const result = await k8sApi.testCluster({
          contextName: 'context1',
          kubeconfigPath: '/path/to/config'
        })

        expect(result.success).toBe(true)
        expect(result.data).toBe(true)
      })

      it('should return false for invalid cluster', async () => {
        mockApi.k8sClusterTest.mockResolvedValue({
          success: true,
          isValid: false,
          error: 'Connection timeout'
        })

        const result = await k8sApi.testCluster({
          contextName: 'invalid',
          kubeconfigPath: '/invalid/path'
        })

        expect(result.data).toBe(false)
      })
    })

    describe('importKubeconfig', () => {
      it('should import kubeconfig and return contexts', async () => {
        const mockResult = {
          contexts: [{ name: 'ctx1', cluster: 'cluster1', namespace: 'default', server: 'https://localhost:6443', isActive: true }],
          kubeconfigPath: '/path/to/config',
          kubeconfigContent: 'yaml content'
        }
        mockApi.k8sClusterImportKubeconfig.mockResolvedValue({
          success: true,
          data: mockResult
        })

        const result = await k8sApi.importKubeconfig('/path/to/config')

        expect(mockApi.k8sClusterImportKubeconfig).toHaveBeenCalledWith('/path/to/config')
        expect(result.success).toBe(true)
        expect(result.data?.contexts).toHaveLength(1)
      })

      it('should handle import errors', async () => {
        mockApi.k8sClusterImportKubeconfig.mockRejectedValue(new Error('File not found'))

        const result = await k8sApi.importKubeconfig('/invalid/path')

        expect(result.success).toBe(false)
        expect(result.error).toBe('File not found')
      })
    })

    describe('connectCluster', () => {
      it('should connect to cluster', async () => {
        mockApi.k8sClusterConnect.mockResolvedValue({
          success: true,
          status: 'connected'
        })

        const result = await k8sApi.connectCluster('cluster-1')

        expect(mockApi.k8sClusterConnect).toHaveBeenCalledWith('cluster-1')
        expect(result.success).toBe(true)
        expect(result.data?.status).toBe('connected')
      })

      it('should handle connection errors', async () => {
        mockApi.k8sClusterConnect.mockRejectedValue(new Error('Connection refused'))

        const result = await k8sApi.connectCluster('cluster-1')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Connection refused')
      })
    })

    describe('disconnectCluster', () => {
      it('should disconnect from cluster', async () => {
        mockApi.k8sClusterDisconnect.mockResolvedValue({
          success: true,
          status: 'disconnected'
        })

        const result = await k8sApi.disconnectCluster('cluster-1')

        expect(result.success).toBe(true)
        expect(result.data?.status).toBe('disconnected')
      })

      it('should handle disconnection errors', async () => {
        mockApi.k8sClusterDisconnect.mockRejectedValue(new Error('Already disconnected'))

        const result = await k8sApi.disconnectCluster('cluster-1')

        expect(result.success).toBe(false)
      })
    })
  })

  describe('Terminal Operations', () => {
    describe('createTerminal', () => {
      it('should create terminal session', async () => {
        mockApi.k8sTerminalCreate.mockResolvedValue({
          success: true,
          id: 'terminal-123'
        })

        const result = await k8sApi.createTerminal({
          id: 'terminal-123',
          clusterId: 'cluster-1',
          namespace: 'default',
          cols: 80,
          rows: 24
        })

        expect(result.success).toBe(true)
        expect(result.data?.id).toBe('terminal-123')
      })

      it('should handle creation errors', async () => {
        mockApi.k8sTerminalCreate.mockRejectedValue(new Error('Cluster not connected'))

        const result = await k8sApi.createTerminal({
          id: 'terminal-123',
          clusterId: 'cluster-1'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Cluster not connected')
      })
    })

    describe('writeToTerminal', () => {
      it('should write data to terminal', async () => {
        mockApi.k8sTerminalWrite.mockResolvedValue({ success: true })

        const result = await k8sApi.writeToTerminal('terminal-123', 'ls -la\n')

        expect(mockApi.k8sTerminalWrite).toHaveBeenCalledWith('terminal-123', 'ls -la\n')
        expect(result.success).toBe(true)
      })

      it('should handle write errors', async () => {
        mockApi.k8sTerminalWrite.mockRejectedValue(new Error('Terminal closed'))

        const result = await k8sApi.writeToTerminal('terminal-123', 'test')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Terminal closed')
      })
    })

    describe('resizeTerminal', () => {
      it('should resize terminal', async () => {
        mockApi.k8sTerminalResize.mockResolvedValue({ success: true })

        const result = await k8sApi.resizeTerminal('terminal-123', 120, 40)

        expect(mockApi.k8sTerminalResize).toHaveBeenCalledWith('terminal-123', 120, 40)
        expect(result.success).toBe(true)
      })

      it('should handle resize errors', async () => {
        mockApi.k8sTerminalResize.mockRejectedValue(new Error('Invalid dimensions'))

        const result = await k8sApi.resizeTerminal('terminal-123', -1, -1)

        expect(result.success).toBe(false)
      })
    })

    describe('closeTerminal', () => {
      it('should close terminal session', async () => {
        mockApi.k8sTerminalClose.mockResolvedValue({ success: true })

        const result = await k8sApi.closeTerminal('terminal-123')

        expect(mockApi.k8sTerminalClose).toHaveBeenCalledWith('terminal-123')
        expect(result.success).toBe(true)
      })

      it('should handle close errors', async () => {
        mockApi.k8sTerminalClose.mockRejectedValue(new Error('Terminal not found'))

        const result = await k8sApi.closeTerminal('invalid')

        expect(result.success).toBe(false)
      })
    })

    describe('listTerminalSessions', () => {
      it('should list terminal sessions', async () => {
        const mockSessions = [
          { id: 'term-1', cluster_id: 'cluster-1', name: 'Shell', namespace: 'default', created_at: '2024-01-01', updated_at: '2024-01-01' }
        ]
        mockApi.k8sTerminalList.mockResolvedValue({
          success: true,
          data: mockSessions
        })

        const result = await k8sApi.listTerminalSessions('cluster-1')

        expect(result.success).toBe(true)
        expect(result.data).toEqual(mockSessions)
      })
    })

    describe('onTerminalData', () => {
      it('should subscribe to terminal data', () => {
        const cleanup = vi.fn()
        mockApi.k8sOnTerminalData.mockReturnValue(cleanup)
        const callback = vi.fn()

        const unsubscribe = k8sApi.onTerminalData('terminal-123', callback)

        expect(mockApi.k8sOnTerminalData).toHaveBeenCalledWith('terminal-123', callback)
        expect(unsubscribe).toBe(cleanup)
      })
    })

    describe('onTerminalExit', () => {
      it('should subscribe to terminal exit', () => {
        const cleanup = vi.fn()
        mockApi.k8sOnTerminalExit.mockReturnValue(cleanup)
        const callback = vi.fn()

        const unsubscribe = k8sApi.onTerminalExit('terminal-123', callback)

        expect(mockApi.k8sOnTerminalExit).toHaveBeenCalledWith('terminal-123', callback)
        expect(unsubscribe).toBe(cleanup)
      })
    })
  })

  describe('Agent Operations', () => {
    describe('agentSetCluster', () => {
      it('should set cluster for agent', async () => {
        mockApi.k8sAgentSetCluster.mockResolvedValue({ success: true })

        const result = await k8sApi.agentSetCluster({
          clusterId: 'cluster-1',
          contextName: 'context1',
          kubeconfigPath: '/path/to/config'
        })

        expect(result.success).toBe(true)
      })

      it('should handle errors', async () => {
        mockApi.k8sAgentSetCluster.mockRejectedValue(new Error('Invalid cluster'))

        const result = await k8sApi.agentSetCluster({
          clusterId: 'invalid',
          contextName: 'invalid'
        })

        expect(result.success).toBe(false)
      })
    })

    describe('agentSetProxy', () => {
      it('should set proxy for agent', async () => {
        mockApi.k8sAgentSetProxy.mockResolvedValue({ success: true })

        const result = await k8sApi.agentSetProxy({
          host: '127.0.0.1',
          port: 8080
        })

        expect(result.success).toBe(true)
      })
    })

    describe('agentKubectl', () => {
      it('should execute kubectl command', async () => {
        mockApi.k8sAgentKubectl.mockResolvedValue({
          success: true,
          output: 'NAME                     READY   STATUS    RESTARTS   AGE\nnginx-123456   1/1     Running   0          5m'
        })

        const result = await k8sApi.agentKubectl('get pods')

        expect(mockApi.k8sAgentKubectl).toHaveBeenCalledWith('get pods', undefined)
        expect(result.success).toBe(true)
        expect(result.output).toContain('nginx')
      })

      it('should handle command errors', async () => {
        mockApi.k8sAgentKubectl.mockRejectedValue(new Error('Command failed'))

        const result = await k8sApi.agentKubectl('invalid command')

        expect(result.success).toBe(false)
        expect(result.error).toBe('Command failed')
      })
    })

    describe('agentGetPods', () => {
      it('should get pods in default namespace', async () => {
        mockApi.k8sAgentGetPods.mockResolvedValue({
          success: true,
          output: 'pod1\npod2'
        })

        const result = await k8sApi.agentGetPods()

        expect(mockApi.k8sAgentGetPods).toHaveBeenCalledWith(undefined)
        expect(result.success).toBe(true)
      })

      it('should get pods in specified namespace', async () => {
        mockApi.k8sAgentGetPods.mockResolvedValue({
          success: true,
          output: 'kube-dns'
        })

        const result = await k8sApi.agentGetPods('kube-system')

        expect(mockApi.k8sAgentGetPods).toHaveBeenCalledWith('kube-system')
        expect(result.success).toBe(true)
      })
    })

    describe('agentGetNodes', () => {
      it('should get cluster nodes', async () => {
        mockApi.k8sAgentGetNodes.mockResolvedValue({
          success: true,
          output: 'node1 Ready\nnode2 Ready'
        })

        const result = await k8sApi.agentGetNodes()

        expect(result.success).toBe(true)
        expect(result.output).toContain('node1')
      })
    })

    describe('agentGetNamespaces', () => {
      it('should get namespaces', async () => {
        mockApi.k8sAgentGetNamespaces.mockResolvedValue({
          success: true,
          output: 'default\nkube-system\nkube-public'
        })

        const result = await k8sApi.agentGetNamespaces()

        expect(result.success).toBe(true)
        expect(result.output).toContain('default')
      })
    })

    describe('agentGetServices', () => {
      it('should get services', async () => {
        mockApi.k8sAgentGetServices.mockResolvedValue({
          success: true,
          output: 'kubernetes ClusterIP'
        })

        const result = await k8sApi.agentGetServices()

        expect(result.success).toBe(true)
      })
    })

    describe('agentGetDeployments', () => {
      it('should get deployments', async () => {
        mockApi.k8sAgentGetDeployments.mockResolvedValue({
          success: true,
          output: 'nginx-deployment 3/3'
        })

        const result = await k8sApi.agentGetDeployments('default')

        expect(mockApi.k8sAgentGetDeployments).toHaveBeenCalledWith('default')
        expect(result.success).toBe(true)
      })
    })

    describe('agentGetPodLogs', () => {
      it('should get pod logs', async () => {
        mockApi.k8sAgentGetPodLogs.mockResolvedValue({
          success: true,
          output: 'Starting nginx...\nReady'
        })

        const result = await k8sApi.agentGetPodLogs({
          podName: 'nginx-123',
          namespace: 'default',
          tailLines: 100
        })

        expect(result.success).toBe(true)
        expect(result.output).toContain('nginx')
      })
    })

    describe('agentDescribe', () => {
      it('should describe resource', async () => {
        mockApi.k8sAgentDescribe.mockResolvedValue({
          success: true,
          output: 'Name: nginx\nNamespace: default\nLabels: app=nginx'
        })

        const result = await k8sApi.agentDescribe({
          resourceType: 'pod',
          resourceName: 'nginx-123',
          namespace: 'default'
        })

        expect(result.success).toBe(true)
        expect(result.output).toContain('nginx')
      })
    })

    describe('agentTestConnection', () => {
      it('should test connection', async () => {
        mockApi.k8sAgentTestConnection.mockResolvedValue({
          success: true,
          output: 'Connection successful'
        })

        const result = await k8sApi.agentTestConnection()

        expect(result.success).toBe(true)
      })
    })

    describe('agentGetCurrentCluster', () => {
      it('should get current cluster info', async () => {
        mockApi.k8sAgentGetCurrentCluster.mockResolvedValue({
          success: true,
          data: {
            clusterId: 'cluster-1',
            contextName: 'context1'
          }
        })

        const result = await k8sApi.agentGetCurrentCluster()

        expect(result.success).toBe(true)
        expect(result.data?.clusterId).toBe('cluster-1')
      })
    })

    describe('agentCleanup', () => {
      it('should cleanup agent resources', async () => {
        mockApi.k8sAgentCleanup.mockResolvedValue({ success: true })

        const result = await k8sApi.agentCleanup()

        expect(result.success).toBe(true)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle unknown errors', async () => {
      mockApi.k8sGetContexts.mockRejectedValue({ message: undefined })

      const result = await k8sApi.getContexts()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })

    it('should handle non-Error thrown values', async () => {
      mockApi.k8sGetContexts.mockRejectedValue('string error')

      const result = await k8sApi.getContexts()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })
  })
})
