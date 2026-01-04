import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ipcMain } from 'electron'
import { registerK8sHandlers } from '../k8sHandle'
import { K8sManager } from '../../services/k8s/K8sManager'

// Mock Electron IPC
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

// Mock K8sManager
vi.mock('../../services/k8s/K8sManager')

describe('K8s IPC Handlers', () => {
  let mockK8sManager: any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()

    // Create handlers storage
    handlers = new Map()

    // Mock ipcMain.handle to store handlers
    ;(ipcMain.handle as any).mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    // Create mock K8sManager
    mockK8sManager = {
      getContexts: vi.fn(),
      getContextDetail: vi.fn(),
      switchContext: vi.fn(),
      reload: vi.fn(),
      validateContext: vi.fn(),
      initialize: vi.fn(),
      startWatching: vi.fn(),
      stopWatching: vi.fn(),
      getDeltaPusher: vi.fn(),
      getCurrentContext: vi.fn()
    }

    // Mock getDeltaPusher to return mock pusher
    mockK8sManager.getDeltaPusher.mockReturnValue({
      removeCalculator: vi.fn()
    })

    // Mock K8sManager.getInstance
    ;(K8sManager.getInstance as any) = vi.fn().mockReturnValue(mockK8sManager)

    // Register handlers
    registerK8sHandlers()
  })

  afterEach(() => {
    handlers.clear()
  })

  describe('k8s:get-contexts', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:get-contexts')).toBe(true)
    })

    it('should return contexts on success', async () => {
      const mockContexts = [
        {
          name: 'context1',
          cluster: 'cluster1',
          namespace: 'default',
          server: 'https://cluster1.example.com',
          isActive: true
        }
      ]

      mockK8sManager.getContexts.mockResolvedValue(mockContexts)
      mockK8sManager.getCurrentContext.mockReturnValue('context1')

      const handler = handlers.get('k8s:get-contexts')!
      const result = await handler()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockContexts)
      expect(result.currentContext).toBe('context1')
    })

    it('should handle errors', async () => {
      mockK8sManager.getContexts.mockRejectedValue(new Error('Failed to load contexts'))

      const handler = handlers.get('k8s:get-contexts')!
      const result = await handler()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to load contexts')
    })
  })

  describe('k8s:get-context-detail', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:get-context-detail')).toBe(true)
    })

    it('should return context detail', async () => {
      const mockDetail = {
        name: 'context1',
        cluster: 'cluster1',
        user: 'user1',
        namespace: 'default'
      }

      mockK8sManager.getContextDetail.mockReturnValue(mockDetail)

      const handler = handlers.get('k8s:get-context-detail')!
      const result = await handler({}, 'context1')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockDetail)
    })

    it('should handle errors', async () => {
      mockK8sManager.getContextDetail.mockImplementation(() => {
        throw new Error('Context not found')
      })

      const handler = handlers.get('k8s:get-context-detail')!
      const result = await handler({}, 'invalid')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Context not found')
    })
  })

  describe('k8s:switch-context', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:switch-context')).toBe(true)
    })

    it('should switch context successfully', async () => {
      mockK8sManager.switchContext.mockResolvedValue(true)
      mockK8sManager.getCurrentContext.mockReturnValue('context2')

      const handler = handlers.get('k8s:switch-context')!
      const result = await handler({}, 'context2')

      expect(result.success).toBe(true)
      expect(result.currentContext).toBe('context2')
      expect(mockK8sManager.switchContext).toHaveBeenCalledWith('context2')
    })

    it('should handle switch failure', async () => {
      mockK8sManager.switchContext.mockResolvedValue(false)

      const handler = handlers.get('k8s:switch-context')!
      const result = await handler({}, 'invalid')

      expect(result.success).toBe(false)
    })

    it('should handle errors', async () => {
      mockK8sManager.switchContext.mockRejectedValue(new Error('Switch failed'))

      const handler = handlers.get('k8s:switch-context')!
      const result = await handler({}, 'context2')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Switch failed')
    })
  })

  describe('k8s:reload-config', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:reload-config')).toBe(true)
    })

    it('should reload configuration successfully', async () => {
      const mockResult = {
        success: true,
        contexts: [
          {
            name: 'context1',
            cluster: 'cluster1',
            namespace: 'default',
            server: 'https://cluster1.example.com',
            isActive: true
          }
        ],
        currentContext: 'context1'
      }

      mockK8sManager.reload.mockResolvedValue(mockResult)

      const handler = handlers.get('k8s:reload-config')!
      const result = await handler()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockResult.contexts)
      expect(result.currentContext).toBe('context1')
    })

    it('should handle reload errors', async () => {
      mockK8sManager.reload.mockRejectedValue(new Error('Reload failed'))

      const handler = handlers.get('k8s:reload-config')!
      const result = await handler()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Reload failed')
    })
  })

  describe('k8s:validate-context', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:validate-context')).toBe(true)
    })

    it('should validate context successfully', async () => {
      mockK8sManager.validateContext.mockResolvedValue(true)

      const handler = handlers.get('k8s:validate-context')!
      const result = await handler({}, 'context1')

      expect(result.success).toBe(true)
      expect(result.isValid).toBe(true)
      expect(mockK8sManager.validateContext).toHaveBeenCalledWith('context1')
    })

    it('should return invalid for bad context', async () => {
      mockK8sManager.validateContext.mockResolvedValue(false)

      const handler = handlers.get('k8s:validate-context')!
      const result = await handler({}, 'invalid')

      expect(result.success).toBe(true)
      expect(result.isValid).toBe(false)
    })

    it('should handle validation errors', async () => {
      mockK8sManager.validateContext.mockRejectedValue(new Error('Validation failed'))

      const handler = handlers.get('k8s:validate-context')!
      const result = await handler({}, 'context1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Validation failed')
    })
  })

  describe('k8s:initialize', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:initialize')).toBe(true)
    })

    it('should initialize successfully', async () => {
      const mockResult = {
        success: true,
        contexts: [
          {
            name: 'context1',
            cluster: 'cluster1',
            namespace: 'default',
            server: 'https://cluster1.example.com',
            isActive: true
          }
        ],
        currentContext: 'context1'
      }

      mockK8sManager.initialize.mockResolvedValue(mockResult)

      const handler = handlers.get('k8s:initialize')!
      const result = await handler()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockResult.contexts)
      expect(result.currentContext).toBe('context1')
    })

    it('should handle initialization errors', async () => {
      mockK8sManager.initialize.mockRejectedValue(new Error('Init failed'))

      const handler = handlers.get('k8s:initialize')!
      const result = await handler()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Init failed')
    })
  })

  describe('k8s:start-watch', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:start-watch')).toBe(true)
    })

    it('should start watching Pods', async () => {
      mockK8sManager.startWatching.mockResolvedValue(undefined)

      const handler = handlers.get('k8s:start-watch')!
      const result = await handler({}, 'test-context', 'Pod', {})

      expect(result.success).toBe(true)
      expect(mockK8sManager.startWatching).toHaveBeenCalledWith('test-context', ['Pod'], {})
    })

    it('should start watching Nodes', async () => {
      mockK8sManager.startWatching.mockResolvedValue(undefined)

      const handler = handlers.get('k8s:start-watch')!
      const result = await handler({}, 'test-context', 'Node', {})

      expect(result.success).toBe(true)
      expect(mockK8sManager.startWatching).toHaveBeenCalledWith('test-context', ['Node'], {})
    })

    it('should reject unsupported resource types', async () => {
      const handler = handlers.get('k8s:start-watch')!
      const result = await handler({}, 'test-context', 'Deployment', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported resource type')
    })

    it('should handle watch start errors', async () => {
      mockK8sManager.startWatching.mockRejectedValue(new Error('Failed to connect'))

      const handler = handlers.get('k8s:start-watch')!
      const result = await handler({}, 'test-context', 'Pod', {})

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to connect')
    })

    it('should pass options to startWatching', async () => {
      const options = { namespace: 'production', labelSelector: 'app=nginx' }
      mockK8sManager.startWatching.mockResolvedValue(undefined)

      const handler = handlers.get('k8s:start-watch')!
      await handler({}, 'test-context', 'Pod', options)

      expect(mockK8sManager.startWatching).toHaveBeenCalledWith('test-context', ['Pod'], options)
    })
  })

  describe('k8s:stop-watch', () => {
    it('should register handler', () => {
      expect(handlers.has('k8s:stop-watch')).toBe(true)
    })

    it('should stop watching and remove calculator', async () => {
      mockK8sManager.stopWatching.mockResolvedValue(undefined)

      const mockPusher = mockK8sManager.getDeltaPusher()
      const handler = handlers.get('k8s:stop-watch')!
      const result = await handler({}, 'test-context', 'Pod')

      expect(result.success).toBe(true)
      expect(mockK8sManager.stopWatching).toHaveBeenCalledWith('test-context')
      expect(mockPusher.removeCalculator).toHaveBeenCalledWith('test-context', 'Pod')
    })

    it('should handle stop watch errors', async () => {
      mockK8sManager.stopWatching.mockRejectedValue(new Error('Stop failed'))

      const handler = handlers.get('k8s:stop-watch')!
      const result = await handler({}, 'test-context', 'Pod')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Stop failed')
    })
  })

  describe('handler registration', () => {
    it('should register all required handlers', () => {
      const requiredHandlers = [
        'k8s:get-contexts',
        'k8s:get-context-detail',
        'k8s:switch-context',
        'k8s:reload-config',
        'k8s:validate-context',
        'k8s:initialize',
        'k8s:start-watch',
        'k8s:stop-watch'
      ]

      requiredHandlers.forEach((channel) => {
        expect(handlers.has(channel)).toBe(true)
      })
    })

    it('should log registration completion', () => {
      const consoleSpy = vi.spyOn(console, 'log')

      // Re-register to capture log
      handlers.clear()
      registerK8sHandlers()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[K8s IPC] All K8s IPC handlers registered'))

      consoleSpy.mockRestore()
    })
  })
})
