/**
 * DeltaCalculator - Handles incremental updates and IPC throttling
 *
 * This module solves the Electron IPC bottleneck problem by:
 * 1. Computing JSON diffs instead of sending full resources
 * 2. Batching multiple changes within a time window
 * 3. Throttling updates to prevent UI blocking
 */

import { Operation } from 'fast-json-patch'
import { compare as jsonDiff } from 'fast-json-patch'
import { K8sResource, K8sResourceEvent, K8sEventType } from './types'

import { createLogger } from '../logging'

const logger = createLogger('k8s')

/**
 * Delta patch operation types
 */
export enum DeltaOperationType {
  ADD = 'ADD',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

/**
 * Delta patch for a single resource
 */
export interface ResourceDelta {
  type: DeltaOperationType
  uid: string
  contextName: string
  resourceType: string
  name: string
  namespace?: string
  patches?: Operation[]
  fullResource?: K8sResource
}

/**
 * Batched delta update
 */
export interface DeltaBatch {
  timestamp: Date
  deltas: ResourceDelta[]
  totalChanges: number
}

/**
 * Delta calculator configuration
 */
export interface DeltaCalculatorOptions {
  throttleWindowMs?: number
  maxBatchSize?: number
  onBatchReady?: (batch: DeltaBatch) => void
}

/**
 * DeltaCalculator manages incremental updates and throttling
 */
export class DeltaCalculator {
  private resourceCache: Map<string, K8sResource> = new Map()
  private pendingDeltas: ResourceDelta[] = []
  private throttleTimer?: NodeJS.Timeout
  private readonly throttleWindowMs: number
  private readonly maxBatchSize: number
  private readonly onBatchReady?: (batch: DeltaBatch) => void
  private totalChangesProcessed = 0

  constructor(options: DeltaCalculatorOptions = {}) {
    this.throttleWindowMs = options.throttleWindowMs || 100
    this.maxBatchSize = options.maxBatchSize || 100
    this.onBatchReady = options.onBatchReady
  }

  /**
   * Process a K8s resource event and generate delta
   */
  public processEvent(event: K8sResourceEvent, resourceType: string): void {
    const { type, resource, contextName } = event

    if (!resource.metadata || !resource.metadata.uid) {
      logger.warn('[DeltaCalculator] Resource without metadata or UID, skipping delta calculation')
      return
    }

    const uid = resource.metadata.uid

    const cacheKey = `${contextName}:${resourceType}:${uid}`
    const cachedResource = this.resourceCache.get(cacheKey)

    let delta: ResourceDelta | null = null

    switch (type) {
      case K8sEventType.ADDED:
        delta = this.handleAdd(cacheKey, resource, contextName, resourceType)
        break

      case K8sEventType.MODIFIED:
        delta = this.handleModify(cacheKey, resource, contextName, resourceType, cachedResource)
        break

      case K8sEventType.DELETED:
        delta = this.handleDelete(cacheKey, resource, contextName, resourceType)
        break

      default:
        logger.warn(`[DeltaCalculator] Unknown event type: ${type}`)
        return
    }

    if (delta) {
      this.addToBatch(delta)
    }
  }

  /**
   * Handle ADD event
   */
  private handleAdd(cacheKey: string, resource: K8sResource, contextName: string, resourceType: string): ResourceDelta {
    this.resourceCache.set(cacheKey, this.cloneResource(resource))

    return {
      type: DeltaOperationType.ADD,
      uid: resource.metadata.uid,
      contextName,
      resourceType,
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      fullResource: this.sanitizeResource(resource)
    }
  }

  /**
   * Handle MODIFIED event
   */
  private handleModify(
    cacheKey: string,
    resource: K8sResource,
    contextName: string,
    resourceType: string,
    cachedResource?: K8sResource
  ): ResourceDelta | null {
    if (!cachedResource) {
      logger.warn('[DeltaCalculator] Modified event without cached resource, treating as ADD')
      return this.handleAdd(cacheKey, resource, contextName, resourceType)
    }

    const patches = this.computeDiff(cachedResource, resource)

    if (patches.length === 0) {
      logger.info('[DeltaCalculator] No changes detected, skipping update')
      return null
    }

    this.resourceCache.set(cacheKey, this.cloneResource(resource))

    return {
      type: DeltaOperationType.UPDATE,
      uid: resource.metadata.uid,
      contextName,
      resourceType,
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      patches
    }
  }

  /**
   * Handle DELETE event
   */
  private handleDelete(cacheKey: string, resource: K8sResource, contextName: string, resourceType: string): ResourceDelta {
    this.resourceCache.delete(cacheKey)

    return {
      type: DeltaOperationType.DELETE,
      uid: resource.metadata.uid,
      contextName,
      resourceType,
      name: resource.metadata.name,
      namespace: resource.metadata.namespace
    }
  }

  /**
   * Compute JSON diff between old and new resource
   */
  private computeDiff(oldResource: K8sResource, newResource: K8sResource): Operation[] {
    const sanitizedOld = this.sanitizeResource(oldResource)
    const sanitizedNew = this.sanitizeResource(newResource)

    return jsonDiff(sanitizedOld, sanitizedNew)
  }

  /**
   * Sanitize resource by removing noise fields
   */
  private sanitizeResource(resource: K8sResource): K8sResource {
    const cloned = this.cloneResource(resource)

    if (cloned.metadata) {
      delete cloned.metadata.managedFields
      delete cloned.metadata.selfLink
    }

    return cloned
  }

  /**
   * Deep clone resource
   */
  private cloneResource(resource: K8sResource): K8sResource {
    return JSON.parse(JSON.stringify(resource))
  }

  /**
   * Add delta to pending batch
   */
  private addToBatch(delta: ResourceDelta): void {
    this.pendingDeltas.push(delta)
    this.totalChangesProcessed++

    if (this.pendingDeltas.length >= this.maxBatchSize) {
      this.flushBatch()
    } else {
      this.scheduleFlush()
    }
  }

  /**
   * Schedule batch flush after throttle window
   */
  private scheduleFlush(): void {
    if (this.throttleTimer) {
      return
    }

    this.throttleTimer = setTimeout(() => {
      this.flushBatch()
    }, this.throttleWindowMs)
  }

  /**
   * Flush pending deltas as a batch
   */
  private flushBatch(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = undefined
    }

    if (this.pendingDeltas.length === 0) {
      return
    }

    const batch: DeltaBatch = {
      timestamp: new Date(),
      deltas: [...this.pendingDeltas],
      totalChanges: this.pendingDeltas.length
    }

    this.pendingDeltas = []

    if (this.onBatchReady) {
      this.onBatchReady(batch)
    }

    logger.info(`[DeltaCalculator] Flushed batch with ${batch.totalChanges} changes`)
  }

  /**
   * Force flush pending changes immediately
   */
  public flush(): void {
    this.flushBatch()
  }

  /**
   * Clear all cached resources
   */
  public clearCache(): void {
    this.resourceCache.clear()
    this.pendingDeltas = []
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = undefined
    }
  }

  /**
   * Get statistics
   */
  public getStats() {
    return {
      cachedResources: this.resourceCache.size,
      pendingDeltas: this.pendingDeltas.length,
      totalChangesProcessed: this.totalChangesProcessed
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.clearCache()
  }
}
