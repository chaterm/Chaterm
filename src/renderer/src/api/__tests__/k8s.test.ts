import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as k8sApi from '../k8s'

// Mock window.api
const mockK8sGetContexts = vi.fn()
const mockK8sGetContextDetail = vi.fn()
const mockK8sSwitchContext = vi.fn()
const mockK8sReloadConfig = vi.fn()
const mockK8sValidateContext = vi.fn()
const mockK8sInitialize = vi.fn()

;(global as any).window = {
  api: {
    k8sGetContexts: mockK8sGetContexts,
    k8sGetContextDetail: mockK8sGetContextDetail,
    k8sSwitchContext: mockK8sSwitchContext,
    k8sReloadConfig: mockK8sReloadConfig,
    k8sValidateContext: mockK8sValidateContext,
    k8sInitialize: mockK8sInitialize
  }
}

describe('K8s API', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock responses
    mockK8sGetContexts.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'context1',
          cluster: 'cluster1',
          namespace: 'default',
          server: 'https://cluster1.example.com',
          isActive: true
        }
      ],
      currentContext: 'context1'
    })

    mockK8sGetContextDetail.mockResolvedValue({
      success: true,
      data: {
        name: 'context1',
        cluster: 'cluster1',
        user: 'user1'
      }
    })

    mockK8sSwitchContext.mockResolvedValue({
      success: true,
      currentContext: 'context2'
    })

    mockK8sReloadConfig.mockResolvedValue({
      success: true,
      data: [],
      currentContext: 'context1'
    })

    mockK8sValidateContext.mockResolvedValue({
      success: true,
      isValid: true
    })

    mockK8sInitialize.mockResolvedValue({
      success: true,
      data: [],
      currentContext: 'context1'
    })
  })

  describe('getContexts', () => {
    it('should call IPC and return contexts', async () => {
      const result = await k8sApi.getContexts()

      expect(mockK8sGetContexts).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].name).toBe('context1')
    })

    it('should handle IPC errors', async () => {
      mockK8sGetContexts.mockRejectedValue(new Error('IPC Error'))

      const result = await k8sApi.getContexts()

      expect(result.success).toBe(false)
      expect(result.error).toBe('IPC Error')
    })

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockK8sGetContexts.mockRejectedValue(new Error('Test error'))

      await k8sApi.getContexts()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s API] Failed to get contexts'), expect.any(Error))

      consoleSpy.mockRestore()
    })

    it('should handle unknown errors', async () => {
      mockK8sGetContexts.mockRejectedValue('String error')

      const result = await k8sApi.getContexts()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })
  })

  describe('getContextDetail', () => {
    it('should call IPC with context name', async () => {
      const contextName = 'context1'

      const result = await k8sApi.getContextDetail(contextName)

      expect(mockK8sGetContextDetail).toHaveBeenCalledWith(contextName)
      expect(result.success).toBe(true)
      expect(result.data?.name).toBe('context1')
    })

    it('should handle IPC errors', async () => {
      mockK8sGetContextDetail.mockRejectedValue(new Error('Not found'))

      const result = await k8sApi.getContextDetail('invalid')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not found')
    })

    it('should handle empty context name', async () => {
      await k8sApi.getContextDetail('')

      expect(mockK8sGetContextDetail).toHaveBeenCalledWith('')
    })
  })

  describe('switchContext', () => {
    it('should call IPC with context name', async () => {
      const contextName = 'context2'

      const result = await k8sApi.switchContext(contextName)

      expect(mockK8sSwitchContext).toHaveBeenCalledWith(contextName)
      expect(result.success).toBe(true)
      expect(result.currentContext).toBe('context2')
    })

    it('should handle switch failures', async () => {
      mockK8sSwitchContext.mockRejectedValue(new Error('Switch failed'))

      const result = await k8sApi.switchContext('invalid')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Switch failed')
    })

    it('should log errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockK8sSwitchContext.mockRejectedValue(new Error('Test error'))

      await k8sApi.switchContext('context2')

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s API] Failed to switch context'), expect.any(Error))

      consoleSpy.mockRestore()
    })
  })

  describe('reloadConfig', () => {
    it('should call IPC and return reloaded contexts', async () => {
      const result = await k8sApi.reloadConfig()

      expect(mockK8sReloadConfig).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should handle reload errors', async () => {
      mockK8sReloadConfig.mockRejectedValue(new Error('Reload failed'))

      const result = await k8sApi.reloadConfig()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Reload failed')
    })

    it('should return contexts in data field', async () => {
      mockK8sReloadConfig.mockResolvedValue({
        success: true,
        data: [
          {
            name: 'new-context',
            cluster: 'new-cluster',
            namespace: 'default',
            server: 'https://new.example.com',
            isActive: true
          }
        ],
        currentContext: 'new-context'
      })

      const result = await k8sApi.reloadConfig()

      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].name).toBe('new-context')
    })
  })

  describe('validateContext', () => {
    it('should call IPC with context name', async () => {
      const contextName = 'context1'

      const result = await k8sApi.validateContext(contextName)

      expect(mockK8sValidateContext).toHaveBeenCalledWith(contextName)
      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('should return false for invalid context', async () => {
      mockK8sValidateContext.mockResolvedValue({
        success: true,
        isValid: false
      })

      const result = await k8sApi.validateContext('invalid')

      expect(result.data).toBe(false)
    })

    it('should handle validation errors', async () => {
      mockK8sValidateContext.mockRejectedValue(new Error('Validation failed'))

      const result = await k8sApi.validateContext('context1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Validation failed')
    })

    it('should map isValid to data field', async () => {
      mockK8sValidateContext.mockResolvedValue({
        success: true,
        isValid: true
      })

      const result = await k8sApi.validateContext('context1')

      expect(result.data).toBe(true)
    })
  })

  describe('initialize', () => {
    it('should call IPC and return initialization result', async () => {
      const result = await k8sApi.initialize()

      expect(mockK8sInitialize).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should return contexts on successful initialization', async () => {
      mockK8sInitialize.mockResolvedValue({
        success: true,
        data: [
          {
            name: 'context1',
            cluster: 'cluster1',
            namespace: 'default',
            server: 'https://example.com',
            isActive: true
          }
        ],
        currentContext: 'context1'
      })

      const result = await k8sApi.initialize()

      expect(result.data).toHaveLength(1)
      expect(result.currentContext).toBe('context1')
    })

    it('should handle initialization errors', async () => {
      mockK8sInitialize.mockRejectedValue(new Error('Init failed'))

      const result = await k8sApi.initialize()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Init failed')
    })

    it('should log errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockK8sInitialize.mockRejectedValue(new Error('Test error'))

      await k8sApi.initialize()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s API] Failed to initialize'), expect.any(Error))

      consoleSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('should handle null/undefined errors', async () => {
      mockK8sGetContexts.mockRejectedValue(null)

      const result = await k8sApi.getContexts()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })

    it('should handle non-Error objects', async () => {
      mockK8sGetContexts.mockRejectedValue({ message: 'Custom error' })

      const result = await k8sApi.getContexts()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })

    it('should preserve error messages from Error objects', async () => {
      mockK8sGetContexts.mockRejectedValue(new Error('Specific error message'))

      const result = await k8sApi.getContexts()

      expect(result.error).toBe('Specific error message')
    })
  })

  describe('type safety', () => {
    it('should return properly typed responses', async () => {
      const result = await k8sApi.getContexts()

      if (result.success && result.data) {
        // TypeScript should recognize these properties
        expect(result.data[0].name).toBeDefined()
        expect(result.data[0].cluster).toBeDefined()
        expect(result.data[0].namespace).toBeDefined()
        expect(result.data[0].server).toBeDefined()
        expect(result.data[0].isActive).toBeDefined()
      }
    })

    it('should handle optional fields correctly', async () => {
      const result = await k8sApi.getContexts()

      // These fields should be optional
      expect(result.currentContext).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('integration scenarios', () => {
    it('should handle rapid successive calls', async () => {
      const promises = Array.from({ length: 10 }, () => k8sApi.getContexts())

      const results = await Promise.all(promises)

      results.forEach((result) => {
        expect(result.success).toBe(true)
      })

      expect(mockK8sGetContexts).toHaveBeenCalledTimes(10)
    })

    it('should handle mixed success and failure', async () => {
      mockK8sGetContexts
        .mockResolvedValueOnce({ success: true, data: [] })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ success: true, data: [] })

      const results = await Promise.all([k8sApi.getContexts(), k8sApi.getContexts(), k8sApi.getContexts()])

      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[2].success).toBe(true)
    })
  })
})
