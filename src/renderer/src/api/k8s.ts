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
    logger.error('Failed to get contexts', { error: String(error) })
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
    logger.error('Failed to get context detail', { error: String(error) })
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
    logger.error('Failed to switch context', { error: String(error) })
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
    logger.error('Failed to reload config', { error: String(error) })
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
    logger.error('Failed to validate context', { error: String(error) })
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
    logger.error('Failed to initialize', { error: String(error) })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
