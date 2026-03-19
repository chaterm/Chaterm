/**
 * K8S Agent IPC Handlers
 *
 * Registers IPC handlers for K8S Agent operations
 */

import { ipcMain } from 'electron'
import { K8sAgentManager, K8sCommandResult } from './index'
import { K8sProxyConfig } from '../../../services/k8s'

const logger = createLogger('k8s-agent-ipc')

/**
 * Register K8S Agent IPC handlers
 */
export function registerK8sAgentHandlers(): void {
  const k8sAgent = K8sAgentManager.getInstance()

  /**
   * Set current cluster for Agent operations
   * Channel: k8s:agent:set-cluster
   */
  ipcMain.handle(
    'k8s:agent:set-cluster',
    async (
      _event,
      params: {
        clusterId: string
        contextName: string
        kubeconfigPath?: string
        kubeconfigContent?: string
      }
    ) => {
      try {
        logger.info('[K8s Agent IPC] Setting current cluster', { clusterId: params.clusterId })
        await k8sAgent.setCurrentCluster(params.clusterId, params.contextName, params.kubeconfigPath, params.kubeconfigContent)
        return { success: true }
      } catch (error) {
        logger.error('[K8s Agent IPC] Failed to set cluster', { error })
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * Set proxy configuration for Agent
   * Channel: k8s:agent:set-proxy
   */
  ipcMain.handle('k8s:agent:set-proxy', (_event, proxyConfig: K8sProxyConfig | null) => {
    try {
      logger.info('[K8s Agent IPC] Setting proxy config', { hasProxy: !!proxyConfig })
      k8sAgent.setProxyConfig(proxyConfig)
      return { success: true }
    } catch (error) {
      logger.error('[K8s Agent IPC] Failed to set proxy', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Execute kubectl command
   * Channel: k8s:agent:kubectl
   */
  ipcMain.handle('k8s:agent:kubectl', async (_event, command: string, timeout?: number): Promise<K8sCommandResult> => {
    try {
      logger.info('[K8s Agent IPC] Executing kubectl', { command })
      return await k8sAgent.executeKubectl(command, timeout)
    } catch (error) {
      logger.error('[K8s Agent IPC] kubectl execution failed', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get pods
   * Channel: k8s:agent:get-pods
   */
  ipcMain.handle('k8s:agent:get-pods', async (_event, namespace?: string): Promise<K8sCommandResult> => {
    try {
      logger.info('[K8s Agent IPC] Getting pods', { namespace })
      return await k8sAgent.getPods(namespace)
    } catch (error) {
      logger.error('[K8s Agent IPC] Failed to get pods', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get nodes
   * Channel: k8s:agent:get-nodes
   */
  ipcMain.handle('k8s:agent:get-nodes', async (): Promise<K8sCommandResult> => {
    try {
      logger.info('[K8s Agent IPC] Getting nodes')
      return await k8sAgent.getNodes()
    } catch (error) {
      logger.error('[K8s Agent IPC] Failed to get nodes', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get namespaces
   * Channel: k8s:agent:get-namespaces
   */
  ipcMain.handle('k8s:agent:get-namespaces', async (): Promise<K8sCommandResult> => {
    try {
      logger.info('[K8s Agent IPC] Getting namespaces')
      return await k8sAgent.getNamespaces()
    } catch (error) {
      logger.error('[K8s Agent IPC] Failed to get namespaces', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get services
   * Channel: k8s:agent:get-services
   */
  ipcMain.handle('k8s:agent:get-services', async (_event, namespace?: string): Promise<K8sCommandResult> => {
    try {
      logger.info('[K8s Agent IPC] Getting services', { namespace })
      return await k8sAgent.getServices(namespace)
    } catch (error) {
      logger.error('[K8s Agent IPC] Failed to get services', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get deployments
   * Channel: k8s:agent:get-deployments
   */
  ipcMain.handle('k8s:agent:get-deployments', async (_event, namespace?: string): Promise<K8sCommandResult> => {
    try {
      logger.info('[K8s Agent IPC] Getting deployments', { namespace })
      return await k8sAgent.getDeployments(namespace)
    } catch (error) {
      logger.error('[K8s Agent IPC] Failed to get deployments', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get pod logs
   * Channel: k8s:agent:get-pod-logs
   */
  ipcMain.handle(
    'k8s:agent:get-pod-logs',
    async (
      _event,
      params: {
        podName: string
        namespace?: string
        container?: string
        tailLines?: number
      }
    ): Promise<K8sCommandResult> => {
      try {
        logger.info('[K8s Agent IPC] Getting pod logs', { podName: params.podName, namespace: params.namespace })
        return await k8sAgent.getPodLogs(params.podName, params.namespace, params.container, params.tailLines)
      } catch (error) {
        logger.error('[K8s Agent IPC] Failed to get pod logs', { error })
        return {
          success: false,
          output: '',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * Describe resource
   * Channel: k8s:agent:describe
   */
  ipcMain.handle(
    'k8s:agent:describe',
    async (
      _event,
      params: {
        resourceType: string
        resourceName: string
        namespace?: string
      }
    ): Promise<K8sCommandResult> => {
      try {
        logger.info('[K8s Agent IPC] Describing resource', { type: params.resourceType, name: params.resourceName })
        return await k8sAgent.describeResource(params.resourceType, params.resourceName, params.namespace)
      } catch (error) {
        logger.error('[K8s Agent IPC] Failed to describe resource', { error })
        return {
          success: false,
          output: '',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * Test connection
   * Channel: k8s:agent:test-connection
   */
  ipcMain.handle('k8s:agent:test-connection', async (): Promise<K8sCommandResult> => {
    try {
      logger.info('[K8s Agent IPC] Testing connection')
      return await k8sAgent.testConnection()
    } catch (error) {
      logger.error('[K8s Agent IPC] Connection test failed', { error })
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get current cluster
   * Channel: k8s:agent:get-current-cluster
   */
  ipcMain.handle('k8s:agent:get-current-cluster', () => {
    try {
      const cluster = k8sAgent.getCurrentCluster()
      return { success: true, data: cluster }
    } catch (error) {
      logger.error('[K8s Agent IPC] Failed to get current cluster', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Cleanup
   * Channel: k8s:agent:cleanup
   */
  ipcMain.handle('k8s:agent:cleanup', () => {
    try {
      k8sAgent.cleanup()
      return { success: true }
    } catch (error) {
      logger.error('[K8s Agent IPC] Cleanup failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  logger.info('[K8s Agent IPC] All K8s Agent IPC handlers registered')
}
