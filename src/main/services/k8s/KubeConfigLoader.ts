/**
 * KubeConfigLoader handles loading and parsing Kubernetes configuration files
 * Uses dynamic import to support ES Module @kubernetes/client-node
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { K8sContext, K8sContextInfo, LoadConfigOptions, LoadConfigResult } from './types'

// Lazy load kubernetes client to avoid ESM issues
let k8sModule: any = null
let KubeConfigClass: any = null

async function ensureK8sModule() {
  if (!k8sModule) {
    k8sModule = await import('@kubernetes/client-node')
    KubeConfigClass = k8sModule.KubeConfig
  }
  return { k8sModule, KubeConfigClass }
}

/**
 * KubeConfigLoader handles loading and parsing Kubernetes configuration files
 */
export class KubeConfigLoader {
  private kc: any
  private defaultConfigPath: string
  private initialized: boolean = false

  constructor() {
    this.defaultConfigPath = path.join(os.homedir(), '.kube', 'config')
  }

  /**
   * Initialize the loader (must be called before any other methods)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    const { KubeConfigClass } = await ensureK8sModule()
    this.kc = new KubeConfigClass()
    this.initialized = true
  }

  /**
   * Load configurations from default or custom path
   * @param options Loading options
   * @returns LoadConfigResult containing contexts and status
   */
  public async loadConfigs(options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
    try {
      await this.initialize()

      const configPath = options.configPath || this.defaultConfigPath

      // Check if config file exists
      if (!fs.existsSync(configPath)) {
        return {
          success: false,
          contexts: [],
          error: `KubeConfig file not found at ${configPath}`
        }
      }

      // Load the config file
      this.kc.loadFromFile(configPath)

      // Extract contexts information
      const contexts = this.extractContexts()
      const currentContext = this.kc.getCurrentContext()

      return {
        success: true,
        contexts,
        currentContext,
        error: undefined
      }
    } catch (error) {
      console.error('[K8s] Failed to load config:', error)
      return {
        success: false,
        contexts: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  /**
   * Load from default location (~/.kube/config)
   */
  public async loadFromDefault(): Promise<LoadConfigResult> {
    try {
      await this.initialize()

      this.kc.loadFromDefault()
      const contexts = this.extractContexts()
      const currentContext = this.kc.getCurrentContext()

      return {
        success: true,
        contexts,
        currentContext
      }
    } catch (error) {
      console.error('[K8s] Failed to load from default:', error)
      return {
        success: false,
        contexts: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  /**
   * Load from custom file path
   * @param configPath Path to kubeconfig file
   */
  public async loadFromFile(configPath: string): Promise<LoadConfigResult> {
    return this.loadConfigs({ configPath })
  }

  /**
   * Extract and format context information from loaded config
   * @returns Array of formatted context info
   */
  private extractContexts(): K8sContextInfo[] {
    const contexts = this.kc.getContexts()
    const currentContext = this.kc.getCurrentContext()

    return contexts.map((context) => {
      const cluster = this.kc.getClusters().find((c) => c.name === context.cluster)
      const namespace = context.namespace || 'default'

      return {
        name: context.name,
        cluster: context.cluster,
        namespace,
        server: cluster?.server || 'unknown',
        isActive: context.name === currentContext
      }
    })
  }

  /**
   * Get detailed context information
   * @param contextName Name of the context
   * @returns Detailed context information or undefined
   */
  public getContextDetail(contextName: string): K8sContext | undefined {
    if (!this.initialized) return undefined

    const contexts = this.kc.getContexts()
    const context = contexts.find((c) => c.name === contextName)

    if (!context) {
      return undefined
    }

    const cluster = this.kc.getClusters().find((c) => c.name === context.cluster)
    const user = this.kc.getUsers().find((u) => u.name === context.user)

    return {
      name: context.name,
      cluster: context.cluster,
      user: context.user,
      namespace: context.namespace,
      clusterInfo: cluster
        ? {
            server: cluster.server,
            certificateAuthority: cluster.caFile,
            skipTLSVerify: cluster.skipTLSVerify
          }
        : undefined,
      userInfo: user
        ? {
            clientCertificate: user.certFile,
            clientKey: user.keyFile,
            token: user.token,
            username: user.username,
            password: user.password
          }
        : undefined
    }
  }

  /**
   * Get the KubeConfig instance for creating API clients
   */
  public getKubeConfig(): any {
    return this.kc
  }

  /**
   * Get current context name
   */
  public getCurrentContext(): string {
    if (!this.initialized) return ''
    return this.kc.getCurrentContext()
  }

  /**
   * Set current context
   * @param contextName Name of the context to set as current
   */
  public setCurrentContext(contextName: string): boolean {
    if (!this.initialized) return false

    try {
      this.kc.setCurrentContext(contextName)
      return true
    } catch (error) {
      console.error('[K8s] Failed to set current context:', error)
      return false
    }
  }

  /**
   * Validate if a context can connect to cluster
   * @param contextName Name of the context to validate
   */
  public async validateContext(contextName: string): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize()
      }

      const { k8sModule } = await ensureK8sModule()
      const CoreV1Api = k8sModule.CoreV1Api

      const originalContext = this.kc.getCurrentContext()
      this.kc.setCurrentContext(contextName)

      const k8sApi = this.kc.makeApiClient(CoreV1Api)
      await k8sApi.getAPIResources()

      // Restore original context
      this.kc.setCurrentContext(originalContext)
      return true
    } catch (error) {
      console.error(`[K8s] Context validation failed for ${contextName}:`, error)
      return false
    }
  }
}
