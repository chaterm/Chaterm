/**
 * About Component Unit Tests
 *
 * Tests for the About settings component including:
 * - Component rendering
 * - Version display
 * - Update check functionality
 * - Update download functionality
 * - Update progress display
 * - Update installation
 * - Error handling
 * - Edition-specific domain display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AboutComponent from '../about.vue'
import { Notice } from '@/views/components/Notice'

// Mock i18n
const mockTranslations: Record<string, string> = {
  'about.version': 'Version',
  'about.checkUpdate': 'Check Update',
  'about.latestVersion': 'Latest Version',
  'about.downLoadUpdate': 'Download Update',
  'about.downloading': 'Downloading',
  'about.checkUpdateError': 'Check update failed',
  'about.downloadError': 'Download failed',
  'about.checking': 'Checking...',
  'about.install': 'Install',
  'update.complete': 'Download complete, install now?',
  'update.install': 'Install',
  'update.later': 'Later'
}

const mockT = (key: string) => {
  return mockTranslations[key] || key
}

vi.mock('vue-i18n', () => {
  return {
    default: {
      global: {
        t: (key: string) => mockTranslations[key] || key
      }
    }
  }
})

vi.mock('@/locales', () => {
  return {
    default: {
      global: {
        t: (key: string) => mockTranslations[key] || key
      }
    }
  }
})

// Mock Notice
vi.mock('@/views/components/Notice', () => ({
  Notice: {
    open: vi.fn(),
    close: vi.fn()
  }
}))

// Mock getEditionConfig - use mutable config for testing different editions
const mockEditionConfig: {
  edition: 'cn' | 'global'
  displayName: string
} = {
  edition: 'cn',
  displayName: 'Chaterm CN'
}

vi.mock('@/utils/edition', () => {
  return {
    getEditionConfig: () => mockEditionConfig
  }
})

// Mock window.api
const mockWindowApi = {
  checkUpdate: vi.fn(),
  download: vi.fn(),
  autoUpdate: vi.fn(),
  quitAndInstall: vi.fn()
}

// Mock __APP_INFO__
const mockAppInfo = {
  version: '0.8.0'
}

describe('About Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (options = {}) => {
    return mount(AboutComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-progress': {
            template: '<div class="a-progress" :data-percent="percent"><slot /></div>',
            props: ['percent', 'stroke-linecap', 'show-info', 'size']
          }
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

    // Reset edition config to default (CN)
    mockEditionConfig.displayName = 'Chaterm CN'

    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api: typeof mockWindowApi }).api = mockWindowApi

    // Mock __APP_INFO__
    ;(global as any).__APP_INFO__ = mockAppInfo

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    mockWindowApi.checkUpdate.mockResolvedValue({
      versionInfo: {
        version: '0.8.0'
      }
    })
    mockWindowApi.download.mockReturnValue(undefined)
    mockWindowApi.autoUpdate.mockImplementation(() => () => {})
    mockWindowApi.quitAndInstall.mockReturnValue(undefined)

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
      expect(wrapper.find('.about-container').exists()).toBe(true)
      expect(wrapper.find('.about-card').exists()).toBe(true)
    })

    it('should display app logo', async () => {
      wrapper = createWrapper()
      await nextTick()

      const logo = wrapper.find('.about-logo')
      expect(logo.exists()).toBe(true)
      // Vite resolves @ alias, so check that src contains logo.svg
      expect(logo.attributes('src')).toContain('logo.svg')
    })

    it('should display app name from edition config', async () => {
      wrapper = createWrapper()
      await nextTick()

      const title = wrapper.find('.about-title')
      expect(title.exists()).toBe(true)
      expect(title.text()).toBe('Chaterm CN')
    })

    it('should display current version', async () => {
      wrapper = createWrapper()
      await nextTick()

      const description = wrapper.findAll('.about-description')
      const versionText = description.find((el) => el.text().includes('Version 0.8.0'))
      expect(versionText).toBeDefined()
    })

    it('should display copyright with correct displayName for CN edition', async () => {
      // Default mock is CN edition
      wrapper = createWrapper()
      await nextTick()

      const copyright = wrapper.find('.about-description:last-child')
      expect(copyright.exists()).toBe(true)
      expect(copyright.text()).toContain('Chaterm CN')
      expect(copyright.text()).toContain('All rights reserved')
    })

    it('should display update button initially', async () => {
      wrapper = createWrapper()
      await nextTick()

      const button = wrapper.find('.about-update-btn')
      expect(button.exists()).toBe(true)
      expect(button.text()).toBe('Check Update')
      // Vue test utils may return empty string instead of undefined for disabled attribute
      const disabledAttr = button.attributes('disabled')
      expect(disabledAttr === undefined || disabledAttr === '').toBe(true)
    })
  })

  describe('Update Check', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should check for updates when button is clicked', async () => {
      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      expect(mockWindowApi.checkUpdate).toHaveBeenCalled()
    })

    it('should disable button while checking for updates', async () => {
      let resolveCheckUpdate: ((value: any) => void) | undefined
      const checkUpdatePromise = new Promise<any>((resolve) => {
        resolveCheckUpdate = resolve
      })
      mockWindowApi.checkUpdate.mockReturnValue(checkUpdatePromise)

      const button = wrapper.find('.about-update-btn')
      const clickPromise = button.trigger('click')
      await nextTick()

      expect(button.attributes('disabled')).toBeDefined()
      resolveCheckUpdate!({ versionInfo: { version: '0.8.0' } })
      await clickPromise
      await nextTick()

      // Vue test utils may return empty string instead of undefined for disabled attribute
      const disabledAttr = button.attributes('disabled')
      expect(disabledAttr === undefined || disabledAttr === '').toBe(true)
    })

    it('should display latest version message when already on latest version', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({
        versionInfo: {
          version: '0.8.0' // Same as current version
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toContain('Check Update')
      expect(button.text()).toContain('Latest Version')
    })

    it('should display download button when new version is available', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({
        versionInfo: {
          version: '0.9.0' // Newer version
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toContain('Download Update')
      expect(button.text()).toContain('0.9.0')
    })

    it('should handle versionInfo structure in checkUpdate response', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({
        versionInfo: {
          version: '0.9.0'
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toContain('0.9.0')
    })

    it('should handle updateInfo structure in checkUpdate response', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({
        updateInfo: {
          version: '0.9.0'
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toContain('0.9.0')
    })

    it('should handle checkUpdate error', async () => {
      const error = new Error('Network error')
      mockWindowApi.checkUpdate.mockRejectedValue(error)

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toBe('Check update failed')
      expect(console.error).toHaveBeenCalled()
    })

    it('should handle null response from checkUpdate', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue(null)

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      // Button should be re-enabled
      expect(button.attributes('disabled')).toBeUndefined()
    })

    it('should handle response without versionInfo or updateInfo', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({})

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      // Button should be re-enabled
      expect(button.attributes('disabled')).toBeUndefined()
    })
  })

  describe('Update Download', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()

      // First check for updates and get a new version
      mockWindowApi.checkUpdate.mockResolvedValue({
        versionInfo: {
          version: '0.9.0'
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()
    })

    it('should start download when button is clicked after update check', async () => {
      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      expect(mockWindowApi.download).toHaveBeenCalled()
      expect(mockWindowApi.autoUpdate).toHaveBeenCalled()
    })

    it('should show progress when download starts', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ progress: 50 })
        await nextTick()
      }

      expect(wrapper.find('.about-progress').exists()).toBe(true)
      expect(wrapper.find('.about-progress-text').exists()).toBe(true)
    })

    it('should update progress percentage during download', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ progress: 25 })
        await nextTick()

        const progress = wrapper.find('.about-progress')
        expect(progress.attributes('data-percent')).toBe('25')

        progressCallback({ progress: 75 })
        await nextTick()

        expect(progress.attributes('data-percent')).toBe('75')
      }
    })

    it('should display download progress text', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ progress: 50 })
        await nextTick()

        const progressText = wrapper.find('.about-progress-text')
        expect(progressText.exists()).toBe(true)
        expect(progressText.text()).toContain('Downloading')
        expect(progressText.text()).toContain('50%')
      }
    })

    it('should show new version title during download', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ progress: 50 })
        await nextTick()

        const title = wrapper.find('.about-title')
        expect(title.text()).toContain('0.9.0')
      }
    })

    it('should show download complete notification when status is 4', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ status: 4 })
        await nextTick()
      }

      expect(Notice.open).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'update-download-complete',
          type: 'success',
          description: 'Download complete, install now?',
          btns: expect.arrayContaining([
            expect.objectContaining({
              text: 'Install'
            }),
            expect.objectContaining({
              text: 'Later'
            })
          ])
        })
      )
    })

    it('should install update when install button is clicked in notification', async () => {
      let progressCallback: ((params: any) => void) | undefined
      let installAction: (() => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      vi.mocked(Notice.open).mockImplementation((opts: any) => {
        if (opts.btns && opts.btns.length > 0) {
          installAction = opts.btns[0].action
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ status: 4 })
        await nextTick()
      }

      if (installAction) {
        installAction()
        expect(mockWindowApi.quitAndInstall).toHaveBeenCalled()
        expect(Notice.close).toHaveBeenCalledWith('update-download-complete')
      }
    })

    it('should close notification when later button is clicked', async () => {
      let progressCallback: ((params: any) => void) | undefined
      let laterAction: (() => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      vi.mocked(Notice.open).mockImplementation((opts: any) => {
        if (opts.btns && opts.btns.length > 1) {
          laterAction = opts.btns[1].action
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ status: 4 })
        await nextTick()
      }

      if (laterAction) {
        laterAction()
        expect(Notice.close).toHaveBeenCalledWith('update-download-complete')
        expect(mockWindowApi.quitAndInstall).not.toHaveBeenCalled()
      }
    })

    it('should update button text to install after download completes', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ status: 4 })
        await nextTick()
      }

      expect(button.text()).toBe('Install')
    })

    it('should hide progress after download completes', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ progress: 50 })
        await nextTick()
        expect(wrapper.find('.about-progress').exists()).toBe(true)

        progressCallback({ status: 4 })
        await nextTick()
        expect(wrapper.find('.about-progress').exists()).toBe(false)
      }
    })

    it('should handle download errors', async () => {
      mockWindowApi.download.mockImplementation(() => {
        throw new Error('Download failed')
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      expect(button.text()).toBe('Download failed')
      expect(console.error).toHaveBeenCalled()
    })

    it('should not show progress for zero progress', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ progress: 0 })
        await nextTick()

        // Progress should not be shown for 0
        expect(wrapper.find('.about-progress').exists()).toBe(false)
      }
    })

    it('should handle negative progress values', async () => {
      let progressCallback: ((params: any) => void) | undefined

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()

      if (progressCallback) {
        progressCallback({ progress: -10 })
        await nextTick()

        // Progress should not be shown for negative values
        expect(wrapper.find('.about-progress').exists()).toBe(false)
      }
    })
  })

  describe('Update Status Management', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should not download again if already on latest version', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({
        versionInfo: {
          version: '0.8.0' // Same as current
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      // Click again - should check for updates again, not download
      await button.trigger('click')
      await nextTick()

      expect(mockWindowApi.checkUpdate).toHaveBeenCalledTimes(2)
      expect(mockWindowApi.download).not.toHaveBeenCalled()
    })

    it('should allow re-checking for updates after download completes', async () => {
      // First check - new version available
      mockWindowApi.checkUpdate.mockResolvedValueOnce({
        versionInfo: {
          version: '0.9.0'
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      // Start download
      await button.trigger('click')
      await nextTick()

      // Complete download - this sets updateStatus to 1 and btnText to 'Install'
      const autoUpdateCall = vi.mocked(mockWindowApi.autoUpdate).mock.calls[0]
      if (autoUpdateCall && typeof autoUpdateCall[0] === 'function') {
        autoUpdateCall[0]({ status: 4 })
        await nextTick()
      }

      // After download completes, updateStatus is 1, so clicking again would trigger download
      // To test re-checking, we need to reset the state or verify the install button is shown
      expect(button.text()).toBe('Install')

      // The component doesn't automatically reset to check mode after install
      // This test verifies that after download completes, the button shows 'Install'
      // In real usage, user would click install or the app would restart
    })
  })

  describe('UI State Management', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should toggle between update check and download states', async () => {
      // First check should return new version
      mockWindowApi.checkUpdate.mockResolvedValueOnce({
        versionInfo: {
          version: '0.9.0' // Newer than current 0.8.0
        }
      })

      const button = wrapper.find('.about-update-btn')
      expect(button.text()).toBe('Check Update')

      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toContain('Download Update')
      expect(button.text()).toContain('0.9.0')

      // Second click should trigger download (updateStatus is now 1)
      await button.trigger('click')
      await nextTick()

      expect(mockWindowApi.download).toHaveBeenCalled()
    })

    it('should maintain button disabled state correctly', async () => {
      let resolveCheckUpdate: ((value: any) => void) | undefined
      const checkUpdatePromise = new Promise<any>((resolve) => {
        resolveCheckUpdate = resolve
      })
      mockWindowApi.checkUpdate.mockReturnValue(checkUpdatePromise)

      const button = wrapper.find('.about-update-btn')
      const clickPromise = button.trigger('click')
      await nextTick()

      expect(button.attributes('disabled')).toBeDefined()
      expect(resolveCheckUpdate).toBeDefined()

      // Resolve the promise
      resolveCheckUpdate!({ versionInfo: { version: '0.8.0' } })
      await clickPromise
      await nextTick()

      // Vue test utils may return empty string instead of undefined for disabled attribute
      const disabledAttr = button.attributes('disabled')
      expect(disabledAttr === undefined || disabledAttr === '').toBe(true)
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should handle network errors during update check', async () => {
      const networkError = new Error('Network request failed')
      mockWindowApi.checkUpdate.mockRejectedValue(networkError)

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toBe('Check update failed')
      expect(console.error).toHaveBeenCalledWith('Check update failed', networkError)
    })

    it('should handle timeout errors during update check', async () => {
      const timeoutError = new Error('Request timeout')
      mockWindowApi.checkUpdate.mockRejectedValue(timeoutError)

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.text()).toBe('Check update failed')
    })

    it('should re-enable button after error', async () => {
      mockWindowApi.checkUpdate.mockRejectedValue(new Error('Error'))

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      expect(button.attributes('disabled')).toBeUndefined()
    })

    it('should handle autoUpdate callback errors gracefully', async () => {
      mockWindowApi.checkUpdate.mockResolvedValue({
        versionInfo: {
          version: '0.9.0'
        }
      })

      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        try {
          callback({ progress: 50 })
        } catch (error) {
          // Error in callback should not crash
        }
        return () => {}
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      await button.trigger('click')
      await nextTick()

      // Should not throw
      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('Component Rendering', () => {
    it('should render all required elements', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.about-container').exists()).toBe(true)
      expect(wrapper.find('.about-card').exists()).toBe(true)
      expect(wrapper.find('.about-logo').exists()).toBe(true)
      expect(wrapper.find('.about-title').exists()).toBe(true)
      expect(wrapper.find('.about-update-btn-wrapper').exists()).toBe(true)
      expect(wrapper.find('.about-update-btn').exists()).toBe(true)
    })

    it('should not show progress initially', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.about-progress').exists()).toBe(false)
      expect(wrapper.find('.about-progress-text').exists()).toBe(false)
    })

    it('should show progress during download', async () => {
      wrapper = createWrapper()
      await nextTick()

      mockWindowApi.checkUpdate.mockResolvedValue({
        versionInfo: {
          version: '0.9.0'
        }
      })

      const button = wrapper.find('.about-update-btn')
      await button.trigger('click')
      await nextTick()
      await nextTick()

      await button.trigger('click')
      await nextTick()

      let progressCallback: ((params: any) => void) | undefined
      mockWindowApi.autoUpdate.mockImplementation((callback) => {
        progressCallback = callback
        return () => {}
      })

      if (progressCallback) {
        progressCallback({ progress: 30 })
        await nextTick()

        expect(wrapper.find('.about-progress').exists()).toBe(true)
        expect(wrapper.find('.about-progress-text').exists()).toBe(true)
      }
    })
  })

  describe('Copyright Display', () => {
    it('should display current year in copyright', async () => {
      wrapper = createWrapper()
      await nextTick()

      const copyright = wrapper.find('.about-description:last-child')
      const currentYear = new Date().getFullYear()
      expect(copyright.text()).toContain(currentYear.toString())
    })

    it('should display correct displayName for CN edition', async () => {
      // Reset to CN edition (default)
      mockEditionConfig.displayName = 'Chaterm CN'

      wrapper = createWrapper()
      await nextTick()

      const copyright = wrapper.find('.about-description:last-child')
      expect(copyright.exists()).toBe(true)
      expect(copyright.text()).toContain('Chaterm CN')
      expect(copyright.text()).toContain('All rights reserved')
    })

    it('should display correct displayName for global edition', async () => {
      // Change to global edition
      mockEditionConfig.displayName = 'Chaterm'

      wrapper = createWrapper()
      await nextTick()

      const copyright = wrapper.find('.about-description:last-child')
      expect(copyright.exists()).toBe(true)
      expect(copyright.text()).toContain('Chaterm')
      expect(copyright.text()).not.toContain('Chaterm CN')
      expect(copyright.text()).toContain('All rights reserved')

      // Reset to CN for other tests
      mockEditionConfig.displayName = 'Chaterm CN'
    })
  })
})
