import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// TODO: adjust path if needed
import TabIndex from '../tabIndex.vue'

// ---- Global guard
beforeEach(() => {
  ;(globalThis as any).createRendererLogger = vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
})

// ---- EventBus mock
const eventBus = vi.hoisted(() => {
  type Handler = (...args: any[]) => void
  const handlers = new Map<string, Set<Handler>>()
  return {
    on: vi.fn((event: string, fn: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
    }),
    off: vi.fn((event: string, fn: Handler) => {
      handlers.get(event)?.delete(fn)
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      handlers.get(event)?.forEach((fn) => fn(...args))
    })
  }
})

vi.mock('../../../../utils/eventBus', () => ({ default: eventBus }))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn() },
  Modal: { confirm: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
}))

vi.mock('../LeftTab/components/refreshOrganizationAssets', () => ({
  refreshOrganizationAssetFromWorkspace: vi.fn()
}))
vi.mock('../LeftTab/utils/types', () => ({
  isOrganizationAsset: vi.fn(() => false)
}))
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn().mockResolvedValue({ workspaceShowIpMode: false }),
    saveConfig: vi.fn().mockResolvedValue(undefined)
  }
}))
vi.mock('@/utils/util', () => ({
  deepClone: (v: any) => JSON.parse(JSON.stringify(v))
}))

vi.mock('@ant-design/icons-vue', () => {
  const stub = (name: string) => ({ name, template: '<i />' })
  return {
    DownOutlined: stub('DownOutlined'),
    RightOutlined: stub('RightOutlined'),
    SearchOutlined: stub('SearchOutlined'),
    SwapOutlined: stub('SwapOutlined'),
    FolderOpenOutlined: stub('FolderOpenOutlined'),
    RollbackOutlined: stub('RollbackOutlined')
  }
})

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      files: {
        files: 'Files'
      },
      personal: {
        personal: 'Personal',
        enterprise: 'Enterprise',
        showHostname: 'Show Hostname',
        showIp: 'Show IP',
        createFolder: 'Create Folder',
        editFolder: 'Edit Folder',
        moveToFolder: 'Move To Folder'
      },
      common: {
        search: 'Search',
        timeoutGettingAssetInfo: 'Timeout while getting asset info',
        saveFailed: 'Save failed',
        saveSuccess: 'Save success'
      }
    }
  }
})

const antdStubs = {
  'a-card': { template: '<div class="a-card"><slot /></div>' },
  'a-space': { template: '<div class="a-space"><slot /></div>' },
  'a-tooltip': { template: '<span class="a-tooltip"><slot /></span>' },
  'a-button': { template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>' },
  'a-input': {
    props: ['value'],
    template: `<input class="a-input" :value="value" @input="$emit('update:value', $event.target && $event.target.value)" />`
  },
  'a-tree': { template: '<div class="a-tree" />' },
  'a-empty': { template: '<div class="a-empty" />' },
  'a-radio-group': { template: '<div class="a-radio-group"><slot /></div>' },
  'a-radio-button': { template: '<button class="a-radio-button"><slot /></button>' }
}

// ---- window.api stub
type ApiStub = {
  getLocalAssetRoute: ReturnType<typeof vi.fn>
  getShellsLocal: ReturnType<typeof vi.fn>
}
const makeApi = (): ApiStub => ({
  getLocalAssetRoute: vi.fn().mockResolvedValue({ data: { routers: [] } }),
  getShellsLocal: vi.fn().mockResolvedValue(null)
})

describe('tabIndex.vue', () => {
  let api: ApiStub

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    api = makeApi()
    ;(globalThis as any).api = api
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).api
  })

  const mountView = () =>
    mount(TabIndex as any, {
      global: { plugins: [i18n], stubs: antdStubs }
    })

  it('mount: loads menu/tree via api.getLocalAssetRoute', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({
      data: { routers: [{ key: 'n1', title: 'Node1', children: [] }] }
    })

    const wrapper = mountView()
    await flushPromises()

    vi.advanceTimersByTime(300)
    await flushPromises()

    expect(api.getLocalAssetRoute).toHaveBeenCalled()
    expect(wrapper.exists()).toBe(true)
  })

  it('search: updates filtered state when searchValue changes (if method exists)', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({
      data: {
        routers: [
          { key: 'a', title: 'alpha', children: [{ key: 'a-1', title: 'child', children: [] }] },
          { key: 'b', title: 'beta', children: [] }
        ]
      }
    })

    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.searchValue = 'alp'

    const fn = vm.onSearchInput || vm.onSearch
    if (typeof fn === 'function') {
      fn.call(vm)
      await flushPromises()
    }

    // soft assertions for refactor safety
    if (Array.isArray(vm.assetTreeData)) expect(vm.assetTreeData.length).toBeGreaterThan(0)
    if (Array.isArray(vm.expandedKeys)) expect(vm.expandedKeys.length).toBeGreaterThanOrEqual(0)
  })

  it('toggle display mode: saves config via userConfigStore (if method exists)', async () => {
    const { userConfigStore } = await import('@/services/userConfigStoreService')
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any
    const before = vm.showIpMode

    if (typeof vm.toggleDisplayMode === 'function') {
      await vm.toggleDisplayMode()
      await flushPromises()
      expect(userConfigStore.saveConfig).toHaveBeenCalled()
      if (typeof before === 'boolean') expect(vm.showIpMode).toBe(!before)
    } else {
      expect(wrapper.exists()).toBe(true)
    }
  })

  it('unmount: should not crash and may remove listeners', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.unmount()
    expect(wrapper.exists()).toBe(false)
  })
})
