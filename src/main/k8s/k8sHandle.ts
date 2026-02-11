import { ipcMain } from 'electron'
import { K8sManager } from '../services/k8s'

import { createLogger } from '@logging'

const logger = createLogger('k8s')

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
      logger.info('[K8s IPC] Received request to get contexts')
      const contexts = await k8sManager.getContexts()
      logger.info('[K8s IPC] Returning contexts', { value: contexts })
      return {
        success: true,
        data: contexts,
        currentContext: k8sManager.getCurrentContext()
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to get contexts', { error: error instanceof Error ? error.message : String(error) })
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
      logger.info('[K8s IPC] Getting context detail for', { value: contextName })
      const detail = k8sManager.getContextDetail(contextName)
      return {
        success: true,
        data: detail
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to get context detail', { error: error instanceof Error ? error.message : String(error) })
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
      logger.info('[K8s IPC] Switching to context', { value: contextName })
      const success = await k8sManager.switchContext(contextName)
      return {
        success,
        currentContext: k8sManager.getCurrentContext()
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to switch context', { error: error instanceof Error ? error.message : String(error) })
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
      logger.info('[K8s IPC] Reloading configurations')
      const result = await k8sManager.reload()
      return {
        success: result.success,
        data: result.contexts,
        currentContext: result.currentContext,
        error: result.error
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to reload config', { error: error instanceof Error ? error.message : String(error) })
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
      logger.info('[K8s IPC] Validating context', { value: contextName })
      const isValid = await k8sManager.validateContext(contextName)
      return {
        success: true,
        isValid
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to validate context', { error: error instanceof Error ? error.message : String(error) })
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
      logger.info('[K8s IPC] Initializing K8s Manager')
      const result = await k8sManager.initialize()
      return {
        success: result.success,
        data: result.contexts,
        currentContext: result.currentContext,
        error: result.error
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to initialize', { error: error instanceof Error ? error.message : String(error) })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Start watching resources
   * Channel: k8s:start-watch
   */
  ipcMain.handle('k8s:start-watch', async (_event, contextName: string, resourceType: string, options?: any) => {
    try {
      logger.info(`[K8s IPC] Starting watch for ${resourceType} in ${contextName}`)

      const resourceTypes: Array<'Pod' | 'Node'> = []
      if (resourceType === 'Pod' || resourceType === 'Node') {
        resourceTypes.push(resourceType)
      } else {
        throw new Error(`Unsupported resource type: ${resourceType}`)
      }

      await k8sManager.startWatching(contextName, resourceTypes, options)

      return {
        success: true
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to start watch', { error: error instanceof Error ? error.message : String(error) })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Stop watching resources
   * Channel: k8s:stop-watch
   */
  ipcMain.handle('k8s:stop-watch', async (_event, contextName: string, resourceType: string) => {
    try {
      logger.info(`[K8s IPC] Stopping watch for ${resourceType} in ${contextName}`)

      await k8sManager.stopWatching(contextName)

      const deltaPusher = k8sManager.getDeltaPusher()
      deltaPusher.removeCalculator(contextName, resourceType)

      return {
        success: true
      }
    } catch (error) {
      logger.error('[K8s IPC] Failed to stop watch', { error: error instanceof Error ? error.message : String(error) })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  logger.info('[K8s IPC] All K8s IPC handlers registered')
}
