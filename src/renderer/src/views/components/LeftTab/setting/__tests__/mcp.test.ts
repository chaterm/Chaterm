/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import McpComponent from '../mcp.vue'
import type { McpServer } from '@shared/mcp'
import { Modal, notification } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import { mcpConfigService } from '@/services/mcpService'

// Mock ant-design-vue components
vi.mock('ant-design-vue', () => ({
  Modal: {
    confirm: vi.fn()
  },
  notification: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock i18n
const mockTranslations: Record<string, string> = {
  'mcp.description': 'Manage your MCP servers',
  'mcp.addServer': 'Add Server',
  'mcp.noServers': 'No servers configured',
  'mcp.noTools': 'No tools available',
  'mcp.noResources': 'No resources available',
  'mcp.error': 'Error',
  'mcp.confirmDelete': 'Confirm Delete',
  'mcp.deleteServerConfirm': 'Are you sure you want to delete {name}?',
  'mcp.deleteSuccess': 'Server deleted successfully'
}

const mockT = (key: string, params?: Record<string, unknown>) => {
  let translation = mockTranslations[key] || key
  // Simple parameter replacement
  if (params) {
    Object.keys(params).forEach((param) => {
      translation = translation.replace(`{${param}}`, String(params[param]))
    })
  }
  return translation
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: mockT
  })
}))

// Mock eventBus
vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

// Mock mcpConfigService
vi.mock('@/services/mcpService', () => ({
  mcpConfigService: {
    toggleServerDisabled: vi.fn(),
    deleteServer: vi.fn()
  }
}))

// Mock window.api
const mockWindowApi = {
  getMcpServers: vi.fn(),
  onMcpStatusUpdate: vi.fn(),
  onMcpServerUpdate: vi.fn(),
  setMcpToolState: vi.fn(),
  getAllMcpToolStates: vi.fn()
}

