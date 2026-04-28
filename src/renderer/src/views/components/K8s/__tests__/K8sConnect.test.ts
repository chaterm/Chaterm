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
 * - AI command mode: executeTerminalCommand event handling
 * - AI command mode: output collection and sendMessageToAi emission
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
  getActualTheme: vi.fn((theme: unknown) => (theme as string) || 'dark'),
  getSystemTheme: vi.fn(() => 'dark')
}))

// Mock terminalPrompt utilities used by handleCommandOutput
vi.mock('@views/components/Ssh/utils/terminalPrompt', () => ({
  getLastNonEmptyLine: vi.fn((text: string) => {
    const lines = text.split('\n').filter((l) => l.trim())
    return lines[lines.length - 1] || ''
  }),
  isTerminalPromptLine: vi.fn((line: string) => /[$#>]\s*$/.test(line.trim()))
}))

// Mock ansiUtils used by handleCommandOutput
vi.mock('@views/components/Ssh/utils/ansiUtils', () => ({
  stripAnsiBasic: vi.fn((text: string) => text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''))
}))

// Mock eventBus - handlers map is kept outside so clearAllMocks doesn't break routing
const eventBusHandlers = new Map<string, Set<(...args: any[]) => void>>()

const mockEventBus = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn()
}))
vi.mock('@/utils/eventBus', () => ({ default: mockEventBus }))

// Rebind eventBus implementations after each clearAllMocks call
function rebindEventBus() {
  eventBusHandlers.clear()
  mockEventBus.on.mockImplementation((event: string, fn: (...args: any[]) => void) => {
    if (!eventBusHandlers.has(event)) eventBusHandlers.set(event, new Set())
    eventBusHandlers.get(event)!.add(fn)
  })
  mockEventBus.off.mockImplementation((event: string, fn: (...args: any[]) => void) => {
    eventBusHandlers.get(event)?.delete(fn)
  })
  mockEventBus.emit.mockImplementation((event: string, ...args: any[]) => {
    eventBusHandlers.get(event)?.forEach((handler) => handler(...args))
  })
}

