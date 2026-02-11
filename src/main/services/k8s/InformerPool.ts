/**
 * InformerPool manages Kubernetes Informers for watching resource changes
 * Implements real-time Watch mechanism with automatic reconnection and backoff retry
 */

import { K8sEventType, K8sResource, K8sResourceEvent, InformerOptions, InformerState, ResourceSnapshot } from './types'
import { KubeConfigLoader } from './KubeConfigLoader'
import { EventEmitter } from 'events'

import { createLogger } from '../logging'

const logger = createLogger('k8s')

// Lazy load kubernetes client
let k8sModule: any = null

async function ensureK8sModule() {
  if (!k8sModule) {
    k8sModule = await import('@kubernetes/client-node')
  }
  return k8sModule
}

/**
 * Represents a single Informer instance for a specific resource type
 */
class ResourceInformer extends EventEmitter {
  private informer: any
  private cache: Map<string, ResourceSnapshot> = new Map()
  private state: InformerState
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseBackoffMs = 1000
  private maxBackoffMs = 60000
  private reconnectTimer?: NodeJS.Timeout
  private resyncTimer?: NodeJS.Timeout

  constructor(
    private contextName: string,
    private resourceType: string,
    private kc: any,
    private makeInformer: any,
    private listFn: any,
    private options: InformerOptions = { contextName }
  ) {
    super()
    this.state = {
      contextName,
      resourceType,
      running: false,
      connected: false,
      resourceCount: 0,
      errorCount: 0
    }
  }

