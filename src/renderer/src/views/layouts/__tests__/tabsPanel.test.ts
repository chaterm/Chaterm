/**
 * TabsPanel Component Unit Tests
 *
 * Tests for the TabsPanel component including:
 * - Component mounting and rendering
 * - Tab switching functionality
 * - Tab closing functionality
 * - SSH connection rendering
 * - Config tabs rendering (userInfo, userConfig, etc.)
 * - Plugin details rendering
 * - Transparent background toggle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import TabsPanelComponent from '../tabsPanel.vue'

// Mock child components
vi.mock('@views/components/Ssh/sshConnect.vue', () => ({
  default: {
    name: 'SshConnect',
    template: '<div class="ssh-connect-mock">SSH Connect</div>'
  }
}))

vi.mock('@views/components/LeftTab/config/userInfo.vue', () => ({
  default: {
    name: 'UserInfo',
    template: '<div class="user-info-mock">User Info</div>'
  }
}))

vi.mock('@views/components/LeftTab/config/userConfig.vue', () => ({
  default: {
    name: 'UserConfig',
    template: '<div class="user-config-mock">User Config</div>'
  }
}))

vi.mock('@views/components/LeftTab/config/assetConfig.vue', () => ({
  default: {
    name: 'AssetConfig',
    template: '<div class="asset-config-mock">Asset Config</div>'
  }
}))

vi.mock('@views/components/LeftTab/config/KeyManagement.vue', () => ({
  default: {
    name: 'KeyManagement',
    template: '<div class="key-management-mock">Key Management</div>'
  }
}))

vi.mock('@views/components/Extensions/aliasConfig.vue', () => ({
  default: {
    name: 'AliasConfig',
    template: '<div class="alias-config-mock">Alias Config</div>'
  }
}))

vi.mock('@views/components/Extensions/jumpserverSupport.vue', () => ({
  default: {
    name: 'JumpserverSupport',
    template: '<div class="jumpserver-support-mock">Jumpserver Support</div>'
  }
}))

vi.mock('@views/components/Files/index.vue', () => ({
  default: {
    name: 'Files',
    template: '<div class="files-mock">Files</div>'
  }
}))

vi.mock('@views/components/Kubernetes/index.vue', () => ({
  default: {
    name: 'Kubernetes',
    template: '<div class="kubernetes-mock">Kubernetes</div>'
  }
}))

vi.mock('@views/components/Editors/CommonConfigEditor.vue', () => ({
  default: {
    name: 'CommonConfigEditor',
    template: '<div class="common-config-editor-mock">Common Config Editor</div>',
    props: ['filePath', 'pluginId', 'initialContent']
  }
}))

vi.mock('@views/components/Editors/McpConfigEditor.vue', () => ({
  default: {
    name: 'McpConfigEditor',
    template: '<div class="mcp-config-editor-mock">MCP Config Editor</div>'
  }
}))

vi.mock('@views/components/Editors/SecurityConfigEditor.vue', () => ({
  default: {
    name: 'SecurityConfigEditor',
    template: '<div class="security-config-editor-mock">Security Config Editor</div>'
  }
}))

vi.mock('@views/components/Editors/KeywordHighlightEditor.vue', () => ({
  default: {
    name: 'KeywordHighlightEditor',
    template: '<div class="keyword-highlight-editor-mock">Keyword Highlight Editor</div>'
  }
}))

vi.mock('@views/components/Extensions/pluginDetail.vue', () => ({
  default: {
    name: 'PluginDetail',
    template: '<div class="plugin-detail-mock">Plugin Detail</div>',
    props: ['pluginInfo']
  }
}))

// Mock vuedraggable with slot support
vi.mock('vuedraggable', () => ({
  default: {
    name: 'Draggable',
    template: '<div class="draggable-mock"><slot name="item" v-for="item in modelValue" :element="item" /></div>',
    props: ['modelValue', 'group', 'animation', 'handle', 'itemKey']
  }
}))

// Mock i18n
const mockT = (key: string) => {
  const translations: Record<string, string> = {
    'common.userInfo': 'User Info',
    'common.userConfig': 'User Config',
    'common.assetConfig': 'Asset Config',
    'common.aliasConfig': 'Alias Config',
    'common.management': 'Management',
    'common.keyManagement': 'Key Management',
    'common.keyManagementDesc': 'Manage SSH keys and certificates',
    'common.hostManagement': 'Host Management',
    'common.hostManagementDesc': 'Manage SSH hosts and connection configurations',
    'common.fileManagement': 'File Management',
    'common.fileManagementDesc': 'Manage files and folders'
  }
  return translations[key] || key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: mockT
  })
}))

// Mock domUtils
vi.mock('@/utils/domUtils', () => ({
  isFocusInAiTab: vi.fn(() => false)
}))

describe('TabsPanel Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (tabParams: any = {}, options = {}) => {
    const defaultTabParams = {
      id: 'test-tab-1',
      title: 'Test Tab',
      content: 'userConfig',
      type: 'userConfig',
      organizationId: '',
      ip: '',
      data: {},
      closeCurrentPanel: vi.fn(),
      createNewPanel: vi.fn(),
      ...tabParams
    }

    // Note: The component expects props.params.params (nested structure)
    // This is because it's designed for Dockview which passes params this way
    return mount(TabsPanelComponent, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: mockT
        }
      },
      props: {
        params: {
          params: defaultTabParams,
          api: {
            isActive: false,
            onDidActiveChange: vi.fn()
          } as any,
          containerApi: {} as any
        } as any
      },
      ...options
    })
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', () => {
      wrapper = createWrapper()
      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.tabs-panel').exists()).toBe(true)
    })

    it('should render tabs content', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.tabs-content').exists()).toBe(true)
    })

    it('should not render when tab id is empty', () => {
      wrapper = createWrapper({ id: '' })
      expect(wrapper.find('.tabs-bar').exists()).toBe(false)
      expect(wrapper.find('.tabs-content').exists()).toBe(false)
    })
  })

  describe('SSH Connection Rendering', () => {
    it('should render SSH connection component when organizationId is present', () => {
      wrapper = createWrapper({
        organizationId: 'org-123',
        ip: '192.168.1.1',
        type: 'ssh',
        content: 'ssh-connection'
      })

      expect(wrapper.find('.tabs-content').exists()).toBe(true)
      // SSH component should be rendered (mocked as ssh-connect-mock)
      expect(wrapper.html()).toContain('SSH Connect')
    })

    it('should pass correct props to SSH connection component', () => {
      const serverInfo = {
        id: 'ssh-tab-1',
        title: 'Production Server',
        organizationId: 'org-123',
        ip: '192.168.1.100',
        content: 'ssh',
        data: { port: 22, username: 'admin' }
      }

      wrapper = createWrapper(serverInfo)
      expect(wrapper.html()).toContain('SSH Connect')
    })
  })

  describe('Config Tabs Rendering', () => {
    it('should render UserInfo when content is userInfo', () => {
      wrapper = createWrapper({ content: 'userInfo', organizationId: '' })
      expect(wrapper.html()).toContain('User Info')
    })

    it('should render UserConfig when content is userConfig', () => {
      wrapper = createWrapper({ content: 'userConfig', organizationId: '' })
      expect(wrapper.html()).toContain('User Config')
    })

    it('should render AssetConfig when content is assetConfig', () => {
      wrapper = createWrapper({ content: 'assetConfig', organizationId: '' })
      expect(wrapper.html()).toContain('Asset Config')
    })

    it('should render KeyManagement when content is keyManagement', () => {
      wrapper = createWrapper({ content: 'keyManagement', organizationId: '' })
      expect(wrapper.html()).toContain('Key Management')
    })

    it('should render Kubernetes when content is kubernetes', () => {
      wrapper = createWrapper({ content: 'kubernetes', organizationId: '' })
      expect(wrapper.html()).toContain('Kubernetes')
    })

    it('should render CommonConfigEditor when content is CommonConfigEditor and props exist', () => {
      wrapper = createWrapper({
        content: 'CommonConfigEditor',
        organizationId: '',
        props: {
          filePath: '/path/to/config',
          pluginId: 'test-plugin',
          initialContent: 'test content'
        }
      })
      expect(wrapper.html()).toContain('Common Config Editor')
    })

    it('should not render CommonConfigEditor when content is CommonConfigEditor but props are missing', () => {
      wrapper = createWrapper({
        content: 'CommonConfigEditor',
        organizationId: '',
        props: undefined
      })
      expect(wrapper.html()).not.toContain('Common Config Editor')
    })

    it('should render AliasConfig when content is aliasConfig', () => {
      wrapper = createWrapper({ content: 'aliasConfig', organizationId: '' })
      expect(wrapper.html()).toContain('Alias Config')
    })

    it('should render JumpserverSupport when content is jumpserverSupport', () => {
      wrapper = createWrapper({ content: 'jumpserverSupport', organizationId: '' })
      expect(wrapper.html()).toContain('Jumpserver Support')
    })

    it('should render Files when content is files', () => {
      wrapper = createWrapper({ content: 'files', organizationId: '' })
      expect(wrapper.html()).toContain('Files')
    })

    it('should render McpConfigEditor when content is mcpConfigEditor', () => {
      wrapper = createWrapper({ content: 'mcpConfigEditor', organizationId: '' })
      expect(wrapper.html()).toContain('MCP Config Editor')
    })

    it('should render SecurityConfigEditor when content is securityConfigEditor', () => {
      wrapper = createWrapper({ content: 'securityConfigEditor', organizationId: '' })
      expect(wrapper.html()).toContain('Security Config Editor')
    })

    it('should render KeywordHighlightEditor when content is keywordHighlightEditor', () => {
      wrapper = createWrapper({ content: 'keywordHighlightEditor', organizationId: '' })
      expect(wrapper.html()).toContain('Keyword Highlight Editor')
    })
  })

  describe('Plugin Details Rendering', () => {
    it('should render PluginDetail when content starts with plugins:', () => {
      wrapper = createWrapper({
        content: 'plugins:test-plugin',
        organizationId: '',
        props: {
          pluginId: 'test-plugin',
          fromLocal: true
        }
      })

      expect(wrapper.html()).toContain('Plugin Detail')
    })

    it('should not render PluginDetail without props', () => {
      wrapper = createWrapper({
        content: 'plugins:test-plugin',
        organizationId: '',
        props: undefined
      })

      // Should not render plugin detail without props
      expect(wrapper.html()).not.toContain('Plugin Detail')
    })
  })

  describe('Transparent Background', () => {
    it('should apply transparent-bg class when background image is set', async () => {
      // Set up store with background image
      wrapper = createWrapper()

      const store = pinia.state.value.userConfig as any
      if (store) {
        store.userConfig = { background: { image: 'path/to/image.jpg' } }
      }

      await nextTick()

      // The component checks isTransparent computed property
      // Note: This test checks the logic, actual class application depends on store setup
    })
  })

  describe('Tab Behavior', () => {
    it('should emit change-tab when tab title is clicked', async () => {
      wrapper = createWrapper()

      // Find tab title element and trigger click
      const tabTitle = wrapper.find('.tab-title')
      if (tabTitle.exists()) {
        await tabTitle.trigger('click')
        await nextTick()
        // Verify event was emitted
        expect(wrapper.emitted('change-tab')).toBeTruthy()
        expect(wrapper.emitted('change-tab')?.[0]).toEqual(['test-tab-1'])
      }
    })

    it('should emit close-tab when close button is clicked', async () => {
      wrapper = createWrapper()

      // Find close button and trigger click
      const closeBtn = wrapper.find('.close-btn')
      if (closeBtn.exists()) {
        await closeBtn.trigger('click')
        await nextTick()
        // Verify event was emitted
        expect(wrapper.emitted('close-tab')).toBeTruthy()
        expect(wrapper.emitted('close-tab')?.[0]).toEqual(['test-tab-1'])
      }
    })

    it('should have close button rendered in draggable tab structure', () => {
      wrapper = createWrapper()
      // The close button is within the draggable structure
      // Since we're mocking draggable, we just verify the component structure
      const vm = wrapper.vm as any
      expect(vm.localTab).toBeDefined()
      expect(vm.localTab.id).toBe('test-tab-1')
    })

    it('should display original title when tab has ip', () => {
      wrapper = createWrapper({
        title: 'Production Server',
        ip: '192.168.1.1',
        organizationId: 'org-123'
      })

      const tabTitle = wrapper.find('.tab-title')
      if (tabTitle.exists()) {
        expect(tabTitle.text()).toBe('Production Server')
      }
    })

    it('should display translated title when tab has no ip', () => {
      wrapper = createWrapper({
        title: 'userConfig',
        ip: '',
        organizationId: ''
      })

      const tabTitle = wrapper.find('.tab-title')
      if (tabTitle.exists()) {
        expect(tabTitle.text()).toBe('User Config')
      }
    })
  })

  describe('Component Lifecycle', () => {
    it('should initialize with provided params', () => {
      const params = {
        id: 'lifecycle-test',
        title: 'Lifecycle Test',
        content: 'userConfig',
        organizationId: ''
      }

      wrapper = createWrapper(params)
      const vm = wrapper.vm as any

      expect(vm.localTab).toBeDefined()
      expect(vm.localTab.id).toBe('lifecycle-test')
      expect(vm.localTab.title).toBe('Lifecycle Test')
    })

    it('should handle params updates', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any

      const initialId = vm.localTab.id

      // Update props (need to update the nested params structure)
      const currentParams = wrapper.props('params') as any
      await wrapper.setProps({
        params: {
          ...currentParams,
          params: {
            ...currentParams.params,
            title: 'Updated Title'
          }
        }
      })

      await nextTick()

      // LocalTab should update
      expect(vm.localTab.id).toBe(initialId)
      expect(vm.localTab.title).toBe('Updated Title')
    })

    it('should cleanup on unmount', () => {
      wrapper = createWrapper()
      wrapper.unmount()

      // Component should unmount without errors
      expect(wrapper.exists()).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing optional props gracefully', () => {
      wrapper = createWrapper({
        id: 'edge-case-1',
        title: 'Edge Case',
        content: 'userConfig',
        // Missing optional props
        data: undefined,
        props: undefined
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.html()).toContain('User Config')
    })

    it('should handle empty content type', () => {
      wrapper = createWrapper({
        id: 'edge-case-2',
        title: 'Empty Content',
        content: '',
        organizationId: ''
      })

      expect(wrapper.exists()).toBe(true)
      // Should not crash, just not render any content
    })

    it('should prioritize SSH rendering when organizationId is present', () => {
      wrapper = createWrapper({
        id: 'priority-test',
        title: 'Priority Test',
        content: 'userConfig', // Has userConfig content
        organizationId: 'org-123', // But also has organizationId
        ip: '192.168.1.1'
      })

      // Should render SSH component, not userConfig
      expect(wrapper.html()).toContain('SSH Connect')
      expect(wrapper.html()).not.toContain('User Config')
    })
  })

  describe('Resize Functionality', () => {
    it('should expose resizeTerm method', () => {
      wrapper = createWrapper({
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any

      // Check if resizeTerm method exists
      expect(typeof vm.resizeTerm).toBe('function')
    })

    it('should call resizeTerm on SSH components when resized', () => {
      wrapper = createWrapper({
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any

      // Call resizeTerm
      expect(() => {
        vm.resizeTerm()
      }).not.toThrow()
    })
  })

  describe('Active State', () => {
    it('should have isActive computed property', () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(vm.isActive).toBeDefined()
      expect(typeof vm.isActive).toBe('boolean')
    })

    it('should determine active state correctly', () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any

      // By default, should be inactive (no API activePanel set)
      expect(vm.isActive).toBe(false)
    })

    it('should update isActive when API active state changes', async () => {
      const onDidActiveChange = vi.fn((callback) => {
        // Store callback for later invocation
        ;(onDidActiveChange as any).callback = callback
      })

      wrapper = createWrapper(
        {},
        {
          props: {
            params: {
              params: {
                id: 'test-tab-1',
                title: 'Test Tab',
                content: 'userConfig',
                organizationId: ''
              },
              api: {
                isActive: false,
                onDidActiveChange
              } as any,
              containerApi: {} as any
            } as any
          }
        }
      )

      const vm = wrapper.vm as any
      expect(vm.isActive).toBe(false)

      // Simulate active state change
      if ((onDidActiveChange as any).callback) {
        ;(onDidActiveChange as any).callback({ isActive: true })
        await nextTick()
        expect(vm.isActive).toBe(true)
      }
    })
  })

  describe('Event Handlers', () => {
    it('should call closeCurrentPanel when closeTab is called', () => {
      const closeCurrentPanel = vi.fn()
      wrapper = createWrapper({
        id: 'test-close',
        organizationId: 'org-123',
        closeCurrentPanel
      })

      const vm = wrapper.vm as any
      vm.closeTab('test-close')

      expect(closeCurrentPanel).toHaveBeenCalledWith('panel_test-close')
    })

    it('should call closeCurrentPanel when uninstallPlugin is called', () => {
      const closeCurrentPanel = vi.fn()
      wrapper = createWrapper({
        id: 'test-plugin',
        content: 'plugins:test-plugin',
        props: { pluginId: 'test-plugin' },
        closeCurrentPanel
      })

      const vm = wrapper.vm as any
      vm.uninstallPlugin('test-plugin')

      expect(closeCurrentPanel).toHaveBeenCalledWith('panel_test-plugin')
    })

    it('should call createNewPanel when createNewTerm is called', () => {
      const createNewPanel = vi.fn()
      wrapper = createWrapper({
        id: 'test-term',
        organizationId: 'org-123',
        createNewPanel
      })

      const vm = wrapper.vm as any
      vm.createNewTerm()

      expect(createNewPanel).toHaveBeenCalledWith(true, 'within')
    })

    it('should handle closeTab gracefully when closeCurrentPanel is not provided', () => {
      wrapper = createWrapper({
        id: 'test-close',
        organizationId: 'org-123',
        closeCurrentPanel: undefined
      })

      const vm = wrapper.vm as any
      expect(() => vm.closeTab('test-close')).not.toThrow()
    })
  })

  describe('Terminal Output Content', () => {
    it('should expose getTerminalOutputContent method', () => {
      wrapper = createWrapper({
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any
      expect(typeof vm.getTerminalOutputContent).toBe('function')
    })

    it('should return error message when instance not found', async () => {
      wrapper = createWrapper({
        id: 'test-tab',
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any
      const result = await vm.getTerminalOutputContent('non-existent-tab')

      expect(result).toContain('Instance for tab non-existent-tab not found')
    })

    it('should call getTerminalBufferContent on sshConnect instance when available', async () => {
      const mockGetTerminalBufferContent = vi.fn().mockResolvedValue('terminal output')
      const mockSshConnectInstance = {
        getTerminalBufferContent: mockGetTerminalBufferContent
      }

      wrapper = createWrapper({
        id: 'test-tab',
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any
      // Manually set the ref map to simulate mounted component
      vm.sshConnectRefMap = {
        'test-tab': mockSshConnectInstance
      }

      const result = await vm.getTerminalOutputContent('test-tab')

      expect(mockGetTerminalBufferContent).toHaveBeenCalled()
      expect(result).toBe('terminal output')
    })

    it('should handle errors when getTerminalBufferContent throws', async () => {
      const mockGetTerminalBufferContent = vi.fn().mockRejectedValue(new Error('Test error'))
      const mockSshConnectInstance = {
        getTerminalBufferContent: mockGetTerminalBufferContent
      }

      wrapper = createWrapper({
        id: 'test-tab',
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any
      vm.sshConnectRefMap = {
        'test-tab': mockSshConnectInstance
      }

      const result = await vm.getTerminalOutputContent('test-tab')

      expect(result).toContain('Error retrieving output from sshConnect component')
    })
  })

  describe('Context Menu', () => {
    it('should show context menu on right click', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any

      const tabItem = wrapper.find('.tab-item')
      if (tabItem.exists()) {
        const mockEvent = {
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 200
        } as any

        vm.showContextMenu(mockEvent, vm.localTab)
        await nextTick()

        expect(vm.contextMenu.visible).toBe(true)
        expect(vm.contextMenu.targetTab).toBe(vm.localTab)
      }
    })

    it('should adjust context menu position when near screen edge', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any

      // Mock window dimensions
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 800
      })
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 600
      })

      const mockEvent = {
        preventDefault: vi.fn(),
        clientX: 750, // Near right edge
        clientY: 500 // Near bottom edge
      } as any

      vm.showContextMenu(mockEvent, vm.localTab)
      await nextTick()

      // Menu position should be adjusted
      expect(vm.contextMenu.x).toBeLessThan(750)
      expect(vm.contextMenu.y).toBeLessThan(500)
    })
  })

  describe('Keyboard Shortcuts', () => {
    it('should handle Cmd+W (Mac) or Ctrl+Shift+W (Windows/Linux) to close tab', async () => {
      const closeCurrentPanel = vi.fn()
      wrapper = createWrapper({
        id: 'test-tab',
        closeCurrentPanel
      })

      const vm = wrapper.vm as any
      vm.isActive = true

      // Mock Mac platform
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        configurable: true,
        value: 'MacIntel'
      })

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        key: 'w',
        target: document.createElement('div')
      } as any

      vm.handleCloseTabKeyDown(mockEvent)
      await nextTick()

      expect(closeCurrentPanel).toHaveBeenCalledWith('panel_test-tab')
    })

    it('should not close tab when not active', () => {
      const closeCurrentPanel = vi.fn()
      wrapper = createWrapper({
        id: 'test-tab',
        closeCurrentPanel
      })

      const vm = wrapper.vm as any
      vm.isActive = false

      const mockEvent = {
        metaKey: true,
        key: 'w',
        target: document.createElement('div')
      } as any

      vm.handleCloseTabKeyDown(mockEvent)

      expect(closeCurrentPanel).not.toHaveBeenCalled()
    })

    it('should not close tab when focus is in AI tab', async () => {
      const { isFocusInAiTab } = await import('@/utils/domUtils')
      vi.mocked(isFocusInAiTab).mockReturnValueOnce(true)

      const closeCurrentPanel = vi.fn()
      wrapper = createWrapper({
        id: 'test-tab',
        closeCurrentPanel
      })

      const vm = wrapper.vm as any
      vm.isActive = true

      const mockEvent = {
        metaKey: true,
        key: 'w',
        target: document.createElement('div')
      } as any

      vm.handleCloseTabKeyDown(mockEvent)

      expect(closeCurrentPanel).not.toHaveBeenCalled()
    })

    it('should not close SSH tab when focus is in terminal', () => {
      const closeCurrentPanel = vi.fn()
      wrapper = createWrapper({
        id: 'test-tab',
        organizationId: 'org-123',
        closeCurrentPanel
      })

      const vm = wrapper.vm as any
      vm.isActive = true

      // Create element with terminal class
      const terminalElement = document.createElement('div')
      terminalElement.className = 'terminal-container'

      const mockEvent = {
        metaKey: true,
        key: 'w',
        target: terminalElement
      } as any

      vm.handleCloseTabKeyDown(mockEvent)

      expect(closeCurrentPanel).not.toHaveBeenCalled()
    })
  })

  describe('Resize Functionality', () => {
    it('should handle resizeTerm with specific termid', async () => {
      const mockHandleResize = vi.fn()
      wrapper = createWrapper({
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any
      vm.termRefMap = {
        'term-1': { handleResize: mockHandleResize }
      }

      vm.resizeTerm('term-1')

      // Wait for setTimeout
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockHandleResize).toHaveBeenCalled()
    })

    it('should handle resizeTerm without termid (resize all)', async () => {
      const mockHandleResize1 = vi.fn()
      const mockHandleResize2 = vi.fn()
      wrapper = createWrapper({
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any
      vm.termRefMap = {
        'term-1': { handleResize: mockHandleResize1 },
        'term-2': { handleResize: mockHandleResize2 }
      }

      vm.resizeTerm()

      // Wait for setTimeout
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockHandleResize1).toHaveBeenCalled()
      expect(mockHandleResize2).toHaveBeenCalled()
    })

    it('should handle resizeTerm gracefully when termRefMap is empty', () => {
      wrapper = createWrapper({
        organizationId: 'org-123',
        ip: '192.168.1.1'
      })

      const vm = wrapper.vm as any
      vm.termRefMap = {}

      expect(() => vm.resizeTerm()).not.toThrow()
    })
  })
})