// Import component after mocks
import K8sConnect from '../K8sConnect.vue'
import * as k8sApi from '@/api/k8s'
import { getActualTheme } from '@/utils/themeUtils'
import { getLastNonEmptyLine, isTerminalPromptLine } from '@views/components/Ssh/utils/terminalPrompt'
import { stripAnsiBasic } from '@views/components/Ssh/utils/ansiUtils'

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
      activeTabId?: string
    } = {}
  ) => {
    return mount(K8sConnect, {
      props: {
        serverInfo: props.serverInfo ?? createServerInfo(validCluster),
        isActive: props.isActive ?? false,
        ...(props.activeTabId !== undefined ? { activeTabId: props.activeTabId } : {})
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Rebind eventBus after clearAllMocks wipes implementations
    rebindEventBus()
    vi.mocked(getActualTheme).mockImplementation((t: unknown) => (t as string) || 'dark')
    // Restore terminalPrompt mocks
    vi.mocked(getLastNonEmptyLine).mockImplementation((text: string) => {
      const lines = text.split('\n').filter((l) => l.trim())
      return lines[lines.length - 1] || ''
    })
    vi.mocked(isTerminalPromptLine).mockImplementation(() => false)
    // Restore ansiUtils mock
    vi.mocked(stripAnsiBasic).mockImplementation((text: string) => text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''))
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as any).api = mockWindowApi
    ;(global.window as any).addEventListener = vi.fn()
    ;(global.window as any).removeEventListener = vi.fn()
    mockK8sTerminalCreate.mockResolvedValue({ success: true })
    mockK8sOnTerminalData.mockReturnValue(() => {})
    mockK8sOnTerminalExit.mockReturnValue(() => {})
    // Restore writeToTerminal mock after clearAllMocks
    vi.mocked(k8sApi.writeToTerminal).mockResolvedValue(undefined as any)
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

  describe('AI Command Mode - executeTerminalCommand', () => {
    // Helper: capture the onTerminalData callback registered during connectToCluster
    const getDataCallback = (): ((data: string) => void) => {
      const call = mockK8sOnTerminalData.mock.calls[0]
      return call ? call[1] : () => {}
    }

    it('should register executeTerminalCommand listener on mount', async () => {
      wrapper = createWrapper({ isActive: true })
      await flushPromises()
      const registeredEvents = mockEventBus.on.mock.calls.map((c) => c[0])
      expect(registeredEvents).toContain('executeTerminalCommand')
    })

    it('should write command to terminal when executeTerminalCommand is emitted and component is active', async () => {
      wrapper = createWrapper({ isActive: true })
      await flushPromises()
      mockEventBus.emit('executeTerminalCommand', { command: 'kubectl get pods\n', tabId: 'tab-1' })
      await nextTick()
      expect(k8sApi.writeToTerminal).toHaveBeenCalledWith('mock-uuid-123', 'kubectl get pods\n')
    })

    it('should not write command when component is not active', async () => {
      wrapper = createWrapper({ isActive: false })
      await flushPromises()
      vi.mocked(k8sApi.writeToTerminal).mockClear()
      mockEventBus.emit('executeTerminalCommand', { command: 'kubectl get pods\n', tabId: 'tab-1' })
      await nextTick()
      expect(k8sApi.writeToTerminal).not.toHaveBeenCalled()
    })

    it('should not write command when payload has no command', async () => {
      wrapper = createWrapper({ isActive: true })
      await flushPromises()
      vi.mocked(k8sApi.writeToTerminal).mockClear()
      mockEventBus.emit('executeTerminalCommand', { command: '', tabId: 'tab-1' })
      await nextTick()
      expect(k8sApi.writeToTerminal).not.toHaveBeenCalled()
    })

    it('should emit sendMessageToAi with output when prompt is detected', async () => {
      // Make isTerminalPromptLine return true for lines ending with $
      vi.mocked(isTerminalPromptLine).mockImplementation((line: string) => line.trim().endsWith('$'))

      wrapper = createWrapper({ isActive: true })
      await flushPromises()

      const dataCallback = getDataCallback()

      // Trigger command
      mockEventBus.emit('executeTerminalCommand', { command: 'kubectl get pods\n', tabId: 'tab-42' })
      await nextTick()

      // Simulate PTY output: command echo + real output + prompt
      dataCallback('kubectl get pods\n')
      dataCallback('NAME   READY   STATUS\n')
      dataCallback('pod-1  1/1     Running\n')
      dataCallback('$ ')

      // Wait for the debounce timer (150ms)
      await new Promise((r) => setTimeout(r, 300))

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'sendMessageToAi',
        expect.objectContaining({
          tabId: 'tab-42',
          content: expect.stringContaining('Terminal output:'),
          toolResult: expect.objectContaining({
            output: expect.stringContaining('NAME'),
            toolName: 'execute_command'
          })
        })
      )
    })

    it('should strip command echo (including PTY double-echo) from output', async () => {
      vi.mocked(isTerminalPromptLine).mockImplementation((line: string) => line.trim().endsWith('$'))

      wrapper = createWrapper({ isActive: true })
      await flushPromises()

      const dataCallback = getDataCallback()

      // Trigger command - PTY will double-echo "kkubectl get pods"
      mockEventBus.emit('executeTerminalCommand', { command: 'kubectl get pods\n', tabId: 'tab-1' })
      await nextTick()

      // Simulate PTY double-echo + real output + prompt
      dataCallback('kkubectl get pods\n') // double-echo (first char duplicated)
      dataCallback('NAME   READY\n')
      dataCallback('pod-1  1/1\n')
      dataCallback('$ ')

      await new Promise((r) => setTimeout(r, 300))

      const emitCall = mockEventBus.emit.mock.calls.find((c) => c[0] === 'sendMessageToAi')
      expect(emitCall).toBeDefined()
      const content = emitCall![1].content as string
      // The double-echo line should be stripped
      expect(content).not.toContain('kkubectl')
      expect(content).toContain('NAME')
      expect(emitCall![1].toolResult.output).not.toContain('kkubectl')
      expect(emitCall![1].toolResult.output).toContain('NAME')
    })

    it('should emit "Command executed successfully, no output returned" when output is empty', async () => {
      vi.mocked(isTerminalPromptLine).mockImplementation((line: string) => line.trim().endsWith('$'))

      wrapper = createWrapper({ isActive: true })
      await flushPromises()

      const dataCallback = getDataCallback()

      mockEventBus.emit('executeTerminalCommand', { command: 'kubectl get pods\n', tabId: 'tab-1' })
      await nextTick()

      // Only prompt, no real output
      dataCallback('kubectl get pods\n')
      dataCallback('$ ')

      await new Promise((r) => setTimeout(r, 300))

      const emitCall = mockEventBus.emit.mock.calls.find((c) => c[0] === 'sendMessageToAi')
      expect(emitCall).toBeDefined()
      expect(emitCall![1].content).toBe('Command executed successfully, no output returned')
      expect(emitCall![1].toolResult).toEqual({
        output: 'Command executed successfully, no output returned',
        toolName: 'execute_command'
      })
    })

    it('should unregister executeTerminalCommand listener on unmount', async () => {
      wrapper = createWrapper({ isActive: true })
      await flushPromises()
      wrapper.unmount()
      await nextTick()
      expect(mockEventBus.off).toHaveBeenCalledWith('executeTerminalCommand', expect.any(Function))
    })
  })
})