  /**
   * Start the informer
   */
  public async start(): Promise<void> {
    if (this.state.running) {
      logger.info(`[K8s Informer] ${this.resourceType} already running for ${this.contextName}`)
      return
    }

    try {
      logger.info(`[K8s Informer] Starting ${this.resourceType} informer for context: ${this.contextName}`)

      const path = this.buildApiPath()
      this.informer = this.makeInformer(this.kc, path, this.listFn, this.options.labelSelector)

      this.setupEventHandlers()

      await this.informer.start()

      this.state.running = true
      this.state.connected = true
      this.state.lastSyncTime = new Date()
      this.reconnectAttempts = 0

      logger.info(`[K8s Informer] ${this.resourceType} informer started successfully for ${this.contextName}`)
    } catch (error) {
      this.state.errorCount++
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`[K8s Informer] Failed to start ${this.resourceType} informer`, { error: this.state.lastError })
      this.scheduleReconnect()
      throw error
    }
  }

  /**
   * Stop the informer
   */
  public async stop(): Promise<void> {
    logger.info(`[K8s Informer] Stopping ${this.resourceType} informer for ${this.contextName}`)

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }

    if (this.resyncTimer) {
      clearInterval(this.resyncTimer)
      this.resyncTimer = undefined
    }

    if (this.informer) {
      try {
        await this.informer.stop()
      } catch (error) {
        logger.error(`[K8s Informer] Error stopping informer`, { error: error instanceof Error ? error.message : String(error) })
      }
    }

    this.state.running = false
    this.state.connected = false
    this.removeAllListeners()
  }

  /**
   * Get current state
   */
  public getState(): InformerState {
    return { ...this.state }
  }

  /**
   * Get resource cache snapshot
   */
  public getCache(): Map<string, ResourceSnapshot> {
    return new Map(this.cache)
  }

  /**
   * Get a specific resource from cache
   */
  public getResource(uid: string): K8sResource | undefined {
    return this.cache.get(uid)?.resource
  }

  /**
   * Get all resources from cache
   */
  public getAllResources(): K8sResource[] {
    return Array.from(this.cache.values()).map((snapshot) => snapshot.resource)
  }

  /**
   * Build API path based on namespace option
   */
  private buildApiPath(): string {
    const { namespace } = this.options

    if (this.resourceType === 'Pod') {
      return namespace ? `/api/v1/namespaces/${namespace}/pods` : '/api/v1/pods'
    } else if (this.resourceType === 'Node') {
      return '/api/v1/nodes'
    }

    throw new Error(`Unsupported resource type: ${this.resourceType}`)
  }

  /**
   * Setup event handlers for the informer
   */
  private setupEventHandlers(): void {
    if (!this.informer) return

    this.informer.on('add', (obj: K8sResource) => {
      this.handleEvent(K8sEventType.ADDED, obj)
    })

    this.informer.on('update', (obj: K8sResource) => {
      this.handleEvent(K8sEventType.MODIFIED, obj)
    })

    this.informer.on('delete', (obj: K8sResource) => {
      this.handleEvent(K8sEventType.DELETED, obj)
    })

    this.informer.on('error', (err: Error) => {
      this.handleError(err)
    })

    this.informer.on('connect', () => {
      logger.info(`[K8s Informer] ${this.resourceType} connected`)
      this.state.connected = true
      this.reconnectAttempts = 0
    })

    this.informer.on('disconnect', () => {
      logger.info(`[K8s Informer] ${this.resourceType} disconnected`)
      this.state.connected = false
      this.scheduleReconnect()
    })
  }

  /**
   * Handle resource events
   */
  private handleEvent(type: K8sEventType, resource: K8sResource): void {
    try {
      const uid = resource.metadata.uid

      if (!uid) {
        logger.warn('[K8s Informer] Resource without UID received', { value: resource.metadata.name })
        return
      }

      switch (type) {
        case K8sEventType.ADDED:
        case K8sEventType.MODIFIED:
          this.cache.set(uid, {
            uid,
            resource,
            lastUpdated: new Date()
          })
          break

        case K8sEventType.DELETED:
          this.cache.delete(uid)
          break
      }

      this.state.resourceCount = this.cache.size
      this.state.lastSyncTime = new Date()

      const event: K8sResourceEvent = {
        type,
        resource,
        contextName: this.contextName
      }

      this.emit('event', event)
      logger.info(`[K8s Informer] Event Received: ${type} ${this.resourceType}/${resource.metadata.name} in ${this.contextName}`)
    } catch (error) {
      logger.error(`[K8s Informer] Error handling event`, { error: error instanceof Error ? error.message : String(error) })
      this.state.errorCount++
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    this.state.errorCount++
    this.state.lastError = error.message
    logger.error(`[K8s Informer] ${this.resourceType} error`, { error: error.message })

    const event: K8sResourceEvent = {
      type: K8sEventType.ERROR,
      resource: {
        metadata: {
          uid: 'error',
          name: 'error'
        }
      } as K8sResource,
      contextName: this.contextName
    }

    this.emit('error', error, event)

    this.scheduleReconnect()
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.state.running) return
    if (this.reconnectTimer) return
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`[K8s Informer] Max reconnect attempts (${this.maxReconnectAttempts}) reached for ${this.resourceType}`)
      this.emit('maxRetriesReached')
      return
    }

    const backoffMs = Math.min(this.baseBackoffMs * Math.pow(2, this.reconnectAttempts), this.maxBackoffMs)

    logger.info(
      `Scheduling reconnect for ${this.resourceType} in ${backoffMs}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    )

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.reconnectAttempts++
      this.reconnect()
    }, backoffMs)
  }

  /**
   * Attempt to reconnect
   */
  private async reconnect(): Promise<void> {
    if (!this.state.running) return

    logger.info(`[K8s Informer] Attempting to reconnect ${this.resourceType} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    try {
      if (this.informer) {
        await this.informer.stop()
      }

      const path = this.buildApiPath()
      this.informer = this.makeInformer(this.kc, path, this.listFn, this.options.labelSelector)
      this.setupEventHandlers()
      await this.informer.start()

      this.state.connected = true
      this.reconnectAttempts = 0
      logger.info(`[K8s Informer] ${this.resourceType} reconnected successfully`)
    } catch (error) {
      logger.error(`[K8s Informer] Reconnection failed`, { error: error instanceof Error ? error.message : String(error) })
      this.scheduleReconnect()
    }
  }
}

/**
 * InformerPool manages multiple Informers across contexts and resource types
 */
export class InformerPool extends EventEmitter {
  private informers: Map<string, ResourceInformer> = new Map()
  private configLoader: KubeConfigLoader

  constructor(configLoader: KubeConfigLoader) {
    super()
    this.configLoader = configLoader
  }

