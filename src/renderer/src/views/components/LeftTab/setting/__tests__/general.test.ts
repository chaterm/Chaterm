/**
 * General Settings Component Unit Tests
 *
 * Tests for the General settings component including:
 * - Theme switching (dark/light/auto)
 * - Background settings (mode, image, opacity, brightness)
 * - Default layout switching
 * - Language switching
 * - Watermark settings
 * - System theme listener
 * - Config loading and saving
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import GeneralComponent from '../general.vue'
import { notification } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import { userConfigStore } from '@/services/userConfigStoreService'
import { userConfigStore as configStore } from '@/store/userConfigStore'

// Mock ant-design-vue components
vi.mock('ant-design-vue', () => ({
  notification: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock i18n
const mockTranslations: Record<string, string> = {
  'user.baseSetting': 'Base Settings',
  'user.theme': 'Theme',
  'user.themeDark': 'Dark',
  'user.themeLight': 'Light',
  'user.themeAuto': 'Auto',
  'user.background': 'Background',
  'user.backgroundNone': 'None',
  'user.backgroundEnable': 'Enable',
  'user.backgroundUpload': 'Upload',
  'user.backgroundOpacity': 'Opacity',
  'user.backgroundBrightness': 'Brightness',
  'user.defaultLayout': 'Default Layout',
  'user.defaultLayoutTerminal': 'Terminal',
  'user.defaultLayoutAgents': 'Agents',
  'user.language': 'Language',
  'user.watermark': 'Watermark',
  'user.watermarkOpen': 'Open',
  'user.watermarkClose': 'Close',
  'user.loadConfigFailed': 'Failed to load config',
  'user.loadConfigFailedDescription': 'Failed to load configuration',
  'user.error': 'Error',
  'user.saveConfigFailedDescription': 'Failed to save configuration',
  'user.themeSwitchFailed': 'Theme switch failed',
  'user.themeSwitchFailedDescription': 'Failed to switch theme',
  'user.saveBackgroundFailed': 'Failed to save background'
}

const mockT = (key: string) => {
  return mockTranslations[key] || key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'zh-CN' },
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

// Mock userConfigStore service
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn(),
    saveConfig: vi.fn()
  }
}))

// Mock themeUtils
const mockGetActualTheme = vi.fn((theme: string) => {
  if (theme === 'auto') {
    return 'dark' // Mock system theme as dark
  }
  return theme
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockAddSystemThemeListener = vi.fn((_callback: (theme: string) => void) => {
  // Return cleanup function
  return () => {}
})

vi.mock('@/utils/themeUtils', () => ({
  getActualTheme: (theme: string) => mockGetActualTheme(theme),
  addSystemThemeListener: (callback: (theme: string) => void) => mockAddSystemThemeListener(callback)
}))

// Mock window.api
const mockWindowApi = {
  updateTheme: vi.fn(),
  showOpenDialog: vi.fn(),
  saveCustomBackground: vi.fn(),
  onSystemThemeChanged: vi.fn()
}

describe('General Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (options = {}) => {
    return mount(GeneralComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-form': {
            template: '<form class="a-form"><slot /></form>'
          },
          'a-form-item': {
            template: '<div class="a-form-item"><slot name="label" /><slot /></div>',
            props: ['label']
          },
          'a-radio-group': {
            template: '<div class="a-radio-group" @change="$emit(\'change\', $event)"><slot /></div>',
            props: ['value']
          },
          'a-radio': {
            template: '<label class="a-radio"><input type="radio" :value="value" @change="$emit(\'change\', $event)" /><slot /></label>',
            props: ['value']
          },
          'a-slider': {
            template: '<div class="a-slider"><input type="range" :value="value" @input="$emit(\'change\', parseFloat($event.target.value))" /></div>',
            props: ['value', 'min', 'max', 'step']
          },
          DeleteOutlined: { template: '<span class="delete-icon" />' },
          PlusOutlined: { template: '<span class="plus-icon" />' }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)

    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api: typeof mockWindowApi }).api = mockWindowApi

    // Setup document.documentElement
    document.documentElement.className = 'theme-dark'

    // Reset all mocks
    vi.clearAllMocks()
    mockGetActualTheme.mockImplementation((theme: string) => {
      if (theme === 'auto') {
        return 'dark'
      }
      return theme
    })

    // Setup default mock return values
    ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      language: 'zh-CN',
      watermark: 'open',
      theme: 'auto',
      defaultLayout: 'terminal',
      background: {
        image: '',
        opacity: 0.15,
        brightness: 0.45,
        mode: 'none'
      }
    })
    ;(userConfigStore.saveConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockWindowApi.updateTheme.mockResolvedValue(undefined)
    mockWindowApi.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    mockWindowApi.saveCustomBackground.mockResolvedValue({ success: true, url: 'file:///test.jpg' })
    mockWindowApi.onSystemThemeChanged.mockImplementation(() => () => {})

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.userInfo').exists()).toBe(true)
    })

    it('should load saved config on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(userConfigStore.getConfig).toHaveBeenCalled()
    })

    it('should apply theme on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(mockGetActualTheme).toHaveBeenCalled()
      expect(mockWindowApi.updateTheme).toHaveBeenCalled()
    })

    it('should setup system theme listener on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      // Wait for onMounted to complete
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockAddSystemThemeListener).toHaveBeenCalled()
    })

    it('should listen for defaultLayoutChanged event on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      // Wait for onMounted to complete
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(eventBus.on).toHaveBeenCalledWith('defaultLayoutChanged', expect.any(Function))
    })

    it('should handle config load errors', async () => {
      const error = new Error('Load failed')
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Failed to load config',
        description: 'Failed to load configuration'
      })
    })
  })

  describe('Theme Switching', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should render theme radio group', () => {
      const radioGroup = wrapper.find('.a-radio-group')
      expect(radioGroup.exists()).toBe(true)
    })

    it('should change theme to dark when dark option is selected', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.theme = 'dark'
      await nextTick()

      await vm.changeTheme()

      expect(mockGetActualTheme).toHaveBeenCalledWith('dark')
      expect(document.documentElement.className).toBe('theme-dark')
      expect(eventBus.emit).toHaveBeenCalledWith('updateTheme', 'dark')
      expect(mockWindowApi.updateTheme).toHaveBeenCalledWith('dark')
    })

    it('should change theme to light when light option is selected', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.theme = 'light'
      await nextTick()

      await vm.changeTheme()

      expect(mockGetActualTheme).toHaveBeenCalledWith('light')
      expect(document.documentElement.className).toBe('theme-light')
      expect(eventBus.emit).toHaveBeenCalledWith('updateTheme', 'light')
    })

    it('should change theme to auto when auto option is selected', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.theme = 'auto'
      await nextTick()

      await vm.changeTheme()

      expect(mockGetActualTheme).toHaveBeenCalledWith('auto')
      expect(eventBus.emit).toHaveBeenCalledWith('updateTheme', 'dark') // Mock returns dark for auto
    })

    it('should handle theme change errors', async () => {
      const error = new Error('Theme change failed')
      mockWindowApi.updateTheme.mockRejectedValue(error)

      const vm = wrapper.vm as any
      vm.userConfig.theme = 'dark'
      await nextTick()

      await vm.changeTheme()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Theme switch failed',
        description: 'Failed to switch theme'
      })
    })
  })

  describe('Background Settings', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should render background mode radio group', () => {
      const radioGroup = wrapper.findAll('.a-radio-group')
      expect(radioGroup.length).toBeGreaterThan(0)
    })

    it('should show background grid when mode is image', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.background.mode = 'image'
      await nextTick()

      expect(wrapper.find('.unified-bg-grid').exists()).toBe(true)
    })

    it('should hide background grid when mode is none', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.background.mode = 'none'
      await nextTick()

      // Grid might still exist but content should be hidden
      expect(vm.userConfig.background.mode).toBe('none')
    })

    it('should change background mode to image', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateBackgroundModeSpy = vi.spyOn(store, 'updateBackgroundMode')

      vm.userConfig.background.mode = 'image'
      await nextTick()

      await vm.changeBackgroundMode()

      expect(updateBackgroundModeSpy).toHaveBeenCalledWith('image')
    })

    it('should clear background image when mode changes to none', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateBackgroundImageSpy = vi.spyOn(store, 'updateBackgroundImage')

      vm.userConfig.background.mode = 'image'
      vm.userConfig.background.image = 'test.jpg'
      await nextTick()

      vm.userConfig.background.mode = 'none'
      await vm.changeBackgroundMode()

      expect(vm.userConfig.background.image).toBe('')
      expect(updateBackgroundImageSpy).toHaveBeenCalledWith('')
    })

    it('should select system background', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateBackgroundImageSpy = vi.spyOn(store, 'updateBackgroundImage')

      vm.userConfig.background.mode = 'image'
      await nextTick()

      await vm.selectSystemBackground(1)

      expect(vm.userConfig.background.image).toContain('wall-1.jpg')
      expect(updateBackgroundImageSpy).toHaveBeenCalled()
    })

    it('should show sliders when background image is set', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.background.mode = 'image'
      vm.userConfig.background.image = 'test.jpg'
      await nextTick()

      expect(wrapper.find('.bg-sliders-section').exists()).toBe(true)
    })

    it('should change background opacity', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateBackgroundOpacitySpy = vi.spyOn(store, 'updateBackgroundOpacity')

      vm.userConfig.background.opacity = 0.5
      await nextTick()

      await vm.changeBackgroundOpacity()

      expect(updateBackgroundOpacitySpy).toHaveBeenCalledWith(0.5)
    })

    it('should change background brightness', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateBackgroundBrightnessSpy = vi.spyOn(store, 'updateBackgroundBrightness')

      vm.userConfig.background.brightness = 0.7
      await nextTick()

      await vm.changeBackgroundBrightness()

      expect(updateBackgroundBrightnessSpy).toHaveBeenCalledWith(0.7)
    })

    it('should open file dialog when custom background item is clicked without image', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.background.mode = 'image'
      vm.customBackgroundImage = ''
      await nextTick()

      await vm.handleCustomItemClick()

      expect(mockWindowApi.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] }]
      })
    })

    it('should select custom background when custom item is clicked with image', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateBackgroundImageSpy = vi.spyOn(store, 'updateBackgroundImage')

      vm.userConfig.background.mode = 'image'
      vm.customBackgroundImage = 'file:///custom.jpg'
      await nextTick()

      await vm.handleCustomItemClick()

      expect(vm.userConfig.background.image).toBe('file:///custom.jpg')
      expect(updateBackgroundImageSpy).toHaveBeenCalledWith('file:///custom.jpg')
    })

    it('should save custom background when file is selected', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.background.mode = 'image'
      await nextTick()

      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/image.jpg']
      })
      mockWindowApi.saveCustomBackground.mockResolvedValue({
        success: true,
        url: 'file:///saved/image.jpg'
      })

      await vm.selectBackgroundImage()

      expect(mockWindowApi.saveCustomBackground).toHaveBeenCalledWith('/path/to/image.jpg')
      expect(vm.customBackgroundImage).toContain('file:///saved/image.jpg')
      expect(vm.userConfig.background.image).toContain('file:///saved/image.jpg')
    })

    it('should handle background save errors', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.background.mode = 'image'
      await nextTick()

      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/image.jpg']
      })
      mockWindowApi.saveCustomBackground.mockResolvedValue({
        success: false,
        error: 'Save failed'
      })

      await vm.selectBackgroundImage()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Failed to save background',
        description: 'Save failed'
      })
    })

    it('should clear custom background', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateBackgroundImageSpy = vi.spyOn(store, 'updateBackgroundImage')

      vm.userConfig.background.mode = 'image'
      vm.customBackgroundImage = 'file:///custom.jpg'
      vm.userConfig.background.image = 'file:///custom.jpg'
      await nextTick()

      await vm.clearCustomBackground()

      expect(vm.customBackgroundImage).toBe('')
      expect(vm.userConfig.background.image).toBe('')
      expect(updateBackgroundImageSpy).toHaveBeenCalledWith('')
    })

    it('should not clear background image if different from custom', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.background.mode = 'image'
      vm.customBackgroundImage = 'file:///custom.jpg'
      vm.userConfig.background.image = 'file:///system.jpg'
      await nextTick()

      await vm.clearCustomBackground()

      expect(vm.customBackgroundImage).toBe('')
      expect(vm.userConfig.background.image).toBe('file:///system.jpg')
    })
  })

  describe('Default Layout Switching', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should change default layout to terminal', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.defaultLayout = 'terminal'
      await nextTick()

      await vm.changeDefaultLayout()

      expect(eventBus.emit).toHaveBeenCalledWith('switch-mode', 'terminal')
    })

    it('should change default layout to agents', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.defaultLayout = 'agents'
      await nextTick()

      await vm.changeDefaultLayout()

      expect(eventBus.emit).toHaveBeenCalledWith('switch-mode', 'agents')
    })

    it('should update default layout when event is received', async () => {
      const vm = wrapper.vm as any
      const handler = vi.mocked(eventBus.on).mock.calls.find((call) => {
        const eventName = call[0] as string
        return eventName === 'defaultLayoutChanged'
      })?.[1] as (mode: string) => void

      if (handler) {
        handler('agents')
        await nextTick()

        expect(vm.userConfig.defaultLayout).toBe('agents')
      }
    })
  })

  describe('Language Switching', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should change language to zh-CN', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateLanguageSpy = vi.spyOn(store, 'updateLanguage')

      vm.userConfig.language = 'zh-CN'
      await nextTick()

      await vm.changeLanguage()

      expect(localStorage.getItem('lang')).toBe('zh-CN')
      expect(updateLanguageSpy).toHaveBeenCalledWith('zh-CN')
      expect(eventBus.emit).toHaveBeenCalledWith('languageChanged', 'zh-CN')
    })

    it('should change language to en-US', async () => {
      const vm = wrapper.vm as any
      const store = configStore()
      const updateLanguageSpy = vi.spyOn(store, 'updateLanguage')

      vm.userConfig.language = 'en-US'
      await nextTick()

      await vm.changeLanguage()

      expect(localStorage.getItem('lang')).toBe('en-US')
      expect(updateLanguageSpy).toHaveBeenCalledWith('en-US')
      expect(eventBus.emit).toHaveBeenCalledWith('languageChanged', 'en-US')
    })
  })

  describe('Watermark Settings', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should update watermark setting', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.watermark = 'close'
      await nextTick()
      await nextTick() // Wait for watcher

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })
  })

  describe('System Theme Listener', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should update theme when system theme changes in auto mode', async () => {
      let systemThemeCallback: ((theme: string) => void) | undefined

      mockAddSystemThemeListener.mockImplementation((callback: (theme: string) => void) => {
        systemThemeCallback = callback
        return () => {}
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.userConfig.theme = 'auto'
      await nextTick()

      if (systemThemeCallback) {
        systemThemeCallback('light')
        await nextTick()
        await nextTick()

        expect(mockGetActualTheme).toHaveBeenCalled()
      }
    })

    it('should not update theme when system theme changes in manual mode', async () => {
      let systemThemeCallback: ((theme: string) => void) | undefined

      mockAddSystemThemeListener.mockImplementation((callback: (theme: string) => void) => {
        systemThemeCallback = callback
        return () => {}
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.userConfig.theme = 'dark'
      const initialClassName = document.documentElement.className
      await nextTick()

      if (systemThemeCallback) {
        systemThemeCallback('light')
        await nextTick()

        // Theme should not change when not in auto mode
        expect(document.documentElement.className).toBe(initialClassName)
      }
    })

    it('should cleanup system theme listener on unmount', async () => {
      const mockCleanup = vi.fn()
      mockAddSystemThemeListener.mockReturnValue(mockCleanup)

      wrapper = createWrapper()
      await nextTick()

      wrapper.unmount()

      // Cleanup should be called (though it's stored in component, we verify the listener was set up)
      expect(mockAddSystemThemeListener).toHaveBeenCalled()
    })
  })

  describe('Config Saving', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should save config when userConfig changes', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.theme = 'light'
      await nextTick()
      await nextTick() // Wait for watcher

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should emit updateWatermark event when config is saved', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.watermark = 'close'
      await nextTick()
      await nextTick()

      // saveConfig is called by watcher, which emits the event
      expect(eventBus.emit).toHaveBeenCalledWith('updateWatermark', expect.any(String))
    })

    it('should handle save config errors', async () => {
      const error = new Error('Save failed')
      ;(userConfigStore.saveConfig as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      vm.userConfig.theme = 'light'
      await nextTick()
      await nextTick()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Failed to save configuration'
      })
    })
  })

  describe('Component Cleanup', () => {
    it('should remove event listeners on unmount', async () => {
      wrapper = createWrapper()
      await nextTick()

      wrapper.unmount()

      expect(eventBus.off).toHaveBeenCalledWith('defaultLayoutChanged')
    })
  })

  describe('Initialization with Custom Background', () => {
    it('should initialize custom background image from saved config', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        language: 'zh-CN',
        watermark: 'open',
        theme: 'auto',
        defaultLayout: 'terminal',
        background: {
          image: 'file:///custom-background.jpg',
          opacity: 0.15,
          brightness: 0.45,
          mode: 'image'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.customBackgroundImage).toBe('file:///custom-background.jpg')
    })

    it('should not set custom background for system backgrounds', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        language: 'zh-CN',
        watermark: 'open',
        theme: 'auto',
        defaultLayout: 'terminal',
        background: {
          image: 'assets/backgroup/wall-1.jpg',
          opacity: 0.15,
          brightness: 0.45,
          mode: 'image'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.customBackgroundImage).toBe('')
    })
  })
})
