import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as k8sApi from '@/api/k8s'
import type { K8sCluster, K8sProxyConfig } from '@/api/k8s'

const logger = createRendererLogger('store.k8s')

export interface K8sContextInfo {
  name: string
  cluster: string
  namespace: string
  server: string
  isActive: boolean
}

/**
 * Terminal tab state
 */
export interface TerminalTab {
  id: string
  clusterId: string
  name: string
  namespace: string
  isActive: boolean
}

/**
 * K8s Store for managing Kubernetes contexts, clusters, and terminal sessions
 */
export const useK8sStore = defineStore('k8s', () => {
  // ==================== State ====================

  // Context state (from kubeconfig)
  const contexts = ref<K8sContextInfo[]>([])
  const currentContext = ref<string>('')

  // Cluster state (from database)
  const clusters = ref<K8sCluster[]>([])
  const activeClusterId = ref<string | null>(null)

  // Terminal state
  const terminalTabs = ref<TerminalTab[]>([])
  const activeTerminalId = ref<string | null>(null)

  // UI state
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)
  const initialized = ref<boolean>(false)

  // Proxy state
  const proxyConfig = ref<K8sProxyConfig | null>(null)

  // ==================== Getters ====================

  const activeContext = computed(() => {
    return contexts.value.find((ctx) => ctx.isActive)
  })

  const contextCount = computed(() => contexts.value.length)

  const hasContexts = computed(() => contexts.value.length > 0)

  const activeCluster = computed(() => {
    if (!activeClusterId.value) return null
    return clusters.value.find((c) => c.id === activeClusterId.value) || null
  })

  const clusterCount = computed(() => clusters.value.length)

  const hasClusters = computed(() => clusters.value.length > 0)

  const connectedClusters = computed(() => {
    return clusters.value.filter((c) => c.connection_status === 'connected')
  })

  const activeTerminal = computed(() => {
    if (!activeTerminalId.value) return null
    return terminalTabs.value.find((t) => t.id === activeTerminalId.value) || null
  })

  // ==================== Context Actions ====================

  /**
   * Initialize K8s store by loading contexts and clusters
   */
  async function initialize() {
    if (initialized.value) {
      logger.info('Already initialized')
      return
    }

    loading.value = true
    error.value = null

    try {
      logger.info('Initializing...')

      // Load contexts from kubeconfig
      const contextResult = await k8sApi.initialize()
      if (contextResult.success && contextResult.data) {
        contexts.value = contextResult.data
        currentContext.value = contextResult.currentContext || ''
        logger.info('Initialized with contexts', { count: contextResult.data.length })
      }

      // Load clusters from database
      const clusterResult = await k8sApi.listClusters()
      if (clusterResult.success && clusterResult.data) {
        clusters.value = clusterResult.data
        // Set active cluster
        const active = clusterResult.data.find((c) => c.is_active === 1)
        if (active) {
          activeClusterId.value = active.id
        }
        logger.info('Loaded clusters', { count: clusterResult.data.length })
      }

      initialized.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Initialization error', { error: err })
    } finally {
      loading.value = false
    }
  }

  /**
   * Load or refresh contexts
   */
  async function loadContexts() {
    loading.value = true
    error.value = null

    try {
      logger.info('Loading contexts...')
      const result = await k8sApi.getContexts()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        logger.info('Loaded contexts', { count: result.data.length })
      } else {
        error.value = result.error || 'Failed to load contexts'
        logger.warn('Load failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Load error', { error: err })
    } finally {
      loading.value = false
    }
  }

  /**
   * Switch to a different context
   */
  async function switchContext(contextName: string) {
    loading.value = true
    error.value = null

    try {
      logger.info('Switching to context', { context: contextName })
      const result = await k8sApi.switchContext(contextName)

      if (result.success) {
        currentContext.value = result.currentContext || contextName
        // Update isActive flag
        contexts.value.forEach((ctx) => {
          ctx.isActive = ctx.name === contextName
        })
        logger.info('Switched to context', { context: contextName })
      } else {
        error.value = result.error || 'Failed to switch context'
        logger.warn('Switch failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Switch error', { error: err })
    } finally {
      loading.value = false
    }
  }

  /**
   * Reload configurations from file
   */
  async function reloadConfig() {
    loading.value = true
    error.value = null

    try {
      logger.info('Reloading configuration...')
      const result = await k8sApi.reloadConfig()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        logger.info('Reloaded contexts', { count: result.data.length })
      } else {
        error.value = result.error || 'Failed to reload config'
        logger.warn('Reload failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Reload error', { error: err })
    } finally {
      loading.value = false
    }
  }

  /**
   * Validate a context connection
   */
  async function validateContext(contextName: string): Promise<boolean> {
    try {
      logger.info('Validating context', { context: contextName })
      const result = await k8sApi.validateContext(contextName)

      if (result.success) {
        logger.info('Context validation result', { valid: result.data })
        return result.data || false
      } else {
        logger.warn('Validation failed', { error: result.error })
        return false
      }
    } catch (err) {
      logger.error('Validation error', { error: err })
      return false
    }
  }

  // ==================== Cluster Actions ====================

  /**
   * Load clusters from database
   */
  async function loadClusters() {
    loading.value = true
    error.value = null

    try {
      logger.info('Loading clusters...')
      const result = await k8sApi.listClusters()

      if (result.success && result.data) {
        clusters.value = result.data
        // Update active cluster
        const active = result.data.find((c) => c.is_active === 1)
        if (active) {
          activeClusterId.value = active.id
        }
        logger.info('Loaded clusters', { count: result.data.length })
      } else {
        error.value = result.error || 'Failed to load clusters'
        logger.warn('Load clusters failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Load clusters error', { error: err })
    } finally {
      loading.value = false
    }
  }

  /**
   * Add a new cluster
   */
  async function addCluster(params: {
    name: string
    kubeconfigPath?: string
    kubeconfigContent?: string
    contextName: string
    serverUrl: string
    authType?: string
    autoConnect?: boolean
    defaultNamespace?: string
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      logger.info('Adding cluster', { name: params.name })
      const result = await k8sApi.addCluster(params)

      if (result.success) {
        // Reload clusters to get the new one
        await loadClusters()
        logger.info('Cluster added', { id: result.data?.id })
      }

      return {
        success: result.success,
        id: result.data?.id,
        error: result.error
      }
    } catch (err) {
      logger.error('Add cluster error', { error: err })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Update a cluster
   */
  async function updateCluster(
    id: string,
    params: {
      name?: string
      kubeconfigPath?: string
      kubeconfigContent?: string
      contextName?: string
      serverUrl?: string
      authType?: string
      autoConnect?: boolean
      defaultNamespace?: string
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Updating cluster', { id })
      const result = await k8sApi.updateCluster(id, params)

      if (result.success) {
        // Reload clusters to get the updated one
        await loadClusters()
        logger.info('Cluster updated', { id })
      }

      return {
        success: result.success,
        error: result.error
      }
    } catch (err) {
      logger.error('Update cluster error', { error: err })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Remove a cluster
   */
  async function removeCluster(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Removing cluster', { id })
      const result = await k8sApi.removeCluster(id)

      if (result.success) {
        // Update local state
        clusters.value = clusters.value.filter((c) => c.id !== id)
        if (activeClusterId.value === id) {
          activeClusterId.value = null
        }
        // Remove associated terminal tabs
        terminalTabs.value = terminalTabs.value.filter((t) => t.clusterId !== id)
        logger.info('Cluster removed', { id })
      }

      return {
        success: result.success,
        error: result.error
      }
    } catch (err) {
      logger.error('Remove cluster error', { error: err })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Connect to a cluster
   */
  async function connectCluster(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Connecting to cluster', { id })
      const result = await k8sApi.connectCluster(id)

      if (result.success) {
        // Update local state
        const cluster = clusters.value.find((c) => c.id === id)
        if (cluster) {
          cluster.connection_status = 'connected'
          cluster.is_active = 1

          // Set up K8S Agent with the cluster configuration
          await k8sApi.agentSetCluster({
            clusterId: cluster.id,
            contextName: cluster.context_name,
            kubeconfigPath: cluster.kubeconfig_path || undefined,
            kubeconfigContent: cluster.kubeconfig_content || undefined
          })

          // Apply proxy configuration to Agent if enabled
          if (proxyConfig.value) {
            await k8sApi.agentSetProxy(proxyConfig.value)
          }

          logger.info('K8S Agent configured for cluster', { id, contextName: cluster.context_name })
        }
        // Deactivate other clusters
        clusters.value.forEach((c) => {
          if (c.id !== id) {
            c.is_active = 0
          }
        })
        activeClusterId.value = id
        logger.info('Connected to cluster', { id })
      }

      return {
        success: result.success,
        error: result.error
      }
    } catch (err) {
      logger.error('Connect cluster error', { error: err })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Disconnect from a cluster
   */
  async function disconnectCluster(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Disconnecting from cluster', { id })
      const result = await k8sApi.disconnectCluster(id)

      if (result.success) {
        // Update local state
        const cluster = clusters.value.find((c) => c.id === id)
        if (cluster) {
          cluster.connection_status = 'disconnected'
        }
        logger.info('Disconnected from cluster', { id })
      }

      return {
        success: result.success,
        error: result.error
      }
    } catch (err) {
      logger.error('Disconnect cluster error', { error: err })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Import clusters from kubeconfig
   */
  async function importFromKubeconfig(kubeconfigPath: string): Promise<{
    success: boolean
    contexts?: K8sContextInfo[]
    kubeconfigContent?: string
    error?: string
  }> {
    try {
      logger.info('Importing from kubeconfig', { path: kubeconfigPath })
      const result = await k8sApi.importKubeconfig(kubeconfigPath)

      if (result.success && result.data) {
        logger.info('Imported contexts', { count: result.data.contexts.length })
        return {
          success: true,
          contexts: result.data.contexts,
          kubeconfigContent: result.data.kubeconfigContent
        }
      }

      return {
        success: false,
        error: result.error
      }
    } catch (err) {
      logger.error('Import kubeconfig error', { error: err })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  // ==================== Terminal Actions ====================

  /**
   * Add a terminal tab
   */
  function addTerminalTab(tab: TerminalTab) {
    terminalTabs.value.push(tab)
    activeTerminalId.value = tab.id
  }

  /**
   * Remove a terminal tab
   */
  function removeTerminalTab(id: string) {
    const index = terminalTabs.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      terminalTabs.value.splice(index, 1)
      // Set next active tab
      if (activeTerminalId.value === id) {
        if (terminalTabs.value.length > 0) {
          const newIndex = Math.min(index, terminalTabs.value.length - 1)
          activeTerminalId.value = terminalTabs.value[newIndex].id
        } else {
          activeTerminalId.value = null
        }
      }
    }
  }

  /**
   * Set active terminal tab
   */
  function setActiveTerminal(id: string) {
    activeTerminalId.value = id
    terminalTabs.value.forEach((t) => {
      t.isActive = t.id === id
    })
  }

  // ==================== Proxy Actions ====================

  /**
   * Set proxy configuration for K8S API server connections
   */
  async function setProxyConfig(config: K8sProxyConfig | null): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Setting proxy config', { hasProxy: !!config })
      const result = await k8sApi.setProxyConfig(config)

      if (result.success) {
        proxyConfig.value = config

        // Also update Agent's proxy configuration
        await k8sApi.agentSetProxy(config)

        logger.info('Proxy config set')
      }

      return {
        success: result.success,
        error: result.error
      }
    } catch (err) {
      logger.error('Set proxy config error', { error: err })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Get current proxy configuration
   */
  async function getProxyConfig(): Promise<K8sProxyConfig | null> {
    try {
      const result = await k8sApi.getProxyConfig()
      if (result.success) {
        proxyConfig.value = result.data || null
        return proxyConfig.value
      }
      return null
    } catch (err) {
      logger.error('Get proxy config error', { error: err })
      return null
    }
  }

  /**
   * Apply proxy configuration from user settings (needProxy + proxyConfig from global state)
   * This should be called during initialization
   */
  async function applyUserProxyConfig(needProxy?: boolean, userProxyConfig?: K8sProxyConfig): Promise<void> {
    if (needProxy && userProxyConfig?.host && userProxyConfig?.port) {
      await setProxyConfig(userProxyConfig)
    } else {
      await setProxyConfig(null)
    }
  }

  // ==================== Utility Actions ====================

  /**
   * Clear error message
   */
  function clearError() {
    error.value = null
  }

  /**
   * Reset store to initial state
   */
  function reset() {
    contexts.value = []
    currentContext.value = ''
    clusters.value = []
    activeClusterId.value = null
    terminalTabs.value = []
    activeTerminalId.value = null
    loading.value = false
    error.value = null
    initialized.value = false
    proxyConfig.value = null
  }

  return {
    // State
    contexts,
    currentContext,
    clusters,
    activeClusterId,
    terminalTabs,
    activeTerminalId,
    loading,
    error,
    initialized,
    proxyConfig,

    // Getters
    activeContext,
    contextCount,
    hasContexts,
    activeCluster,
    clusterCount,
    hasClusters,
    connectedClusters,
    activeTerminal,

    // Context Actions
    initialize,
    loadContexts,
    switchContext,
    reloadConfig,
    validateContext,

    // Cluster Actions
    loadClusters,
    addCluster,
    updateCluster,
    removeCluster,
    connectCluster,
    disconnectCluster,
    importFromKubeconfig,

    // Terminal Actions
    addTerminalTab,
    removeTerminalTab,
    setActiveTerminal,

    // Proxy Actions
    setProxyConfig,
    getProxyConfig,
    applyUserProxyConfig,

    // Utility Actions
    clearError,
    reset
  }
})
