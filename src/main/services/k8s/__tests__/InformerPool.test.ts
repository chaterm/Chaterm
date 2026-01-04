/**
 * Unit tests for InformerPool
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InformerPool } from '../InformerPool'
import { KubeConfigLoader } from '../KubeConfigLoader'

describe('InformerPool', () => {
  let informerPool: InformerPool
  let configLoader: KubeConfigLoader

  beforeEach(async () => {
    configLoader = new KubeConfigLoader()
    informerPool = new InformerPool(configLoader)
  })

  afterEach(async () => {
    if (informerPool) {
      await informerPool.stopAll()
    }
  })

  describe('initialization', () => {
    it('should create InformerPool instance', () => {
      expect(informerPool).toBeDefined()
      expect(informerPool).toBeInstanceOf(InformerPool)
    })

    it('should start with no informers', () => {
      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(0)
      expect(stats.runningInformers).toBe(0)
    })
  })

  describe('getStatistics', () => {
    it('should return correct initial statistics', () => {
      const stats = informerPool.getStatistics()
      expect(stats).toEqual({
        totalInformers: 0,
        runningInformers: 0,
        totalResources: 0,
        errorCount: 0
      })
    })
  })

  describe('getResources', () => {
    it('should return empty array when no resources cached', () => {
      const resources = informerPool.getResources('test-context', 'Pod')
      expect(resources).toEqual([])
    })
  })

  describe('isInformerRunning', () => {
    it('should return false when informer is not running', () => {
      const isRunning = informerPool.isInformerRunning('test-context', 'Pod')
      expect(isRunning).toBe(false)
    })
  })

  describe('getAllStates', () => {
    it('should return empty map initially', () => {
      const states = informerPool.getAllStates()
      expect(states.size).toBe(0)
    })
  })

  describe('getAllResources', () => {
    it('should return empty map initially', () => {
      const allResources = informerPool.getAllResources()
      expect(allResources.size).toBe(0)
    })
  })

  describe('getResource', () => {
    it('should return undefined for non-existent resource', () => {
      const resource = informerPool.getResource('test-context', 'Pod', 'non-existent-uid')
      expect(resource).toBeUndefined()
    })
  })

  describe('getInformerState', () => {
    it('should return undefined for non-existent informer', () => {
      const state = informerPool.getInformerState('test-context', 'Pod')
      expect(state).toBeUndefined()
    })
  })

  describe('stopInformer', () => {
    it('should handle stopping non-existent informer gracefully', async () => {
      await expect(informerPool.stopInformer('non-existent', 'Pod')).resolves.not.toThrow()
    })
  })

  describe('stopContextInformers', () => {
    it('should handle stopping non-existent context informers gracefully', async () => {
      await expect(informerPool.stopContextInformers('non-existent')).resolves.not.toThrow()
    })
  })

  describe('stopAll', () => {
    it('should stop all informers successfully', async () => {
      await expect(informerPool.stopAll()).resolves.not.toThrow()
      const stats = informerPool.getStatistics()
      expect(stats.totalInformers).toBe(0)
    })
  })
})
