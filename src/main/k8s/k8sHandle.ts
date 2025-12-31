import { ipcMain } from 'electron'
import { K8sManager } from '../services/k8s'

/**
 * Register all K8s related IPC handlers
 */
export function registerK8sHandlers(): void {
  const k8sManager = K8sManager.getInstance()

  /**
   * Get all available K8s contexts
   * Channel: k8s:get-contexts
   */
  ipcMain.handle('k8s:get-contexts', async () => {
    try {
      console.log('[K8s IPC] Received request to get contexts')
      const contexts = await k8sManager.getContexts()
      console.log('[K8s IPC] Returning contexts:', contexts)
      return {
        success: true,
        data: contexts,
        currentContext: k8sManager.getCurrentContext()
      }
    } catch (error) {
      console.error('[K8s IPC] Failed to get contexts:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Get detailed information about a specific context
   * Channel: k8s:get-context-detail
   */
  ipcMain.handle('k8s:get-context-detail', async (_event, contextName: string) => {
    try {
      console.log('[K8s IPC] Getting context detail for:', contextName)
      const detail = k8sManager.getContextDetail(contextName)
      return {
        success: true,
        data: detail
      }
    } catch (error) {
      console.error('[K8s IPC] Failed to get context detail:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Switch to a different context
   * Channel: k8s:switch-context
   */
  ipcMain.handle('k8s:switch-context', async (_event, contextName: string) => {
    try {
      console.log('[K8s IPC] Switching to context:', contextName)
      const success = await k8sManager.switchContext(contextName)
      return {
        success,
        currentContext: k8sManager.getCurrentContext()
      }
    } catch (error) {
      console.error('[K8s IPC] Failed to switch context:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Reload K8s configurations
   * Channel: k8s:reload-config
   */
  ipcMain.handle('k8s:reload-config', async () => {
    try {
      console.log('[K8s IPC] Reloading configurations')
      const result = await k8sManager.reload()
      return {
        success: result.success,
        data: result.contexts,
        currentContext: result.currentContext,
        error: result.error
      }
    } catch (error) {
      console.error('[K8s IPC] Failed to reload config:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Validate a context connection
   * Channel: k8s:validate-context
   */
  ipcMain.handle('k8s:validate-context', async (_event, contextName: string) => {
    try {
      console.log('[K8s IPC] Validating context:', contextName)
      const isValid = await k8sManager.validateContext(contextName)
      return {
        success: true,
        isValid
      }
    } catch (error) {
      console.error('[K8s IPC] Failed to validate context:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Initialize K8s Manager
   * Channel: k8s:initialize
   */
  ipcMain.handle('k8s:initialize', async () => {
    try {
      console.log('[K8s IPC] Initializing K8s Manager')
      const result = await k8sManager.initialize()
      return {
        success: result.success,
        data: result.contexts,
        currentContext: result.currentContext,
        error: result.error
      }
    } catch (error) {
      console.error('[K8s IPC] Failed to initialize:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  console.log('[K8s IPC] All K8s IPC handlers registered')
}
