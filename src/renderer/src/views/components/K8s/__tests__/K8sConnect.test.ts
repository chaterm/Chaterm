/**
 * K8s Connect Component Unit Tests
 *
 * Tests for the K8sConnect.vue component including:
 * - Component mounting and rendering
 * - Terminal initialization and cluster connection
 * - Error handling for missing cluster data
 * - Terminal create success/failure
 * - Cleanup on unmount
 * - Exposed methods (handleResize, focus, getTerminalBufferContent)
 * - Theme and transparent background classes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// Must be hoisted before vi.mock
const mockK8sTerminalCreate = vi.fn()
const mockK8sTerminalClose = vi.fn()
const mockK8sOnTerminalData = vi.fn((_id: string, _cb: (data: string) => void) => () => {})
const mockK8sOnTerminalExit = vi.fn((_id: string, _cb: () => void) => () => {})

const mockTerminalInstance = {
  open: vi.fn(),
  loadAddon: vi.fn(),
  writeln: vi.fn(),
  write: vi.fn(),
  onData: vi.fn(),
  focus: vi.fn(),
  dispose: vi.fn(),
  cols: 80,
  rows: 24,
  buffer: {
    active: {
      length: 2,
      getLine: vi.fn((i: number) => (i === 0 ? { translateToString: () => 'line1' } : { translateToString: () => 'line2' }))
    }
  },
  options: { theme: {} }
}

const mockFitAddonInstance = {
  fit: vi.fn()
}

// Mock @xterm/xterm - use function for constructor
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function Terminal() {
    return mockTerminalInstance
  })
}))

// Mock @xterm/addon-fit
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function FitAddon() {
    return mockFitAddonInstance
  })
}))

// Mock window.api - will be set in beforeEach
const mockWindowApi = {
  k8sTerminalCreate: mockK8sTerminalCreate,
  k8sTerminalClose: mockK8sTerminalClose,
  k8sOnTerminalData: mockK8sOnTerminalData,
  k8sOnTerminalExit: mockK8sOnTerminalExit,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}

// Mock createRendererLogger (auto-imported)
Object.defineProperty(globalThis, 'createRendererLogger', {
  value: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })),
  writable: true
})

// Mock @/api/k8s
vi.mock('@/api/k8s', () => ({
  writeToTerminal: vi.fn().mockResolvedValue({ success: true }),
  onTerminalData: (id: string, cb: (data: string) => void) => mockK8sOnTerminalData(id, cb),
  onTerminalExit: (id: string, cb: () => void) => mockK8sOnTerminalExit(id, cb),
  resizeTerminal: vi.fn().mockResolvedValue({ success: true })
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-123')
}))

// Mock userConfigStore
vi.mock('@/store/userConfigStore', () => {
  return {
    userConfigStore: () => ({
      getUserConfig: {
        background: { image: null },
        theme: 'dark',
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        scrollBack: 5000,
        cursorStyle: 'block'
      }
    })
  }
})

// Mock userConfigStoreService
vi.mock('@/services/userConfigStoreService', () => {
  return {
    userConfigStore: {
      getConfig: vi.fn().mockResolvedValue({
        background: { image: null },
        theme: 'dark',
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        scrollBack: 5000
      })
    }
  }
})

// Mock themeUtils
vi.mock('@/utils/themeUtils', () => ({
  getActualTheme: vi.fn((theme: unknown) => (theme as string) || 'dark')
}))

// Mock eventBus - must invoke handlers on emit for updateTheme test
const mockEventBus = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: any[]) => void>>()
  return {
    on: vi.fn((event: string, fn: (...args: any[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
    }),
    off: vi.fn((event: string, fn: (...args: any[]) => void) => {
      handlers.get(event)?.delete(fn)
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      handlers.get(event)?.forEach((handler) => handler(...args))
    })
  }
})
vi.mock('@/utils/eventBus', () => ({ default: mockEventBus }))

// Import component after mocks
import K8sConnect from '../K8sConnect.vue'
import * as k8sApi from '@/api/k8s'
import { getActualTheme } from '@/utils/themeUtils'

const validCluster = {
  id: 'cluster-1',
  name: 'Test Cluster',
  default_namespace: 'default'
}

const createServerInfo = (cluster?: any) => ({
  id: 'tab-1',
  title: 'K8s Terminal',
  content: '',
  type: 'k8s',
  data: cluster ? { data: cluster } : undefined
})

describe('K8s Connect Component', () => {
  let wrapper: VueWrapper<any>

  const createWrapper = (
    props: {
      serverInfo?: any
      isActive?: boolean
    } = {}
  ) => {
    return mount(K8sConnect, {
      props: {
        serverInfo: props.serverInfo ?? createServerInfo(validCluster),
        isActive: props.isActive ?? false
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getActualTheme).mockImplementation((t: unknown) => (t as string) || 'dark')
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as any).api = mockWindowApi
    ;(global.window as any).addEventListener = vi.fn()
    ;(global.window as any).removeEventListener = vi.fn()
    mockK8sTerminalCreate.mockResolvedValue({ success: true })
    mockK8sOnTerminalData.mockReturnValue(() => {})
    mockK8sOnTerminalExit.mockReturnValue(() => {})
    ;(mockTerminalInstance.buffer.active.getLine as ReturnType<typeof vi.fn>).mockImplementation((i: number) => ({
      translateToString: () => `line${i + 1}`
    }))
    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(function (this: any, _callback: any) {
      this.observe = vi.fn()
      this.disconnect = vi.fn()
      this.unobserve = vi.fn()
      return this
    }) as any
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await flushPromises()
      expect(wrapper.exists()).toBe(true)
    })

    it('should render k8s-terminal-container and terminal-element', async () => {
      wrapper = createWrapper()
      await flushPromises()
      expect(wrapper.find('.k8s-terminal-container').exists()).toBe(true)
      expect(wrapper.find('.terminal-element').exists()).toBe(true)
    })
  })

  describe('Cluster Connection', () => {
    it('should call k8sTerminalCreate when mounted with valid cluster', async () => {
      wrapper = createWrapper()
      await flushPromises()
      expect(mockK8sTerminalCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterId: 'cluster-1',
          namespace: 'default',
          cols: 80,
          rows: 24
        })
      )
    })

    it('should use cluster from serverInfo.data when serverInfo.data.data is not present', async () => {
      wrapper = mount(K8sConnect, {
        props: {
          serverInfo: {
            id: 'tab-1',
            title: 'K8s',
            content: '',
            data: validCluster
          },
          isActive: false
        }
      })
      await flushPromises()
      expect(mockK8sTerminalCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterId: 'cluster-1',
          namespace: 'default'
        })
      )
    })

    it('should show error when no cluster data provided', async () => {
      wrapper = createWrapper({ serverInfo: createServerInfo() })
      await flushPromises()
      expect(mockTerminalInstance.writeln).toHaveBeenCalledWith('Error: No cluster data provided')
      expect(mockK8sTerminalCreate).not.toHaveBeenCalled()
    })

    it('should show error when cluster has no id', async () => {
      wrapper = createWrapper({
        serverInfo: {
          id: 'tab-1',
          title: 'K8s',
          content: '',
          data: { data: { name: 'NoId', default_namespace: 'default' } }
        }
      })
      await flushPromises()
      expect(mockTerminalInstance.writeln).toHaveBeenCalledWith('Error: No cluster data provided')
      expect(mockK8sTerminalCreate).not.toHaveBeenCalled()
    })

    it('should show error when terminal create fails', async () => {
      mockK8sTerminalCreate.mockResolvedValue({ success: false, error: 'Connection refused' })
      wrapper = createWrapper()
      await flushPromises()
      expect(mockTerminalInstance.writeln).toHaveBeenCalledWith('Error: Connection refused')
    })

    it('should setup onTerminalData and onTerminalExit on successful connection', async () => {
      wrapper = createWrapper()
      await flushPromises()
      expect(mockK8sOnTerminalData).toHaveBeenCalled()
      expect(mockK8sOnTerminalExit).toHaveBeenCalled()
    })
  })

  describe('Theme and Styling', () => {
    it('should update terminal theme when updateTheme event is emitted', async () => {
      const mockGetActualTheme = vi.mocked(getActualTheme)
      mockGetActualTheme.mockImplementation((t: unknown) => (t as string) || 'dark')
      wrapper = createWrapper()
      await flushPromises()
      mockGetActualTheme.mockClear()
      mockEventBus.emit('updateTheme', 'light')
      await nextTick()
      expect(mockGetActualTheme).toHaveBeenCalledWith('light')
      expect(mockTerminalInstance.options.theme).toBeDefined()
    })
    it('should not have transparent-bg when no background image', async () => {
      wrapper = createWrapper()
      await flushPromises()
      expect(wrapper.find('.k8s-terminal-container').classes()).not.toContain('transparent-bg')
    })

    it('should not have theme-light when theme is dark', async () => {
      wrapper = createWrapper()
      await flushPromises()
      expect(wrapper.find('.k8s-terminal-container').classes()).not.toContain('theme-light')
    })
  })

  describe('Exposed Methods', () => {
    it('should expose handleResize and call fit when invoked', async () => {
      wrapper = createWrapper()
      await flushPromises()
      wrapper.vm.handleResize()
      await nextTick()
      expect(mockFitAddonInstance.fit).toHaveBeenCalled()
    })

    it('should call resizeTerminal when handleResize with connected terminal and valid dimensions', async () => {
      wrapper = createWrapper()
      await flushPromises()
      const terminalEl = wrapper.find('.terminal-element').element
      vi.spyOn(terminalEl, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 50,
        top: 0,
        left: 0,
        right: 100,
        bottom: 50,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
      wrapper.vm.handleResize()
      await new Promise((r) => setTimeout(r, 150))
      expect(k8sApi.resizeTerminal).toHaveBeenCalledWith('mock-uuid-123', 80, 24)
    })

    it('should expose focus and focus terminal when invoked', async () => {
      wrapper = createWrapper()
      await flushPromises()
      wrapper.vm.focus()
      expect(mockTerminalInstance.focus).toHaveBeenCalled()
    })

    it('should expose getTerminalBufferContent and return buffer content', async () => {
      wrapper = createWrapper()
      await flushPromises()
      const content = wrapper.vm.getTerminalBufferContent()
      expect(content).toBe('line1\nline2')
    })

    it('should return buffer content with multiple lines', async () => {
      ;(mockTerminalInstance.buffer.active.getLine as ReturnType<typeof vi.fn>).mockImplementation((i: number) => ({
        translateToString: () => (i === 0 ? 'prompt$' : 'output')
      }))
      Object.defineProperty(mockTerminalInstance.buffer.active, 'length', { value: 2 })
      wrapper = createWrapper()
      await flushPromises()
      const content = wrapper.vm.getTerminalBufferContent()
      expect(content).toContain('prompt$')
    })
  })

  describe('Cleanup on Unmount', () => {
    it('should call k8sTerminalClose when unmounting with connected terminal', async () => {
      wrapper = createWrapper()
      await flushPromises()
      wrapper.unmount()
      await nextTick()
      expect(mockK8sTerminalClose).toHaveBeenCalledWith('mock-uuid-123')
    })

    it('should dispose terminal on unmount', async () => {
      wrapper = createWrapper()
      await flushPromises()
      wrapper.unmount()
      await nextTick()
      expect(mockTerminalInstance.dispose).toHaveBeenCalled()
    })

    it('should unregister eventBus updateTheme listener on unmount', async () => {
      const offHandler = vi.fn()
      mockEventBus.on.mockImplementation((_event: string, handler: () => void) => {
        offHandler.mockImplementation(() => mockEventBus.off('updateTheme', handler))
        return offHandler
      })
      wrapper = createWrapper()
      await flushPromises()
      wrapper.unmount()
      await nextTick()
      expect(mockEventBus.off).toHaveBeenCalledWith('updateTheme', expect.any(Function))
    })
  })

  describe('isActive Watch', () => {
    it('should call focus when isActive becomes true', async () => {
      wrapper = createWrapper({ isActive: false })
      await flushPromises()
      mockTerminalInstance.focus.mockClear()
      await wrapper.setProps({ isActive: true })
      await nextTick()
      expect(mockTerminalInstance.focus).toHaveBeenCalled()
    })
  })
})