  /**
   * Start watching a resource type for a specific context
   */
  public async startInformer(resourceType: 'Pod' | 'Node', options: InformerOptions): Promise<void> {
    const key = this.getInformerKey(options.contextName, resourceType)

    if (this.informers.has(key)) {
      logger.info(`[K8s InformerPool] Informer already exists for ${resourceType} in ${options.contextName}`)
      return
    }

    try {
      const k8sModule = await ensureK8sModule()
      const kc = this.configLoader.getKubeConfig()

      if (!kc) {
        logger.error('[K8s InformerPool] KubeConfig not initialized for context', { value: options.contextName })
        return
      }

      kc.setCurrentContext(options.contextName)

      const api = kc.makeApiClient(k8sModule.CoreV1Api)
      const makeInformer = k8sModule.makeInformer
      const listFn = resourceType === 'Pod' ? () => api.listPodForAllNamespaces() : () => api.listNode()

      const informer = new ResourceInformer(options.contextName, resourceType, kc, makeInformer, listFn, options)

      informer.on('event', (event: K8sResourceEvent) => {
        this.emit('event', event)
      })

      informer.on('error', (error: Error, event: K8sResourceEvent) => {
        this.emit('error', error, event)
      })

      informer.on('maxRetriesReached', () => {
        logger.error(`[K8s InformerPool] Max retries reached for ${resourceType} in ${options.contextName}, stopping informer`)
        this.stopInformer(options.contextName, resourceType)
      })

      await informer.start()
      this.informers.set(key, informer)

      logger.info(`[K8s InformerPool] Started ${resourceType} informer for ${options.contextName}`)
    } catch (error) {
      logger.error(`[K8s InformerPool] Failed to start ${resourceType} informer for ${options.contextName}`, {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Stop an informer
   */
  public async stopInformer(contextName: string, resourceType: string): Promise<void> {
    const key = this.getInformerKey(contextName, resourceType)
    const informer = this.informers.get(key)

    if (!informer) {
      logger.warn(`[K8s InformerPool] No informer found for ${resourceType} in ${contextName}`)
      return
    }

    await informer.stop()
    this.informers.delete(key)
    logger.info(`[K8s InformerPool] Stopped ${resourceType} informer for ${contextName}`)
  }

  /**
   * Stop all informers for a context
   */
  public async stopContextInformers(contextName: string): Promise<void> {
    const keys = Array.from(this.informers.keys()).filter((key) => key.startsWith(contextName))

    await Promise.all(
      keys.map(async (key) => {
        const informer = this.informers.get(key)
        if (informer) {
          await informer.stop()
          this.informers.delete(key)
        }
      })
    )

    logger.info(`[K8s InformerPool] Stopped all informers for ${contextName}`)
  }

  /**
   * Stop all informers
   */
  public async stopAll(): Promise<void> {
    logger.info('[K8s InformerPool] Stopping all informers...')

    await Promise.all(Array.from(this.informers.values()).map((informer) => informer.stop()))

    this.informers.clear()
    logger.info('[K8s InformerPool] All informers stopped')
  }

  /**
   * Get informer state
   */
  public getInformerState(contextName: string, resourceType: string): InformerState | undefined {
    const key = this.getInformerKey(contextName, resourceType)
    return this.informers.get(key)?.getState()
  }

  /**
   * Get all informer states
   */
  public getAllStates(): Map<string, InformerState> {
    const states = new Map<string, InformerState>()
    this.informers.forEach((informer, key) => {
      states.set(key, informer.getState())
    })
    return states
  }

  /**
   * Get cached resources for a specific informer
   */
  public getResources(contextName: string, resourceType: string): K8sResource[] {
    const key = this.getInformerKey(contextName, resourceType)
    return this.informers.get(key)?.getAllResources() || []
  }

  /**
   * Get a specific resource from cache
   */
  public getResource(contextName: string, resourceType: string, uid: string): K8sResource | undefined {
    const key = this.getInformerKey(contextName, resourceType)
    return this.informers.get(key)?.getResource(uid)
  }

  /**
   * Get all cached resources across all informers
   */
  public getAllResources(): Map<string, K8sResource[]> {
    const allResources = new Map<string, K8sResource[]>()
    this.informers.forEach((informer, key) => {
      allResources.set(key, informer.getAllResources())
    })
    return allResources
  }

  /**
   * Check if an informer is running
   */
  public isInformerRunning(contextName: string, resourceType: string): boolean {
    const key = this.getInformerKey(contextName, resourceType)
    const state = this.informers.get(key)?.getState()
    return state?.running || false
  }

  /**
   * Generate unique key for informer
   */
  private getInformerKey(contextName: string, resourceType: string): string {
    return `${contextName}:${resourceType}`
  }

  /**
   * Get statistics
   */
  public getStatistics(): {
    totalInformers: number
    runningInformers: number
    totalResources: number
    errorCount: number
  } {
    let runningCount = 0
    let totalResources = 0
    let errorCount = 0

    this.informers.forEach((informer) => {
      const state = informer.getState()
      if (state.running) runningCount++
      totalResources += state.resourceCount
      errorCount += state.errorCount
    })

    return {
      totalInformers: this.informers.size,
      runningInformers: runningCount,
      totalResources,
      errorCount
    }
  }
}
