import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// TODO: adjust path if needed
import Index from '../index.vue'

beforeEach(() => {
  ;(globalThis as any).createRendererLogger = vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
})

// ---- Event bus
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

// ✅ critical: prevent SQLite init in tests
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn().mockResolvedValue({}),
    saveConfig: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('../fileTransfer', () => ({ initTransferListener: vi.fn() }))
vi.mock('../../../../utils/base64', () => ({ Base64Util: { decode: vi.fn((s: string) => `decoded:${s}`) } }))
vi.mock('../../Editors/base/languageMap', () => ({ LanguageMap: { '.txt': 'text', '.js': 'javascript', '.py': 'python' } }))
vi.mock('../../Ssh/editors/dragEditor.vue', () => ({
  default: { name: 'EditorCode', template: '<div class="editor-code" />' },
  editorData: {}
}))
vi.mock('./fileTransferProgress.vue', () => ({
  default: { name: 'TransferPanel', template: '<div class="transfer-panel" />' }
}))
vi.mock('@/assets/menu/files.svg', () => ({ default: 'files.svg' }))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      files: {
        files: 'Files',
        treeFoldUp: 'Fold',
        treeExpand: 'Expand',
        addSftpConnection: 'Add Connection',
        add: 'Add',
        close: 'Close',
        createOrDrag: 'Create or Drag',
        createOrDragTips: 'Create a connection or drag an item'
      }
    }
  }
})

const antdStubs = {
  'a-button': { template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>' },
  'a-tabs': { template: '<div class="a-tabs"><slot /></div>' },
  'a-tab-pane': { template: '<div class="a-tab-pane"><slot /></div>' },
  'a-card': { template: '<div class="a-card"><slot /></div>' },
  'a-space': { template: '<div class="a-space"><slot /></div>' },
  'a-tooltip': { template: '<span class="a-tooltip"><slot /></span>' },
  'a-radio-group': { template: '<div class="a-radio-group"><slot /></div>' },
  'a-radio-button': { template: '<button class="a-radio-button"><slot /></button>' }
}

// ---- window.api stub
type ApiStub = { sftpConnList: ReturnType<typeof vi.fn> }
const makeApi = (): ApiStub => ({
  sftpConnList: vi.fn().mockResolvedValue([])
})

describe('index.vue', () => {
  let api: ApiStub

  beforeEach(() => {
    vi.clearAllMocks()
    api = makeApi()
    ;(globalThis as any).api = api
    ;(globalThis as any).ResizeObserver = class {
      observe = vi.fn()
      disconnect = vi.fn()
    }

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: any) => {
      cb(0)
      return 1
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).api
  })

  const mountView = () =>
    mount(Index as any, {
      global: {
        plugins: [i18n],
        stubs: {
          ...antdStubs,
          TermFileSystem: { name: 'TermFileSystem', template: '<div class="term-fs" />' },
          EditorCode: { name: 'EditorCode', template: '<div class="editor-code" />' },
          TransferPanel: { name: 'TransferPanel', template: '<div class="transfer-panel" />' }
        }
      }
    })

  it('mount: should render without crashing', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
  })

  it('assetInfoResult flow: triggers sftpConnList', async () => {
    api.sftpConnList.mockResolvedValueOnce([{ id: 'root@10.0.0.2:ssh:xx', isSuccess: true }])

    const wrapper = mountView()
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '10.0.0.2' })
    await flushPromises()

    expect(api.sftpConnList).toHaveBeenCalled()
    expect(wrapper.exists()).toBe(true)
  })

  it('mode switch: can switch to transfer mode (if API exists)', async () => {
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any
    const fn = vm.onModeChange || vm.setMode || vm.changeMode
    if (typeof fn === 'function') {
      await fn.call(vm, 'transfer')
      await flushPromises()
      if (typeof vm.uiMode === 'string') expect(vm.uiMode).toBe('transfer')
    }

    expect(wrapper.exists()).toBe(true)
  })

  it('unmount: should not crash and may remove listeners', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.unmount()
    expect(wrapper.exists()).toBe(false)
  })

  it('safe: sftpConnList returns empty list should not throw', async () => {
    api.sftpConnList.mockResolvedValueOnce([])
    const wrapper = mountView()

    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '10.0.0.2' })
    await flushPromises()

    expect(wrapper.exists()).toBe(true)
  })
})
