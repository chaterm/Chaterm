import { KubeConfigLoader } from './KubeConfigLoader'
import { K8sContext, K8sContextInfo, K8sManagerState, LoadConfigResult } from './types'

/**
 * K8sManager handles the lifecycle of Kubernetes connections and contexts
 * Singleton pattern to ensure only one instance manages K8s state
 */
export class K8sManager {
  private static instance: K8sManager | null = null
  private configLoader: KubeConfigLoader
  private state: K8sManagerState

  private constructor() {
    this.configLoader = new KubeConfigLoader()
    this.state = {
      initialized: false,
      contexts: new Map<string, K8sContext>()
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): K8sManager {
    if (!K8sManager.instance) {
      K8sManager.instance = new K8sManager()
    }
    return K8sManager.instance
  }

  /**
   * Initialize the K8s manager by loading configurations
   */
  public async initialize(): Promise<LoadConfigResult> {
    try {
      console.log('[K8s] Initializing K8s Manager...')

      const result = await this.configLoader.loadFromDefault()

      if (result.success) {
        // Store context details
        result.contexts.forEach((contextInfo) => {
          const detail = this.configLoader.getContextDetail(contextInfo.name)
          if (detail) {
            this.state.contexts.set(contextInfo.name, detail)
          }
        })

        this.state.currentContext = result.currentContext
        this.state.initialized = true

        console.log(
          `[K8s] Initialized successfully with ${result.contexts.length} contexts`,
          result.contexts.map((c) => c.name)
        )
      } else {
        console.warn('[K8s] Initialization failed:', result.error)
      }

      return result
    } catch (error) {
      console.error('[K8s] Failed to initialize:', error)
      return {
        success: false,
        contexts: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get all available contexts
   */
  public async getContexts(): Promise<K8sContextInfo[]> {
    if (!this.state.initialized) {
      const result = await this.initialize()
      return result.contexts
    }

    const result = await this.configLoader.loadFromDefault()
    return result.contexts
  }

  /**
   * Get detailed information about a specific context
   */
  public getContextDetail(contextName: string): K8sContext | undefined {
    return this.state.contexts.get(contextName)
  }

  /**
   * Get current active context
   */
  public getCurrentContext(): string | undefined {
    return this.state.currentContext
  }

  /**
   * Switch to a different context
   */
  public async switchContext(contextName: string): Promise<boolean> {
    try {
      const success = this.configLoader.setCurrentContext(contextName)
      if (success) {
        this.state.currentContext = contextName
        console.log(`[K8s] Switched to context: ${contextName}`)
      }
      return success
    } catch (error) {
      console.error(`[K8s] Failed to switch context to ${contextName}:`, error)
      return false
    }
  }

  /**
   * Reload configurations from file
   */
  public async reload(): Promise<LoadConfigResult> {
    console.log('[K8s] Reloading configurations...')
    this.state.contexts.clear()
    this.state.initialized = false
    return this.initialize()
  }

  /**
   * Check if manager is initialized
   */
  public isInitialized(): boolean {
    return this.state.initialized
  }

  /**
   * Get the config loader instance (for advanced usage)
   */
  public getConfigLoader(): KubeConfigLoader {
    return this.configLoader
  }

  /**
   * Validate a context connection
   */
  public async validateContext(contextName: string): Promise<boolean> {
    return this.configLoader.validateContext(contextName)
  }

  /**
   * Get manager state for debugging
   */
  public getState(): K8sManagerState {
    return {
      ...this.state,
      contexts: new Map(this.state.contexts)
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    console.log('[K8s] Cleaning up K8s Manager...')
    this.state.contexts.clear()
    this.state.initialized = false
    this.state.currentContext = undefined
  }
}
