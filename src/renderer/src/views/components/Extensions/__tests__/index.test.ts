import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import ExtensionsComponent from '../index.vue'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'
import { getPluginDownload, getPluginIconUrl } from '@/api/plugin/plugin'
import { usePluginStore } from '../usePlugins'

const pluginListRef = ref<any[]>([])
const loadPluginsMock = vi.fn()
const loadStorePluginsMock = vi.fn()
const uninstallLocalPluginMock = vi.fn()

const apiMock = {
  getPathForFile: vi.fn(),
  installPlugin: vi.fn(),
  installPluginFromBuffer: vi.fn(),
  getInstallHint: vi.fn()
}

Object.defineProperty(globalThis, 'createRendererLogger', {
  configurable: true,
  writable: true,
  value: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }))
})

Object.defineProperty(window, 'api', {
  configurable: true,
  writable: true,
  value: apiMock
})

Object.defineProperty(window, 'open', {
  configurable: true,
  writable: true,
  value: vi.fn()
})

vi.mock('@/assets/img/alias.svg', () => ({ default: '/mock/alias.svg' }))
vi.mock('@/assets/img/jumpserver.svg', () => ({ default: '/mock/jumpserver.svg' }))

vi.mock('@/locales', () => {
  const mockT = (key: string) => key
  return {
    default: {
      global: {
        t: mockT
      }
    }
  }
})

vi.mock('ant-design-vue', () => ({
  notification: {
    open: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn()
  }
}))

vi.mock('@/api/plugin/plugin', () => ({
  getPluginDownload: vi.fn(),
  getPluginIconUrl: vi.fn()
}))

vi.mock('../usePlugins', () => ({
  usePluginStore: vi.fn()
}))

