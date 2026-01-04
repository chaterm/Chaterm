/**
 * DeltaPusher - Bridges InformerPool and DeltaCalculator, pushes batches via IPC
 *
 * This module:
 * 1. Listens to InformerPool events
 * 2. Processes events through DeltaCalculator
 * 3. Pushes batched deltas to renderer via IPC
 */

import { BrowserWindow } from 'electron'
import { InformerPool } from './InformerPool'
import { DeltaCalculator } from './DeltaCalculator'
import { K8sResourceEvent, DeltaBatch } from './types'

/**
 * DeltaPusher configuration
 */
export interface DeltaPusherOptions {
  throttleWindowMs?: number
  maxBatchSize?: number
}

/**
 * Resource type enum for delta calculation
 */
type ResourceType = 'Pod' | 'Node'

/**
 * DeltaPusher manages delta calculation and IPC streaming
 */
export class DeltaPusher {
  private deltaCalculators: Map<string, DeltaCalculator> = new Map()
  private informerPool: InformerPool
  private mainWindow: BrowserWindow | null = null
  private options: DeltaPusherOptions

  constructor(informerPool: InformerPool, options: DeltaPusherOptions = {}) {
    this.informerPool = informerPool
    this.options = options
    this.setupEventListeners()
  }

  /**
   * Set the main window for IPC communication
   */
  public setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * Setup event listeners for InformerPool
   */
  private setupEventListeners(): void {
    this.informerPool.on('event', (event: K8sResourceEvent) => {
      this.handleInformerEvent(event)
    })

    this.informerPool.on('error', (error: Error) => {
      console.error('[DeltaPusher] Informer error:', error.message)
    })
  }

  /**
   * Handle informer events
   */
  private handleInformerEvent(event: K8sResourceEvent): void {
    const resourceType = this.detectResourceType(event)
    if (!resourceType) {
      console.warn('[DeltaPusher] Cannot detect resource type:', event)
      return
    }

    const calculatorKey = this.getCalculatorKey(event.contextName, resourceType)
    let calculator = this.deltaCalculators.get(calculatorKey)

    if (!calculator) {
      calculator = this.createDeltaCalculator(calculatorKey, event.contextName, resourceType)
      this.deltaCalculators.set(calculatorKey, calculator)
    }

    calculator.processEvent(event, resourceType)
  }

  /**
   * Create a new DeltaCalculator instance
   */
  private createDeltaCalculator(key: string, contextName: string, resourceType: string): DeltaCalculator {
    const calculator = new DeltaCalculator({
      throttleWindowMs: this.options.throttleWindowMs,
      maxBatchSize: this.options.maxBatchSize,
      onBatchReady: (batch: DeltaBatch) => {
        this.pushBatchToRenderer(batch, contextName, resourceType)
      }
    })

    console.log(`[DeltaPusher] Created DeltaCalculator for ${key}`)
    return calculator
  }

  /**
   * Push delta batch to renderer via IPC
   */
  private pushBatchToRenderer(batch: DeltaBatch, contextName: string, resourceType: string): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn('[DeltaPusher] Main window not available, skipping IPC push')
      return
    }

    const enrichedBatch = {
      ...batch,
      contextName,
      resourceType
    }

    try {
      this.mainWindow.webContents.send('k8s:delta-batch', enrichedBatch)
      console.log(`[DeltaPusher] Pushed batch to renderer: ${batch.totalChanges} changes for ${contextName}/${resourceType}`)
    } catch (error) {
      console.error('[DeltaPusher] Failed to push batch to renderer:', error)
    }
  }

  /**
   * Detect resource type from event
   */
  private detectResourceType(event: K8sResourceEvent): ResourceType | null {
    const kind = event.resource.kind

    if (kind === 'Pod') {
      return 'Pod'
    } else if (kind === 'Node') {
      return 'Node'
    }

    return null
  }

  /**
   * Generate calculator key
   */
  private getCalculatorKey(contextName: string, resourceType: string): string {
    return `${contextName}:${resourceType}`
  }

  /**
   * Force flush all pending deltas
   */
  public flushAll(): void {
    this.deltaCalculators.forEach((calculator, key) => {
      console.log(`[DeltaPusher] Flushing calculator: ${key}`)
      calculator.flush()
    })
  }

  /**
   * Get statistics for all calculators
   */
  public getStatistics() {
    const stats: any = {}

    this.deltaCalculators.forEach((calculator, key) => {
      stats[key] = calculator.getStats()
    })

    return {
      totalCalculators: this.deltaCalculators.size,
      calculators: stats
    }
  }

  /**
   * Clean up specific calculator
   */
  public removeCalculator(contextName: string, resourceType: string): void {
    const key = this.getCalculatorKey(contextName, resourceType)
    const calculator = this.deltaCalculators.get(key)

    if (calculator) {
      calculator.destroy()
      this.deltaCalculators.delete(key)
      console.log(`[DeltaPusher] Removed calculator: ${key}`)
    }
  }

  /**
   * Clean up all calculators
   */
  public destroy(): void {
    console.log('[DeltaPusher] Destroying all calculators...')

    this.deltaCalculators.forEach((calculator) => {
      calculator.destroy()
    })

    this.deltaCalculators.clear()
    this.informerPool.removeAllListeners('event')
    this.informerPool.removeAllListeners('error')

    console.log('[DeltaPusher] All calculators destroyed')
  }
}