describe('McpComponent', () => {
  beforeEach(() => {
    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api: typeof mockWindowApi }).api = mockWindowApi

    // Reset mocks
    vi.clearAllMocks()
    mockWindowApi.getMcpServers.mockResolvedValue([])
    mockWindowApi.onMcpStatusUpdate.mockReturnValue(() => {})
    mockWindowApi.onMcpServerUpdate.mockReturnValue(() => {})
    mockWindowApi.getAllMcpToolStates.mockResolvedValue({})

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  const createWrapper = (options = {}) => {
    return mount(McpComponent, {
      global: {
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-button': {
            template: '<button class="a-button ant-btn"><slot /></button>'
          },
          'a-empty': {
            template: '<div class="a-empty">{{ description }}</div>',
            props: ['description']
          },
          'a-badge': {
            template: '<div class="a-badge" :data-status="status"><slot /></div>',
            props: ['status']
          },
          'a-switch': {
            template:
              '<input type="checkbox" class="a-switch" :checked="checked" :disabled="disabled" @change="$emit(\'change\', $event.target.checked)" />',
            props: ['checked', 'disabled', 'loading', 'size']
          },
          'a-collapse': {
            template: '<div class="a-collapse"><slot /></div>'
          },
          'a-collapse-panel': {
            template: '<div class="a-collapse-panel"><slot name="header" /><slot /></div>'
          },
          'a-tabs': {
            template: '<div class="a-tabs"><slot /></div>',
            props: ['defaultActiveKey']
          },
          'a-tab-pane': {
            template: '<div class="a-tab-pane" :data-key="tabKey"><div class="tab-label">{{ tab }}</div><slot /></div>',
            props: {
              tab: String,
              tabKey: { type: String, default: '' }
            }
          },
          PlusOutlined: { template: '<span class="plus-icon" />' },
          EditOutlined: { template: '<span class="edit-icon" />' },
          DeleteOutlined: { template: '<span class="delete-icon" />' },
          ExclamationCircleOutlined: { template: '<span class="exclamation-icon" />' }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  describe('Unit Tests - Helper Functions', () => {
    let wrapper: VueWrapper

    beforeEach(() => {
      wrapper = createWrapper()
    })

    it('getStatusBadge should return correct badge status for different server states', () => {
      const vm = wrapper.vm as unknown as {
        getStatusBadge: (status: string) => string
      }

      expect(vm.getStatusBadge('connected')).toBe('success')
      expect(vm.getStatusBadge('connecting')).toBe('processing')
      expect(vm.getStatusBadge('disconnected')).toBe('error')
      expect(vm.getStatusBadge('unknown')).toBe('default')
    })

    it('getToolStateKey should generate correct key format', () => {
      const vm = wrapper.vm as unknown as {
        getToolStateKey: (serverName: string, toolName: string) => string
      }

      const key = vm.getToolStateKey('test-server', 'test-tool')
      expect(key).toBe('test-server:test-tool')
    })

    it('isToolEnabled should return true by default when tool state is not set', () => {
      const vm = wrapper.vm as unknown as {
        isToolEnabled: (serverName: string, toolName: string) => boolean
      }

      expect(vm.isToolEnabled('test-server', 'test-tool')).toBe(true)
    })

    it('isToolEnabled should return false when tool is explicitly disabled', () => {
      const vm = wrapper.vm as unknown as {
        isToolEnabled: (serverName: string, toolName: string) => boolean
        toolStates: Record<string, boolean>
      }

      // Explicitly disable a tool
      vm.toolStates['test-server:test-tool'] = false
      expect(vm.isToolEnabled('test-server', 'test-tool')).toBe(false)
    })
  })

  describe('Component Tests - Rendering', () => {
    it('should render the component with toolbar', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.mcp-container').exists()).toBe(true)
      expect(wrapper.find('.mcp-toolbar').exists()).toBe(true)
      expect(wrapper.find('.toolbar-title').text()).toBe('MCP Servers')
    })

    it('should show empty state when no servers are configured', async () => {
      mockWindowApi.getMcpServers.mockResolvedValue([])

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('No servers configured')
    })

    it('should render server cards when servers exist', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.findAll('.server-card')).toHaveLength(1)
      expect(wrapper.text()).toContain('test-server')
    })

    it('should display server tools with correct count', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [
            {
              name: 'tool1',
              description: 'Test tool 1'
            },
            {
              name: 'tool2',
              description: 'Test tool 2'
            }
          ],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('Tools (2)')
    })

    it('should display server resources with correct count', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [],
          resources: [
            {
              uri: 'file:///test1',
              name: 'Resource 1'
            },
            {
              uri: 'file:///test2',
              name: 'Resource 2'
            }
          ]
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('Resources (2)')
    })

    it('should display error message when server has error', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'disconnected',
          error: 'Connection failed',
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.find('.server-error').exists()).toBe(true)
      expect(wrapper.text()).toContain('Connection failed')
    })

    it('should display tool parameters when tool has input schema', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [
            {
              name: 'test-tool',
              description: 'A test tool',
              inputSchema: {
                properties: {
                  param1: {
                    description: 'First parameter',
                    type: 'string'
                  },
                  param2: {
                    description: 'Second parameter',
                    type: 'number'
                  }
                },
                required: ['param1']
              }
            }
          ],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('PARAMETERS (2)')
      expect(wrapper.text()).toContain('param1')
      expect(wrapper.text()).toContain('First parameter')
    })
  })

  describe('Component Tests - User Interactions', () => {
    it('should emit event to open config editor when add server button is clicked', async () => {
      const wrapper = createWrapper()
      await nextTick()

      const addButton = wrapper.find('[data-testid="add-server-btn"]')
      await addButton.trigger('click')

      expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith('open-user-tab', 'mcpConfigEditor')
    })

    it('should emit event to open config editor when edit button is clicked', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const editButton = wrapper.find('[data-testid="server-edit-btn"]')
      await editButton.trigger('click')

      expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith('open-user-tab', 'mcpConfigEditor')
    })

    it('should call toggleServerDisabled when switch is toggled', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          disabled: false,
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)
      vi.mocked(mcpConfigService.toggleServerDisabled).mockResolvedValue(undefined)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        toggleServerDisabled: (name: string, disabled: boolean) => Promise<void>
      }

      await vm.toggleServerDisabled('test-server', true)

      expect(vi.mocked(mcpConfigService.toggleServerDisabled)).toHaveBeenCalledWith('test-server', true)
    })

    it('should show confirmation modal when delete button is clicked', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        confirmDeleteServer: (name: string) => void
      }

      vm.confirmDeleteServer('test-server')

      expect(vi.mocked(Modal.confirm)).toHaveBeenCalled()
    })

    it('should call deleteServer and show success notification on successful delete', async () => {
      vi.mocked(mcpConfigService.deleteServer).mockResolvedValue(undefined)

      const wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        deleteServer: (name: string) => Promise<void>
      }

      await vm.deleteServer('test-server')

      expect(vi.mocked(mcpConfigService.deleteServer)).toHaveBeenCalledWith('test-server')
      expect(vi.mocked(notification.success)).toHaveBeenCalledWith({
        message: 'Server deleted successfully'
      })
    })

    it('should show error notification when delete fails', async () => {
      const error = new Error('Delete failed')
      vi.mocked(mcpConfigService.deleteServer).mockRejectedValue(error)

      const wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        deleteServer: (name: string) => Promise<void>
      }

      await vm.deleteServer('test-server')

      expect(vi.mocked(notification.error)).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Delete failed'
      })
    })

    it('should toggle tool state optimistically when tool name is clicked', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [
            {
              name: 'test-tool',
              description: 'Test tool'
            }
          ],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)
      mockWindowApi.setMcpToolState.mockResolvedValue(undefined)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        toggleToolState: (serverName: string, toolName: string) => Promise<void>
        isToolEnabled: (serverName: string, toolName: string) => boolean
      }

      const initialState = vm.isToolEnabled('test-server', 'test-tool')
      expect(initialState).toBe(true)

      await vm.toggleToolState('test-server', 'test-tool')

      expect(mockWindowApi.setMcpToolState).toHaveBeenCalledWith('test-server', 'test-tool', false)
      expect(vm.isToolEnabled('test-server', 'test-tool')).toBe(false)
    })

    it('should rollback tool state on error', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          tools: [
            {
              name: 'test-tool',
              description: 'Test tool'
            }
          ],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)
      mockWindowApi.setMcpToolState.mockRejectedValue(new Error('Failed to toggle'))

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        toggleToolState: (serverName: string, toolName: string) => Promise<void>
        isToolEnabled: (serverName: string, toolName: string) => boolean
      }

      const initialState = vm.isToolEnabled('test-server', 'test-tool')

      await vm.toggleToolState('test-server', 'test-tool')

      // State should be rolled back to initial state
      expect(vm.isToolEnabled('test-server', 'test-tool')).toBe(initialState)
    })

    it('should show error notification when toggle server disabled fails', async () => {
      const error = new Error('Toggle failed')
      vi.mocked(mcpConfigService.toggleServerDisabled).mockRejectedValue(error)

      const wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        toggleServerDisabled: (name: string, disabled: boolean) => Promise<void>
      }

      await vm.toggleServerDisabled('test-server', true)

      expect(vi.mocked(notification.error)).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Toggle failed'
      })
    })
  })

  describe('Component Tests - Lifecycle and Event Listeners', () => {
    it('should register status update listener on mount', async () => {
      createWrapper()
      await nextTick()

      expect(mockWindowApi.onMcpStatusUpdate).toHaveBeenCalled()
    })

    it('should register server update listener on mount', async () => {
      createWrapper()
      await nextTick()

      expect(mockWindowApi.onMcpServerUpdate).toHaveBeenCalled()
    })

    it('should load initial servers on mount', async () => {
      createWrapper()
      await nextTick()

      expect(mockWindowApi.getMcpServers).toHaveBeenCalled()
    })

    it('should load tool states on mount', async () => {
      createWrapper()
      await nextTick()

      expect(mockWindowApi.getAllMcpToolStates).toHaveBeenCalled()
    })

    it('should update servers when status update event is received', async () => {
      let statusUpdateCallback: ((servers: any[]) => void) | undefined

      mockWindowApi.onMcpStatusUpdate.mockImplementation((callback: (servers: any[]) => void) => {
        statusUpdateCallback = callback
        return () => {}
      })

      const wrapper = createWrapper()
      await nextTick()

      const updatedServers: McpServer[] = [
        {
          name: 'updated-server',
          config: '{}',
          status: 'connected',
          tools: [],
          resources: []
        }
      ]

      if (statusUpdateCallback) {
        statusUpdateCallback(updatedServers)
      }

      await nextTick()

      expect(wrapper.text()).toContain('updated-server')
    })

    it('should update individual server when server update event is received', async () => {
      let serverUpdateCallback: ((server: McpServer) => void) | undefined

      const initialServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connecting',
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(initialServers)
      mockWindowApi.onMcpServerUpdate.mockImplementation((callback: (server: McpServer) => void) => {
        serverUpdateCallback = callback
        return () => {}
      })

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const updatedServer: McpServer = {
        name: 'test-server',
        config: '{}',
        status: 'connected',
        tools: [
          {
            name: 'new-tool',
            description: 'New tool'
          }
        ],
        resources: []
      }

      if (serverUpdateCallback) {
        serverUpdateCallback(updatedServer)
      }

      await nextTick()

      expect(wrapper.text()).toContain('new-tool')
    })

    it('should add new server when server update event is received for non-existing server', async () => {
      let serverUpdateCallback: ((server: McpServer) => void) | undefined

      mockWindowApi.getMcpServers.mockResolvedValue([])
      mockWindowApi.onMcpServerUpdate.mockImplementation((callback: (server: McpServer) => void) => {
        serverUpdateCallback = callback
        return () => {}
      })

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const newServer: McpServer = {
        name: 'new-server',
        config: '{}',
        status: 'connected',
        tools: [],
        resources: []
      }

      if (serverUpdateCallback) {
        serverUpdateCallback(newServer)
      }

      await nextTick()

      expect(wrapper.findAll('.server-card')).toHaveLength(1)
      expect(wrapper.text()).toContain('new-server')
    })

    it('should cleanup event listeners on unmount', async () => {
      const mockRemoveStatusListener = vi.fn()
      const mockRemoveServerListener = vi.fn()

      mockWindowApi.onMcpStatusUpdate.mockReturnValue(mockRemoveStatusListener)
      mockWindowApi.onMcpServerUpdate.mockReturnValue(mockRemoveServerListener)

      const wrapper = createWrapper()
      await nextTick()

      wrapper.unmount()

      expect(mockRemoveStatusListener).toHaveBeenCalled()
      expect(mockRemoveServerListener).toHaveBeenCalled()
    })
  })

  describe('Component Tests - Loading States', () => {
    it('should show loading state when toggling server', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          disabled: false,
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      // Make toggle operation slow
      let resolveToggle: ((value: void | PromiseLike<void>) => void) | undefined
      const togglePromise = new Promise<void>((resolve) => {
        resolveToggle = resolve
      })
      vi.mocked(mcpConfigService.toggleServerDisabled).mockReturnValue(togglePromise)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        toggleServerDisabled: (name: string, disabled: boolean) => Promise<void>
        loadingServers: Set<string>
      }

      const togglePromiseResult = vm.toggleServerDisabled('test-server', true)

      await nextTick()
      expect(vm.loadingServers.has('test-server')).toBe(true)

      if (resolveToggle) {
        resolveToggle()
      }
      await togglePromiseResult

      expect(vm.loadingServers.has('test-server')).toBe(false)
    })

    it('should apply loading class to server card during toggle', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          disabled: false,
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        loadingServers: Set<string>
      }

      vm.loadingServers.add('test-server')
      await nextTick()

      const serverCard = wrapper.find('.server-card')
      expect(serverCard.classes()).toContain('server-card-loading')
    })
  })

  describe('Component Tests - Optimistic Updates', () => {
    it('should apply optimistic update when toggling server disabled', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          disabled: false,
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)

      // Make toggle operation slow
      let resolveToggle: ((value: void | PromiseLike<void>) => void) | undefined
      const togglePromise = new Promise<void>((resolve) => {
        resolveToggle = resolve
      })
      vi.mocked(mcpConfigService.toggleServerDisabled).mockReturnValue(togglePromise)

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        toggleServerDisabled: (name: string, disabled: boolean) => Promise<void>
        displayServers: McpServer[]
      }

      const togglePromiseResult = vm.toggleServerDisabled('test-server', true)

      await nextTick()
      // Optimistic update should be applied
      expect(vm.displayServers[0].disabled).toBe(true)

      if (resolveToggle) {
        resolveToggle()
      }
      await togglePromiseResult

      // Optimistic update should be cleared after completion
      expect(vm.displayServers[0].disabled).toBe(false)
    })

    it('should clear optimistic update on error', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'test-server',
          config: '{}',
          status: 'connected',
          disabled: false,
          tools: [],
          resources: []
        }
      ]

      mockWindowApi.getMcpServers.mockResolvedValue(mockServers)
      vi.mocked(mcpConfigService.toggleServerDisabled).mockRejectedValue(new Error('Toggle failed'))

      const wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as unknown as {
        toggleServerDisabled: (name: string, disabled: boolean) => Promise<void>
        displayServers: McpServer[]
      }

      await vm.toggleServerDisabled('test-server', true)

      // Optimistic update should be cleared on error
      expect(vm.displayServers[0].disabled).toBe(false)
    })
  })
})