describe('Extensions index.vue', () => {
  let wrapper: VueWrapper<any>

  const createWrapper = () =>
    mount(ExtensionsComponent, {
      global: {
        stubs: {
          'search-outlined': true,
          CloudDownloadOutlined: true,
          CloudSyncOutlined: true,
          CrownOutlined: true,
          'a-input': {
            template: `
              <input
                class="a-input"
                :value="value"
                :placeholder="placeholder"
                @input="$emit('update:value', $event.target.value)"
              />
            `,
            props: ['value', 'placeholder'],
            emits: ['update:value']
          },
          'a-menu': {
            template: '<div class="a-menu"><slot /></div>'
          },
          'a-menu-item': {
            template: '<div class="a-menu-item"><slot /></div>'
          },
          'a-button': {
            template: '<button class="a-button" @click="$emit(\'click\', $event)"><slot name="icon" /><slot /></button>',
            props: ['loading'],
            emits: ['click']
          },
          'a-tooltip': {
            template: '<div class="a-tooltip"><slot /></div>'
          },
          'a-tag': {
            template: '<span class="a-tag"><slot /></span>'
          }
        },
        mocks: {
          $t: (key: string) => key
        }
      }
    })

  beforeEach(() => {
    vi.clearAllMocks()
    pluginListRef.value = []
    ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      aliasStatus: 1,
      theme: 'dark'
    })
    ;(usePluginStore as ReturnType<typeof vi.fn>).mockReturnValue({
      pluginList: pluginListRef,
      loadPlugins: loadPluginsMock,
      loadStorePlugins: loadStorePluginsMock,
      uninstallLocalPlugin: uninstallLocalPluginMock
    })
    ;(getPluginIconUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn.example/icon.png')
    ;(getPluginDownload as ReturnType<typeof vi.fn>).mockResolvedValue({
      headers: {
        'content-disposition': 'attachment; filename="pluginA-1.0.0.chaterm"'
      }
    })
    apiMock.getInstallHint.mockResolvedValue(undefined)
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders built-in and store plugins', async () => {
    pluginListRef.value = [
      {
        name: 'Plugin A',
        description: 'desc',
        iconKey: '',
        iconUrl: '',
        tabName: 'Plugin A',
        show: true,
        isPlugin: true,
        pluginId: 'pluginA',
        installed: false,
        hasUpdate: false,
        latestVersion: '1.0.0',
        installable: true
      }
    ]

    wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('Jumpserver Support')
    expect(wrapper.text()).toContain('Alias')
    expect(wrapper.text()).toContain('Plugin A')
  })

  it('shows required tag for required installed plugins', async () => {
    pluginListRef.value = [
      {
        name: 'Enterprise Plugin',
        description: 'desc',
        iconKey: '',
        iconUrl: '',
        tabName: 'Enterprise Plugin',
        show: true,
        isPlugin: true,
        pluginId: 'enterprise-plugin',
        installed: true,
        hasUpdate: false,
        installedVersion: '1.0.0',
        latestVersion: '1.0.0',
        required: true
      }
    ]

    wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('System')
  })

  it('hides Alias when aliasStatus is disabled', async () => {
    ;(userConfigStore.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      aliasStatus: 2,
      theme: 'dark'
    })

    wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).not.toContain('Alias')
  })

  it('emits special route for Alias item', async () => {
    wrapper = createWrapper()
    await nextTick()

    wrapper.vm.handleSelect({ key: 'Alias' })
    await nextTick()

    expect(wrapper.emitted('open-user-tab')?.[0]).toEqual(['aliasConfig'])
  })

  it('emits plugin payload for plugin item', async () => {
    pluginListRef.value = [
      {
        name: 'Plugin A',
        description: 'desc',
        iconKey: '',
        iconUrl: '',
        tabName: 'Plugin A',
        show: true,
        isPlugin: true,
        pluginId: 'pluginA',
        installed: true,
        hasUpdate: false,
        installedVersion: '1.0.0',
        latestVersion: '1.0.0'
      }
    ]

    wrapper = createWrapper()
    await nextTick()

    wrapper.vm.handleSelect({ key: 'pluginA' })
    await nextTick()

    expect(wrapper.emitted('open-user-tab')?.[0]).toEqual([
      {
        key: 'plugins:Plugin A',
        fromLocal: true,
        pluginId: 'pluginA'
      }
    ])
  })

  it('shows error notification when dropped file path cannot be resolved', async () => {
    apiMock.getPathForFile.mockReturnValue(undefined)
    wrapper = createWrapper()
    await nextTick()

    await wrapper.vm.onDrop({
      dataTransfer: { files: [{}] }
    })

    expect(notification.error).toHaveBeenCalledTimes(1)
  })

  it('shows warning for non-chaterm dropped file', async () => {
    apiMock.getPathForFile.mockReturnValue('/tmp/test.zip')
    wrapper = createWrapper()
    await nextTick()

    await wrapper.vm.onDrop({
      dataTransfer: { files: [{}] }
    })

    expect(notification.warning).toHaveBeenCalledTimes(1)
  })

  it('installs plugin from store when install button clicked', async () => {
    pluginListRef.value = [
      {
        name: 'Plugin A',
        description: 'desc',
        iconKey: '',
        iconUrl: '',
        tabName: 'Plugin A',
        show: true,
        isPlugin: true,
        pluginId: 'pluginA',
        installed: false,
        hasUpdate: false,
        latestVersion: '1.0.0',
        installable: true
      }
    ]

    wrapper = createWrapper()
    await nextTick()

    const button = wrapper.find('.a-button')
    await button.trigger('click')
    await nextTick()
    await Promise.resolve()

    expect(getPluginDownload).toHaveBeenCalledWith('pluginA', '1.0.0')
    expect(apiMock.installPluginFromBuffer).toHaveBeenCalled()
    expect(loadPluginsMock).toHaveBeenCalled()
    expect(notification.success).toHaveBeenCalled()
  })

  it('opens pricing url for non-installable plugin subscribe action', async () => {
    pluginListRef.value = [
      {
        name: 'Private Plugin',
        description: 'desc',
        iconKey: '',
        iconUrl: '',
        tabName: 'Private Plugin',
        show: true,
        isPlugin: true,
        pluginId: 'private-plugin',
        installed: false,
        hasUpdate: false,
        latestVersion: '1.0.0',
        installable: false
      }
    ]

    wrapper = createWrapper()
    await nextTick()

    const button = wrapper.find('.a-button')
    await button.trigger('click')

    expect(window.open).toHaveBeenCalledWith('https://github.com/chaterm/Chaterm/discussions/1521', '_blank')
  })
})
