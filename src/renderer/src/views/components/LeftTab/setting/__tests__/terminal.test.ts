import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import TerminalComponent from '../terminal.vue'
import { userConfigStore } from '@/services/userConfigStoreService'

const { mockGetConfig, mockSaveConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('ant-design-vue', () => ({
  notification: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: mockGetConfig,
    saveConfig: mockSaveConfig
  },
  remoteApplyGuard: {
    isApplying: false
  }
}))

Object.defineProperty(globalThis, 'createRendererLogger', {
  value: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })),
  writable: true
})

describe('Terminal Settings Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = () =>
    mount(TerminalComponent, {
      global: {
        plugins: [pinia],
        mocks: {
          $t: (key: string) => key
        },
        stubs: {
          'a-card': { template: '<div><slot /></div>' },
          'a-form': { template: '<form><slot /></form>' },
          'a-form-item': { template: '<div><slot name="label" /><slot /></div>' },
          'a-select': { template: '<div><slot /></div>' },
          'a-select-option': { template: '<div><slot /></div>' },
          'a-input-number': { template: '<input />' },
          'a-switch': { template: '<button />' },
          'a-button': { template: '<button><slot /></button>' },
          'a-modal': { template: '<div><slot /></div>' },
          'a-table': { template: '<div><slot /></div>' },
          'a-input': { template: '<input />' }
        }
      }
    })

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    ;(globalThis as any).window = (globalThis as any).window || {}
    ;(globalThis as any).window.api = {
      getPlatform: vi.fn().mockResolvedValue('darwin'),
      getKeyChainSelect: vi.fn().mockResolvedValue({ data: { keyChain: [] } }),
      listKeys: vi.fn().mockResolvedValue({ keys: [] }),
      removeKey: vi.fn().mockResolvedValue(undefined),
      getKeyChainInfo: vi.fn().mockResolvedValue({}),
      addKey: vi.fn().mockResolvedValue(undefined),
      agentEnableAndConfigure: vi.fn().mockResolvedValue({ success: true })
    }

    mockGetConfig.mockResolvedValue({
      fontSize: 12,
      fontFamily: 'Menlo',
      scrollBack: 1000,
      cursorStyle: 'block'
    })
    mockSaveConfig.mockResolvedValue(undefined)
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  it('loads cursorBlink and lineHeight from saved config', async () => {
    mockGetConfig.mockResolvedValue({
      fontSize: 12,
      fontFamily: 'Menlo',
      scrollBack: 1000,
      cursorStyle: 'underline',
      cursorBlink: false,
      lineHeight: 1.8
    })

    wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    expect(vm.userConfig.cursorStyle).toBe('underline')
    expect(vm.userConfig.cursorBlink).toBe(false)
    expect(vm.userConfig.lineHeight).toBe(1.8)
  })

  it('falls back to defaults when cursorBlink and lineHeight are missing', async () => {
    mockGetConfig.mockResolvedValue({
      fontSize: 12,
      fontFamily: 'Menlo',
      scrollBack: 1000,
      cursorStyle: 'bar'
    })

    wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    expect(vm.userConfig.cursorBlink).toBe(true)
    expect(vm.userConfig.lineHeight).toBe(1)
  })

  it('saveConfig persists cursorBlink and lineHeight', async () => {
    wrapper = createWrapper()
    await nextTick()
    await nextTick()

    vi.mocked(userConfigStore.saveConfig).mockClear()

    const vm = wrapper.vm as any
    vm.userConfig.cursorBlink = false
    vm.userConfig.lineHeight = 2.2

    await vm.saveConfig()

    expect(userConfigStore.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        cursorBlink: false,
        lineHeight: 2.2
      })
    )
  })

  it('handleCursorBlinkChange updates local state', async () => {
    wrapper = createWrapper()
    await nextTick()

    const vm = wrapper.vm as any
    vm.handleCursorBlinkChange(false)

    expect(vm.userConfig.cursorBlink).toBe(false)
  })
})
