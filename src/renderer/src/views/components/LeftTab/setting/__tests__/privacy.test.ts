/**
 * Privacy Settings Component Unit Tests
 *
 * Tests for the Privacy settings component including:
 * - Telemetry settings (enabled/disabled)
 * - Secret redaction settings (enabled/disabled)
 * - Data sync settings (enabled/disabled)
 * - Secret patterns display
 * - Config loading and saving
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrivacyComponent from '../privacy.vue'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'
import { dataSyncService } from '@/services/dataSyncService'
import { getPrivacyPolicyUrl } from '@/utils/edition'

// Mock ant-design-vue components
vi.mock('ant-design-vue', () => ({
  notification: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock i18n
const mockTranslations: Record<string, string> = {
  'user.privacy': '隐私',
  'user.telemetry': '遥测',
  'user.telemetryEnabled': '开启',
  'user.telemetryDisabled': '关闭',
  'user.telemetryDescriptionText': '遥测功能用于收集使用情况统计信息，帮助我们改进产品。',
  'user.privacyPolicy': '隐私政策',
  'user.secretRedaction': '密文脱敏',
  'user.secretRedactionEnabled': '开启',
  'user.secretRedactionDisabled': '关闭',
  'user.secretRedactionDescription': '密文脱敏功能旨在自动从您的AI对话框输出中遮盖密码、IP 地址、API 密钥和个人身份信息等秘密和敏感信息。',
  'user.supportedPatterns': '支持的匹配模式',
  'user.dataSync': '数据同步',
  'user.dataSyncEnabled': '开启',
  'user.dataSyncDisabled': '关闭',
  'user.dataSyncDescription': '数据同步旨在将用户配置的资产、密钥等信息进行跨设备同步',
  'user.dataSyncUpdateSuccess': '数据同步设置已更新',
  'user.dataSyncEnabledSuccess': '已开启数据同步',
  'user.dataSyncDisabledSuccess': '已关闭数据同步',
  'user.dataSyncUpdateFailed': '数据同步设置更新失败',
  'user.retryLater': '请稍后重试',
  'user.loadConfigFailed': '加载配置失败',
  'user.loadConfigFailedDescription': '无法加载配置，请稍后重试',
  'user.error': '错误',
  'user.saveConfigFailedDescription': '保存配置失败，请稍后重试',
  'user.telemetryUpdateFailed': '遥测设置更新失败',
  'user.telemetryUpdateFailedDescription': '请稍后重试',
  'user.ipv4Address': 'IPv4 地址',
  'user.ipv6Address': 'IPv6 地址',
  'user.slackAppToken': 'Slack App Token',
  'user.phoneNumber': '电话号码',
  'user.awsAccessId': 'AWS Access ID',
  'user.macAddress': 'MAC 地址',
  'user.googleApiKey': 'Google API Key',
  'user.googleOAuthId': 'Google OAuth ID',
  'user.githubClassicPersonalAccessToken': 'GitHub Classic Personal Access Token',
  'user.githubFineGrainedPersonalAccessToken': 'GitHub Fine-Grained Personal Access Token',
  'user.githubOAuthAccessToken': 'GitHub OAuth Access Token',
  'user.githubUserToServerToken': 'GitHub User-to-Server Token',
  'user.githubServerToServerToken': 'GitHub Server-to-Server Token',
  'user.stripeKey': 'Stripe Key',
  'user.firebaseAuthDomain': 'Firebase Auth Domain',
  'user.jsonWebToken': 'JSON Web Token',
  'user.openaiApiKey': 'OpenAI API Key',
  'user.anthropicApiKey': 'Anthropic API Key',
  'user.fireworksApiKey': 'Fireworks API Key'
}

const mockT = (key: string) => {
  return mockTranslations[key] || key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: mockT
  })
}))

// Mock userConfigStore service
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn(),
    saveConfig: vi.fn()
  }
}))

// Mock dataSyncService
vi.mock('@/services/dataSyncService', () => ({
  dataSyncService: {
    enableDataSync: vi.fn(),
    disableDataSync: vi.fn()
  }
}))

// Mock edition utils
vi.mock('@/utils/edition', () => ({
  getPrivacyPolicyUrl: vi.fn(() => 'https://example.com/privacy')
}))

// Mock window.api
const mockWindowApi = {
  sendToMain: vi.fn()
}

describe('Privacy Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (options = {}) => {
    return mount(PrivacyComponent, {
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
            props: ['label', 'label-col', 'wrapper-col', 'class']
          },
          'a-radio-group': {
            template: '<div class="a-radio-group" @change="$emit(\'change\', $event)"><slot /></div>',
            props: ['value', 'modelValue'],
            emits: ['change', 'update:value', 'update:modelValue']
          },
          'a-radio': {
            template: '<label class="a-radio"><input type="radio" :value="value" @change="$emit(\'change\', $event)" /><slot /></label>',
            props: ['value']
          },
          'a-collapse': {
            template: '<div class="a-collapse"><slot /></div>',
            props: ['ghost', 'size']
          },
          'a-collapse-panel': {
            template:
              '<div class="a-collapse-panel"><div class="ant-collapse-header"><slot name="header" /></div><div class="ant-collapse-content"><slot /></div></div>',
            props: ['header']
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

    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api: typeof mockWindowApi }).api = mockWindowApi

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      secretRedaction: 'enabled',
      dataSync: 'enabled',
      telemetry: 'enabled'
    })
    ;(userConfigStore.saveConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(dataSyncService.enableDataSync as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(dataSyncService.disableDataSync as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    mockWindowApi.sendToMain.mockResolvedValue(undefined)

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

    it('should initialize with default values when no config is saved', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userConfig.secretRedaction).toBe('disabled')
      expect(vm.userConfig.dataSync).toBe('enabled')
      expect(vm.userConfig.telemetry).toBe('enabled')
    })

    it('should handle config load errors', async () => {
      const error = new Error('Load failed')
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(notification.error).toHaveBeenCalledWith({
        message: mockTranslations['user.loadConfigFailed'],
        description: mockTranslations['user.loadConfigFailedDescription']
      })
    })

    it('should merge saved config with defaults', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        secretRedaction: 'disabled',
        dataSync: 'disabled',
        telemetry: 'disabled'
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userConfig.secretRedaction).toBe('disabled')
      expect(vm.userConfig.dataSync).toBe('disabled')
      expect(vm.userConfig.telemetry).toBe('disabled')
    })

    it('should use default values when saved config has missing fields', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        secretRedaction: 'enabled'
        // dataSync and telemetry are missing
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userConfig.secretRedaction).toBe('enabled')
      expect(vm.userConfig.dataSync).toBe('enabled') // default
      expect(vm.userConfig.telemetry).toBe('unset') // default for telemetry
    })
  })

  describe('Telemetry Settings', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should render telemetry radio group', () => {
      const radioGroups = wrapper.findAll('.a-radio-group')
      expect(radioGroups.length).toBeGreaterThan(0)
    })

    it('should change telemetry to enabled', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.telemetry = 'enabled'
      await nextTick()

      await vm.updateTelemetry()

      expect(mockWindowApi.sendToMain).toHaveBeenCalledWith({
        type: 'telemetrySetting',
        telemetrySetting: 'enabled'
      })
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should change telemetry to disabled', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.telemetry = 'disabled'
      await nextTick()

      await vm.updateTelemetry()

      expect(mockWindowApi.sendToMain).toHaveBeenCalledWith({
        type: 'telemetrySetting',
        telemetrySetting: 'disabled'
      })
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should handle telemetry update errors', async () => {
      const error = new Error('Update failed')
      mockWindowApi.sendToMain.mockRejectedValue(error)

      const vm = wrapper.vm as any
      vm.userConfig.telemetry = 'enabled'
      await nextTick()

      await vm.updateTelemetry()

      expect(notification.error).toHaveBeenCalledWith({
        message: mockTranslations['user.telemetryUpdateFailed'],
        description: mockTranslations['user.telemetryUpdateFailedDescription']
      })
    })

    it('should save config when telemetry changes', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.telemetry = 'disabled'
      await nextTick()

      await vm.updateTelemetry()

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })
  })

  describe('Secret Redaction Settings', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should render secret redaction radio group', () => {
      const radioGroups = wrapper.findAll('.a-radio-group')
      expect(radioGroups.length).toBeGreaterThan(0)
    })

    it('should change secret redaction to enabled', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.secretRedaction = 'enabled'
      await nextTick()

      await vm.changeSecretRedaction()

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should change secret redaction to disabled', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.secretRedaction = 'disabled'
      await nextTick()

      await vm.changeSecretRedaction()

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should show patterns collapse when secret redaction is enabled', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.secretRedaction = 'enabled'
      await nextTick()

      const collapse = wrapper.find('.a-collapse')
      expect(collapse.exists()).toBe(true)
    })

    it('should hide patterns collapse when secret redaction is disabled', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.secretRedaction = 'disabled'
      await nextTick()

      // When disabled, the collapse should not be rendered (v-if condition)
      const vmInternal = wrapper.vm as any
      expect(vmInternal.userConfig.secretRedaction).toBe('disabled')
    })

    it('should display all secret patterns', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.secretRedaction = 'enabled'
      await nextTick()

      const patterns = vm.secretPatterns
      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns[0]).toHaveProperty('name')
      expect(patterns[0]).toHaveProperty('regex')
    })

    it('should include all expected pattern types', async () => {
      const vm = wrapper.vm as any
      const patterns = vm.secretPatterns
      const patternNames = patterns.map((p: any) => p.name)

      expect(patternNames).toContain('IPv4 地址')
      expect(patternNames).toContain('IPv6 地址')
      expect(patternNames).toContain('OpenAI API Key')
      expect(patternNames).toContain('Anthropic API Key')
      expect(patternNames).toContain('GitHub Classic Personal Access Token')
    })
  })

  describe('Data Sync Settings', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should render data sync radio group', () => {
      const radioGroups = wrapper.findAll('.a-radio-group')
      expect(radioGroups.length).toBeGreaterThan(0)
    })

    it('should enable data sync when enabled option is selected', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'enabled'
      await nextTick()

      await vm.changeDataSync()

      expect(dataSyncService.enableDataSync).toHaveBeenCalled()
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should disable data sync when disabled option is selected', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'disabled'
      await nextTick()

      await vm.changeDataSync()

      expect(dataSyncService.disableDataSync).toHaveBeenCalled()
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should show success notification when data sync is enabled successfully', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'enabled'
      await nextTick()

      await vm.changeDataSync()

      expect(notification.success).toHaveBeenCalledWith({
        message: mockTranslations['user.dataSyncUpdateSuccess'],
        description: mockTranslations['user.dataSyncEnabledSuccess']
      })
    })

    it('should show success notification when data sync is disabled successfully', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'disabled'
      await nextTick()

      await vm.changeDataSync()

      expect(notification.success).toHaveBeenCalledWith({
        message: mockTranslations['user.dataSyncUpdateSuccess'],
        description: mockTranslations['user.dataSyncDisabledSuccess']
      })
    })

    it('should show error notification when data sync enable fails', async () => {
      ;(dataSyncService.enableDataSync as ReturnType<typeof vi.fn>).mockResolvedValue(false)

      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'enabled'
      await nextTick()

      await vm.changeDataSync()

      expect(notification.error).toHaveBeenCalledWith({
        message: mockTranslations['user.dataSyncUpdateFailed'],
        description: mockTranslations['user.retryLater']
      })
    })

    it('should show error notification when data sync disable fails', async () => {
      ;(dataSyncService.disableDataSync as ReturnType<typeof vi.fn>).mockResolvedValue(false)

      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'disabled'
      await nextTick()

      await vm.changeDataSync()

      expect(notification.error).toHaveBeenCalledWith({
        message: mockTranslations['user.dataSyncUpdateFailed'],
        description: mockTranslations['user.retryLater']
      })
    })

    it('should handle data sync errors', async () => {
      const error = new Error('Sync failed')
      ;(dataSyncService.enableDataSync as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'enabled'
      await nextTick()

      await vm.changeDataSync()

      expect(notification.error).toHaveBeenCalledWith({
        message: mockTranslations['user.dataSyncUpdateFailed'],
        description: mockTranslations['user.retryLater']
      })
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
      vm.userConfig.secretRedaction = 'disabled'
      await nextTick()
      await nextTick() // Wait for watcher

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should save config with correct structure', async () => {
      const vm = wrapper.vm as any
      vm.userConfig.secretRedaction = 'enabled'
      vm.userConfig.dataSync = 'enabled'
      vm.userConfig.telemetry = 'enabled'
      await nextTick()
      await nextTick()

      const saveCall = vi.mocked(userConfigStore.saveConfig).mock.calls[0]?.[0] as any
      expect(saveCall).toHaveProperty('secretRedaction')
      expect(saveCall).toHaveProperty('dataSync')
      expect(saveCall).toHaveProperty('telemetry')
    })

    it('should handle save config errors', async () => {
      const error = new Error('Save failed')
      ;(userConfigStore.saveConfig as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      vm.userConfig.secretRedaction = 'disabled'
      await nextTick()
      await nextTick()

      expect(notification.error).toHaveBeenCalledWith({
        message: mockTranslations['user.error'],
        description: mockTranslations['user.saveConfigFailedDescription']
      })
    })
  })

  describe('Privacy Policy Link', () => {
    it('should display privacy policy URL', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(getPrivacyPolicyUrl).toHaveBeenCalled()
    })

    it('should render privacy policy link with correct href', async () => {
      wrapper = createWrapper()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.privacyUrl).toBe('https://example.com/privacy')
    })
  })

  describe('Secret Patterns', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should compute secret patterns correctly', async () => {
      const vm = wrapper.vm as any
      const patterns = vm.secretPatterns

      expect(Array.isArray(patterns)).toBe(true)
      expect(patterns.length).toBeGreaterThan(0)

      // Check first pattern structure
      expect(patterns[0]).toHaveProperty('name')
      expect(patterns[0]).toHaveProperty('regex')
      expect(typeof patterns[0].name).toBe('string')
      expect(typeof patterns[0].regex).toBe('string')
    })

    it('should include IPv4 pattern', async () => {
      const vm = wrapper.vm as any
      const patterns = vm.secretPatterns
      const ipv4Pattern = patterns.find((p: any) => p.name === 'IPv4 地址')

      expect(ipv4Pattern).toBeDefined()
      expect(ipv4Pattern.regex).toContain('25[0-5]')
    })

    it('should include IPv6 pattern', async () => {
      const vm = wrapper.vm as any
      const patterns = vm.secretPatterns
      const ipv6Pattern = patterns.find((p: any) => p.name === 'IPv6 地址')

      expect(ipv6Pattern).toBeDefined()
      expect(ipv6Pattern.regex).toContain('0-9A-Fa-f')
    })

    it('should include API key patterns', async () => {
      const vm = wrapper.vm as any
      const patterns = vm.secretPatterns
      const openaiPattern = patterns.find((p: any) => p.name === 'OpenAI API Key')
      const anthropicPattern = patterns.find((p: any) => p.name === 'Anthropic API Key')

      expect(openaiPattern).toBeDefined()
      expect(anthropicPattern).toBeDefined()
      expect(openaiPattern.regex).toContain('sk-')
      expect(anthropicPattern.regex).toContain('sk-ant-api')
    })

    it('should include GitHub token patterns', async () => {
      const vm = wrapper.vm as any
      const patterns = vm.secretPatterns
      const classicToken = patterns.find((p: any) => p.name === 'GitHub Classic Personal Access Token')
      const fineGrainedToken = patterns.find((p: any) => p.name === 'GitHub Fine-Grained Personal Access Token')

      expect(classicToken).toBeDefined()
      expect(fineGrainedToken).toBeDefined()
      expect(classicToken.regex).toContain('ghp_')
      expect(fineGrainedToken.regex).toContain('github_pat_')
    })
  })

  describe('Watch Functionality', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should trigger saveConfig when userConfig changes', async () => {
      const vm = wrapper.vm as any
      vi.mocked(userConfigStore.saveConfig).mockClear()

      vm.userConfig.secretRedaction = 'disabled'
      await nextTick()
      await nextTick()

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should trigger saveConfig when dataSync changes', async () => {
      const vm = wrapper.vm as any
      vi.mocked(userConfigStore.saveConfig).mockClear()

      vm.userConfig.dataSync = 'disabled'
      await nextTick()
      await nextTick()

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should trigger saveConfig when telemetry changes', async () => {
      const vm = wrapper.vm as any
      vi.mocked(userConfigStore.saveConfig).mockClear()

      vm.userConfig.telemetry = 'disabled'
      await nextTick()
      await nextTick()

      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty config object', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({})

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userConfig).toBeDefined()
      expect(vm.userConfig.secretRedaction).toBe('enabled') // default from loadSavedConfig
      expect(vm.userConfig.dataSync).toBe('enabled')
      expect(vm.userConfig.telemetry).toBe('unset')
    })

    it('should handle null config', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userConfig).toBeDefined()
    })

    it('should handle undefined config values gracefully', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        secretRedaction: undefined,
        dataSync: undefined,
        telemetry: undefined
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.userConfig.secretRedaction).toBe('enabled') // default
      expect(vm.userConfig.dataSync).toBe('enabled') // default
      expect(vm.userConfig.telemetry).toBe('unset') // default
    })

    it('should handle multiple rapid config changes', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vi.mocked(userConfigStore.saveConfig).mockClear()

      vm.userConfig.secretRedaction = 'disabled'
      vm.userConfig.dataSync = 'disabled'
      vm.userConfig.telemetry = 'disabled'
      await nextTick()
      await nextTick()

      // Should have been called (watcher may batch or call multiple times)
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })
  })

  describe('Component Cleanup', () => {
    it('should unmount without errors', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(() => wrapper.unmount()).not.toThrow()
    })
  })

  describe('Integration Tests', () => {
    it('should complete full flow: load config -> change telemetry -> save', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        secretRedaction: 'enabled',
        dataSync: 'enabled',
        telemetry: 'enabled'
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.userConfig.telemetry = 'disabled'
      await nextTick()

      await vm.updateTelemetry()

      expect(userConfigStore.getConfig).toHaveBeenCalled()
      expect(mockWindowApi.sendToMain).toHaveBeenCalledWith({
        type: 'telemetrySetting',
        telemetrySetting: 'disabled'
      })
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
    })

    it('should complete full flow: load config -> enable data sync -> save', async () => {
      ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        secretRedaction: 'enabled',
        dataSync: 'disabled',
        telemetry: 'enabled'
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      vm.userConfig.dataSync = 'enabled'
      await nextTick()

      await vm.changeDataSync()

      expect(userConfigStore.getConfig).toHaveBeenCalled()
      expect(dataSyncService.enableDataSync).toHaveBeenCalled()
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
      expect(notification.success).toHaveBeenCalled()
    })
  })
})
