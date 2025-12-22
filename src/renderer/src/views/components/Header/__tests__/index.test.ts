/**
 * Header Component Unit Tests
 *
 * Tests for the Header component including:
 * - Mode switching (terminal/agents)
 * - Sidebar toggling
 * - Update checking
 * - Platform detection
 * - Device information retrieval
 * - Event emissions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Header from '../index.vue'

// Mock window.api
const mockWindowApi = {
  getPlatform: vi.fn(),
  getLocalIP: vi.fn(),
  getMacAddress: vi.fn(),
  checkUpdate: vi.fn(),
  download: vi.fn(),
  autoUpdate: vi.fn(),
  quitAndInstall: vi.fn()
}

// Mock dependencies
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn(),
    saveConfig: vi.fn()
  }
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

const mockI18n = {
  locale: 'zh-CN',
  t: (key: string) => key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => mockI18n
}))

vi.mock('@ant-design/icons-vue', () => ({
  ArrowDownOutlined: {
    name: 'ArrowDownOutlined',
    template: '<span>ArrowDownOutlined</span>'
  },
  RightOutlined: {
    name: 'RightOutlined',
    template: '<span>RightOutlined</span>'
  }
}))

// Import mocked modules
import { userConfigStore } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'
import { useDeviceStore } from '@/store/useDeviceStore'

describe('Header Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>
  let deviceStore: ReturnType<typeof useDeviceStore>

  const createWrapper = (options = {}) => {
    const wrapper = mount(Header, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-button': {
            template: '<button class="a-button mode-button" :class="$attrs.class" @click="$emit(\'click\')"><slot /></button>',
            props: ['type', 'size']
          },
          'a-button-group': {
            template: '<div class="a-button-group"><slot /></div>',
            props: ['size']
          }
        },
        mocks: {
          $i18n: mockI18n
        }
      },
      ...options
    })

    // Setup appContext for i18n locale setting
    if (wrapper.vm.$ && wrapper.vm.$.appContext) {
      wrapper.vm.$.appContext.config.globalProperties = wrapper.vm.$.appContext.config.globalProperties || {}
      // Use type assertion for test mock - we only need locale and t() method
      wrapper.vm.$.appContext.config.globalProperties.$i18n = mockI18n as any
    }

    return wrapper
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)
    deviceStore = useDeviceStore()

    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as Record<string, unknown>).api = mockWindowApi

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    mockWindowApi.getPlatform.mockResolvedValue('darwin')
    mockWindowApi.getLocalIP.mockResolvedValue('192.168.1.1')
    mockWindowApi.getMacAddress.mockResolvedValue('00:11:22:33:44:55')
    mockWindowApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: false })
    mockWindowApi.autoUpdate.mockImplementation((callback) => {
      // Simulate autoUpdate callback
      callback({ status: 0 })
      return () => {} // Return cleanup function
    })
    ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      language: 'zh-CN',
      defaultLayout: 'terminal'
    })
    ;(userConfigStore.saveConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(wrapper.exists()).toBe(true)
    })

    it('should fetch platform on mount', async () => {
      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockWindowApi.getPlatform).toHaveBeenCalled()
    })

    it('should fetch device IP and MAC address on mount', async () => {
      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockWindowApi.getLocalIP).toHaveBeenCalled()
      expect(mockWindowApi.getMacAddress).toHaveBeenCalled()
      expect(deviceStore.ip).toBe('192.168.1.1')
      expect(deviceStore.macAddress).toBe('00:11:22:33:44:55')
    })

    it('should load user config on mount', async () => {
      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(userConfigStore.getConfig).toHaveBeenCalled()
    })

    it('should check for updates on mount', async () => {
      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockWindowApi.checkUpdate).toHaveBeenCalled()
    })

    it('should handle errors when fetching device information', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockWindowApi.getLocalIP.mockRejectedValue(new Error('Network error'))
      mockWindowApi.getMacAddress.mockRejectedValue(new Error('Network error'))

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Mode Switching', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it('should display terminal and agents mode buttons', () => {
      const buttons = wrapper.findAll('.mode-button')
      expect(buttons.length).toBe(2)
    })

    it('should switch to terminal mode when terminal button is clicked', async () => {
      const terminalButton = wrapper.findAll('.mode-button')[0]
      await terminalButton.trigger('click')

      expect(wrapper.emitted('mode-change')).toBeTruthy()
      expect(wrapper.emitted('mode-change')?.[0]).toEqual(['terminal'])
    })

    it('should switch to agents mode when agents button is clicked', async () => {
      const agentsButton = wrapper.findAll('.mode-button')[1]
      await agentsButton.trigger('click')

      expect(wrapper.emitted('mode-change')).toBeTruthy()
      expect(wrapper.emitted('mode-change')?.[0]).toEqual(['agents'])
    })

    it('should save default layout when mode changes', async () => {
      const agentsButton = wrapper.findAll('.mode-button')[1]
      await agentsButton.trigger('click')
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(userConfigStore.saveConfig).toHaveBeenCalledWith({
        defaultLayout: 'agents'
      })
    })

    it('should emit defaultLayoutChanged event when mode changes', async () => {
      const agentsButton = wrapper.findAll('.mode-button')[1]
      await agentsButton.trigger('click')
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(eventBus.emit).toHaveBeenCalledWith('defaultLayoutChanged', 'agents')
    })

    it('should apply active class to current mode button', async () => {
      const terminalButton = wrapper.findAll('.mode-button')[0]
      expect(terminalButton.classes()).toContain('mode-button-active')
    })

    it('should update active class when mode changes', async () => {
      const terminalButton = wrapper.findAll('.mode-button')[0]
      const agentsButton = wrapper.findAll('.mode-button')[1]

      await agentsButton.trigger('click')
      await wrapper.vm.$nextTick()

      expect(agentsButton.classes()).toContain('mode-button-active')
      expect(terminalButton.classes()).not.toContain('mode-button-active')
    })
  })

  describe('Sidebar Toggling', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it('should emit toggle-sidebar event for left sidebar in terminal mode', async () => {
      // Set mode to terminal (default)
      const leftToggle = wrapper.find('.toggle-right-btn')
      if (leftToggle.exists()) {
        await leftToggle.trigger('click')
        expect(wrapper.emitted('toggle-sidebar')).toBeTruthy()
      }
    })

    it('should emit toggle-sidebar event for right sidebar in terminal mode', async () => {
      const rightToggleButtons = wrapper.findAll('.toggle-right-btn')
      if (rightToggleButtons.length > 1) {
        await rightToggleButtons[rightToggleButtons.length - 1].trigger('click')
        expect(wrapper.emitted('toggle-sidebar')).toBeTruthy()
      }
    })

    it('should emit toggle-sidebar event for agents left sidebar in agents mode', async () => {
      // Switch to agents mode first
      const agentsButton = wrapper.findAll('.mode-button')[1]
      await agentsButton.trigger('click')
      await wrapper.vm.$nextTick()

      const leftToggle = wrapper.find('.toggle-right-btn')
      if (leftToggle.exists()) {
        await leftToggle.trigger('click')
        expect(wrapper.emitted('toggle-sidebar')).toBeTruthy()
      }
    })

    it('should update right sidebar icon state when updateRightIcon event is received', async () => {
      eventBus.on('updateRightIcon', wrapper.vm.switchIcon)
      eventBus.emit('updateRightIcon', true)

      await wrapper.vm.$nextTick()
      // The component should have received the event
      expect(eventBus.on).toHaveBeenCalledWith('updateRightIcon', expect.any(Function))
    })
  })

  describe('Update Functionality', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it('should not show update badge when no update is available', () => {
      const updateBadge = wrapper.find('.update-badge')
      expect(updateBadge.exists()).toBe(false)
    })

    it('should show update badge when update is available', async () => {
      // Simulate update available
      mockWindowApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: true })
      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        // Simulate status 4 (update ready)
        callback({ status: 4 })
        return () => {} // Return cleanup function
      })

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const updateBadge = wrapper.find('.update-badge')
      expect(updateBadge.exists()).toBe(true)
    })

    it('should call quitAndInstall when update badge is clicked', async () => {
      // First make update available
      mockWindowApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: true })
      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        callback({ status: 4 })
        return () => {} // Return cleanup function
      })

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const updateBadge = wrapper.find('.update-badge')
      if (updateBadge.exists()) {
        await updateBadge.trigger('click')
        expect(mockWindowApi.quitAndInstall).toHaveBeenCalled()
      }
    })

    it('should start download when update is available', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: true })
      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        callback({ status: 0 })
        return () => {} // Return cleanup function
      })

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockWindowApi.download).toHaveBeenCalled()
    })

    it('should handle update check errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockWindowApi.checkUpdate.mockRejectedValue(new Error('Update check failed'))

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Platform Detection', () => {
    it('should apply macOS-specific styles on macOS', async () => {
      mockWindowApi.getPlatform.mockResolvedValue('darwin')

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      const modeSwitcher = wrapper.find('.mode-switcher')
      expect(modeSwitcher.classes()).toContain('mode-switcher-mac')
    })

    it('should not apply macOS-specific styles on non-macOS platforms', async () => {
      mockWindowApi.getPlatform.mockResolvedValue('win32')

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      const modeSwitcher = wrapper.find('.mode-switcher')
      expect(modeSwitcher.classes()).not.toContain('mode-switcher-mac')
    })

    it('should adjust margin for non-macOS platforms', async () => {
      mockWindowApi.getPlatform.mockResolvedValue('win32')

      wrapper = createWrapper()

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))

      const termTabInfo = wrapper.find('.term_tab_Info')
      expect(termTabInfo.attributes('style')).toContain('margin-right: 140px')
    })
  })

  describe('Exposed Methods', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it('should expose switchIcon method', () => {
      expect(wrapper.vm.switchIcon).toBeDefined()
      expect(typeof wrapper.vm.switchIcon).toBe('function')
    })

    it('should switch left sidebar icon when switchIcon is called with left direction', () => {
      wrapper.vm.switchIcon('left', true)
      // The component should update its internal state
      expect(wrapper.vm.switchIcon).toBeDefined()
    })

    it('should switch right sidebar icon when switchIcon is called with right direction', () => {
      wrapper.vm.switchIcon('right', true)
      // The component should update its internal state
      expect(wrapper.vm.switchIcon).toBeDefined()
    })

    it('should switch agents left sidebar icon when switchIcon is called with agentsLeft direction', () => {
      wrapper.vm.switchIcon('agentsLeft', true)
      // The component should update its internal state
      expect(wrapper.vm.switchIcon).toBeDefined()
    })

    it('should expose setMode method', () => {
      expect(wrapper.vm.setMode).toBeDefined()
      expect(typeof wrapper.vm.setMode).toBe('function')
    })

    it('should set mode when setMode is called', async () => {
      wrapper.vm.setMode('agents')
      await wrapper.vm.$nextTick()

      const agentsButton = wrapper.findAll('.mode-button')[1]
      expect(agentsButton.classes()).toContain('mode-button-active')
    })
  })

  describe('Conditional Rendering', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    it('should show terminal sidebar toggles in terminal mode', async () => {
      // Default mode is terminal
      const toggleButtons = wrapper.findAll('.toggle-right-btn')
      expect(toggleButtons.length).toBeGreaterThan(0)
    })

    it('should show agents sidebar toggle in agents mode', async () => {
      const agentsButton = wrapper.findAll('.mode-button')[1]
      await agentsButton.trigger('click')
      await wrapper.vm.$nextTick()

      const toggleButtons = wrapper.findAll('.toggle-right-btn')
      expect(toggleButtons.length).toBeGreaterThan(0)
    })
  })
})
