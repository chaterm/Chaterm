/**
 * Kubernetes API wrapper for renderer process
 * Wraps IPC calls to main process
 */

const logger = createRendererLogger('api.k8s')

// Use a getter to ensure we always access the current window.api value
// This is important for testing where window.api may be mocked
const getApi = () => (window as any).api

export interface K8sContextInfo {
  name: string
  cluster: string
  namespace: string
  server: string
  isActive: boolean
}

export interface K8sCluster {
  id: string
  name: string
  kubeconfig_path: string | null
  kubeconfig_content: string | null
  context_name: string
  server_url: string
  auth_type: string
  is_active: number
  connection_status: string
  auto_connect: number
  default_namespace: string
  created_at: string
  updated_at: string
}

export interface K8sTerminalSession {
  id: string
  cluster_id: string
  name: string | null
  namespace: string
  created_at: string
  updated_at: string
}

export interface K8sApiResponse<T = any> {
  success: boolean
  data?: T
  currentContext?: string
  error?: string
}

/**
 * Get all available K8s contexts
 */
export async function getContexts(): Promise<K8sApiResponse<K8sContextInfo[]>> {
  try {
    return await getApi().k8sGetContexts()
  } catch (error) {
    logger.error('Failed to get contexts', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get detailed information about a specific context
 */
export async function getContextDetail(contextName: string): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sGetContextDetail(contextName)
  } catch (error) {
    logger.error('Failed to get context detail', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Switch to a different context
 */
export async function switchContext(contextName: string): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sSwitchContext(contextName)
  } catch (error) {
    logger.error('Failed to switch context', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Reload K8s configurations
 */
export async function reloadConfig(): Promise<K8sApiResponse<K8sContextInfo[]>> {
  try {
    return await getApi().k8sReloadConfig()
  } catch (error) {
    logger.error('Failed to reload config', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validate a context connection
 */
export async function validateContext(contextName: string): Promise<K8sApiResponse<boolean>> {
  try {
    const result = await getApi().k8sValidateContext(contextName)
    return {
      success: result.success,
      data: result.isValid,
      error: result.error
    }
  } catch (error) {
    logger.error('Failed to validate context', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Initialize K8s Manager
 */
export async function initialize(): Promise<K8sApiResponse<K8sContextInfo[]>> {
  try {
    return await getApi().k8sInitialize()
  } catch (error) {
    logger.error('Failed to initialize', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ==================== Proxy Configuration APIs ====================

/**
 * Proxy configuration for K8S API server connections
 */
export interface K8sProxyConfig {
  type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
  host: string
  port: number
  enableProxyIdentity?: boolean
  username?: string
  password?: string
}

/**
 * Set proxy configuration for K8S API server connections
 */
export async function setProxyConfig(proxyConfig: K8sProxyConfig | null): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sSetProxy(proxyConfig)
  } catch (error) {
    logger.error('Failed to set proxy config', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get current proxy configuration
 */
export async function getProxyConfig(): Promise<K8sApiResponse<K8sProxyConfig | null>> {
  try {
    return await getApi().k8sGetProxy()
  } catch (error) {
    logger.error('Failed to get proxy config', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ==================== Cluster Management APIs ====================

/**
 * List saved K8s clusters from database
 */
export async function listClusters(): Promise<K8sApiResponse<K8sCluster[]>> {
  try {
    return await getApi().k8sClusterList()
  } catch (error) {
    logger.error('Failed to list clusters', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get a K8s cluster by ID
 */
export async function getCluster(id: string): Promise<K8sApiResponse<K8sCluster | null>> {
  try {
    return await getApi().k8sClusterGet(id)
  } catch (error) {
    logger.error('Failed to get cluster', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Add a new K8s cluster
 */
export async function addCluster(params: {
  name: string
  kubeconfigPath?: string
  kubeconfigContent?: string
  contextName: string
  serverUrl: string
  authType?: string
  autoConnect?: boolean
  defaultNamespace?: string
}): Promise<K8sApiResponse<{ id: string }>> {
  try {
    const result = await getApi().k8sClusterAdd(params)
    return {
      success: result.success,
      data: result.id ? { id: result.id } : undefined,
      error: result.error
    }
  } catch (error) {
    logger.error('Failed to add cluster', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Update a K8s cluster
 */
export async function updateCluster(
  id: string,
  params: {
    name?: string
    kubeconfigPath?: string
    kubeconfigContent?: string
    contextName?: string
    serverUrl?: string
    authType?: string
    isActive?: boolean
    connectionStatus?: string
    autoConnect?: boolean
    defaultNamespace?: string
  }
): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sClusterUpdate(id, params)
  } catch (error) {
    logger.error('Failed to update cluster', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Remove a K8s cluster
 */
export async function removeCluster(id: string): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sClusterRemove(id)
  } catch (error) {
    logger.error('Failed to remove cluster', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Test cluster connection
 */
export async function testCluster(params: {
  kubeconfigPath?: string
  kubeconfigContent?: string
  contextName: string
}): Promise<K8sApiResponse<boolean>> {
  try {
    const result = await getApi().k8sClusterTest(params)
    return {
      success: result.success,
      data: result.isValid,
      error: result.error
    }
  } catch (error) {
    logger.error('Failed to test cluster', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Import clusters from kubeconfig file
 */
export async function importKubeconfig(kubeconfigPath: string): Promise<
  K8sApiResponse<{
    contexts: K8sContextInfo[]
    kubeconfigPath: string
    kubeconfigContent: string
  }>
> {
  try {
    return await getApi().k8sClusterImportKubeconfig(kubeconfigPath)
  } catch (error) {
    logger.error('Failed to import kubeconfig', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Connect to a cluster
 */
export async function connectCluster(id: string): Promise<K8sApiResponse<{ status: string }>> {
  try {
    const result = await getApi().k8sClusterConnect(id)
    return {
      success: result.success,
      data: result.status ? { status: result.status } : undefined,
      error: result.error
    }
  } catch (error) {
    logger.error('Failed to connect to cluster', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Disconnect from a cluster
 */
export async function disconnectCluster(id: string): Promise<K8sApiResponse<{ status: string }>> {
  try {
    const result = await getApi().k8sClusterDisconnect(id)
    return {
      success: result.success,
      data: result.status ? { status: result.status } : undefined,
      error: result.error
    }
  } catch (error) {
    logger.error('Failed to disconnect from cluster', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ==================== Terminal APIs ====================

/**
 * Create a K8s terminal session
 */
export async function createTerminal(config: {
  id: string
  clusterId: string
  namespace?: string
  cols?: number
  rows?: number
}): Promise<K8sApiResponse<{ id: string }>> {
  try {
    const result = await getApi().k8sTerminalCreate(config)
    return {
      success: result.success,
      data: result.id ? { id: result.id } : undefined,
      error: result.error
    }
  } catch (error) {
    logger.error('Failed to create terminal', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Write data to K8s terminal
 */
export async function writeToTerminal(terminalId: string, data: string): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sTerminalWrite(terminalId, data)
  } catch (error) {
    logger.error('Failed to write to terminal', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Resize K8s terminal
 */
export async function resizeTerminal(terminalId: string, cols: number, rows: number): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sTerminalResize(terminalId, cols, rows)
  } catch (error) {
    logger.error('Failed to resize terminal', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Close K8s terminal session
 */
export async function closeTerminal(terminalId: string): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sTerminalClose(terminalId)
  } catch (error) {
    logger.error('Failed to close terminal', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * List terminal sessions for a cluster
 */
export async function listTerminalSessions(clusterId: string): Promise<K8sApiResponse<K8sTerminalSession[]>> {
  try {
    return await getApi().k8sTerminalList(clusterId)
  } catch (error) {
    logger.error('Failed to list terminal sessions', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Subscribe to terminal data
 */
export function onTerminalData(terminalId: string, callback: (data: string) => void): () => void {
  return getApi().k8sOnTerminalData(terminalId, callback)
}

/**
 * Subscribe to terminal exit
 */
export function onTerminalExit(terminalId: string, callback: (exitCode: any) => void): () => void {
  return getApi().k8sOnTerminalExit(terminalId, callback)
}

// ==================== K8S Agent APIs ====================

/**
 * K8S Agent command result
 */
export interface K8sAgentCommandResult {
  success: boolean
  output: string
  error?: string
  exitCode?: number
}

/**
 * Set current cluster for Agent operations
 */
export async function agentSetCluster(params: {
  clusterId: string
  contextName: string
  kubeconfigPath?: string
  kubeconfigContent?: string
}): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sAgentSetCluster(params)
  } catch (error) {
    logger.error('Failed to set agent cluster', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Set proxy configuration for K8S Agent
 */
export async function agentSetProxy(proxyConfig: K8sProxyConfig | null): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sAgentSetProxy(proxyConfig)
  } catch (error) {
    logger.error('Failed to set agent proxy', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Execute kubectl command via Agent
 */
export async function agentKubectl(command: string, timeout?: number): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentKubectl(command, timeout)
  } catch (error) {
    logger.error('Failed to execute kubectl', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get pods via Agent
 */
export async function agentGetPods(namespace?: string): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentGetPods(namespace)
  } catch (error) {
    logger.error('Failed to get pods', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get nodes via Agent
 */
export async function agentGetNodes(): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentGetNodes()
  } catch (error) {
    logger.error('Failed to get nodes', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get namespaces via Agent
 */
export async function agentGetNamespaces(): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentGetNamespaces()
  } catch (error) {
    logger.error('Failed to get namespaces', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get services via Agent
 */
export async function agentGetServices(namespace?: string): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentGetServices(namespace)
  } catch (error) {
    logger.error('Failed to get services', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get deployments via Agent
 */
export async function agentGetDeployments(namespace?: string): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentGetDeployments(namespace)
  } catch (error) {
    logger.error('Failed to get deployments', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get pod logs via Agent
 */
export async function agentGetPodLogs(params: {
  podName: string
  namespace?: string
  container?: string
  tailLines?: number
}): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentGetPodLogs(params)
  } catch (error) {
    logger.error('Failed to get pod logs', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Describe resource via Agent
 */
export async function agentDescribe(params: { resourceType: string; resourceName: string; namespace?: string }): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentDescribe(params)
  } catch (error) {
    logger.error('Failed to describe resource', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Test K8S connection via Agent
 */
export async function agentTestConnection(): Promise<K8sAgentCommandResult> {
  try {
    return await getApi().k8sAgentTestConnection()
  } catch (error) {
    logger.error('Failed to test connection', { error })
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get current cluster info from Agent
 */
export async function agentGetCurrentCluster(): Promise<K8sApiResponse<{ clusterId: string | null; contextName: string | null }>> {
  try {
    return await getApi().k8sAgentGetCurrentCluster()
  } catch (error) {
    logger.error('Failed to get current cluster', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Cleanup K8S Agent resources
 */
export async function agentCleanup(): Promise<K8sApiResponse> {
  try {
    return await getApi().k8sAgentCleanup()
  } catch (error) {
    logger.error('Failed to cleanup agent', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
