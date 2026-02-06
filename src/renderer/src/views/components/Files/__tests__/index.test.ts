import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// Event bus mock must be created via vi.hoisted because vi.mock factories are hoisted.
// Do NOT reference regular top-level variables from vi.mock factories (TDZ).
const eventBus = vi.hoisted(() => {
  type EventHandler = (...args: any[]) => void

  const handlers = new Map<string, Set<EventHandler>>()

  return {
    on: vi.fn((event: string, fn: EventHandler) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
    }),

    off: vi.fn((event: string, fn: EventHandler) => {
      handlers.get(event)?.delete(fn)
    }),

    emit: vi.fn((event: string, ...args: any[]) => {
      handlers.get(event)?.forEach((fn) => fn(...args))
    }),

    // helpers for tests
    __handlers: handlers
  }
})

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      loading: vi.fn()
    },
    Modal: {
      confirm: vi.fn()
    }
  }
})

// Mock deps used by index.vue.
// IMPORTANT: these paths are resolved from this test file location.
vi.mock('../../../../utils/eventBus', () => ({ default: eventBus }))
vi.mock('../fileTransfer', () => ({ initTransferListener: vi.fn() }))
vi.mock('../../../../utils/base64', () => ({ Base64Util: { decode: vi.fn(() => 'decoded-host') } }))
vi.mock('../../Editors/base/languageMap', () => ({ LanguageMap: { '.python': 'python', '.txt': 'text' } }))
vi.mock('../../Ssh/editors/dragEditor.vue', () => ({
  default: { name: 'EditorCode', template: '<div />' },
  editorData: {}
}))
vi.mock('@/assets/menu/files.svg', () => ({ default: 'files.svg' }))
vi.mock('@ant-design/icons-vue', () => ({
  DownOutlined: { name: 'DownOutlined', template: '<i />' },
  RightOutlined: { name: 'RightOutlined', template: '<i />' }
}))

import { message } from 'ant-design-vue'
// @ts-ignore
import Index from '../index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: {
        timeoutGettingAssetInfo: 'timeout',
        errorGettingAssetInfo: 'error',
        saveFailed: 'Save failed',
        saveSuccess: 'Save success',
        permissionDenied: 'Permission denied',
        saveConfirmTitle: 'Save?',
        saveConfirmContent: 'Save {filePath}?',
        confirm: 'Confirm',
        cancel: 'Cancel'
      },
      files: {
        noDataAvailable: 'No data available',
        sftpConnectFailed: 'SFTP connect failed'
      }
    }
  }
})

const stubApi = () => ({
  sftpConnList: vi.fn().mockResolvedValue([]),
  sftpConnList2: vi.fn(),
  sshConnExec: vi.fn().mockResolvedValue({ stdout: 'hello', stderr: '' }),
  uploadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  uploadDirectory: vi.fn().mockResolvedValue({ status: 'success' }),
  downloadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  transferFileRemoteToRemote: vi.fn().mockResolvedValue({ status: 'success' }),
  transferDirectoryRemoteToRemote: vi.fn().mockResolvedValue({ status: 'success' })
})

describe('index.vue - high coverage tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('api', stubApi())

    // JSDOM does not provide ResizeObserver by default
    ;(globalThis as any).ResizeObserver = class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const factory = () =>
    mount(Index, {
      global: {
        plugins: [i18n],
        stubs: {
          TermFileSystem: true,
          TransferPanel: true,
          'a-tree': true,
          'a-radio-group': true,
          'a-radio-button': true,
          'a-button': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-tabs': true,
          'a-tab-pane': true,
          'a-tooltip': true,
          'a-empty': true
        }
      }
    })

  it('getCurrentActiveTerminalInfo resolves via eventBus and onMounted wires listeners', async () => {
    const api = (window as any).api
    api.sftpConnList.mockResolvedValueOnce([])

    const wrapper = factory()

    // Resolve the "active terminal info" promise
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '1.1.1.1' })
    await flushPromises()

    // Mounted should subscribe to activeTabChanged
    expect(eventBus.on).toHaveBeenCalledWith('activeTabChanged', expect.any(Function))

    // Should have called session listing
    expect(api.sftpConnList).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('getCurrentActiveTerminalInfo timeout path returns null', async () => {
    vi.useFakeTimers()
    const wrapper = factory()

    const p = (wrapper.vm as any).getCurrentActiveTerminalInfo()
    vi.advanceTimersByTime(5100)
    await flushPromises()

    await expect(p).resolves.toBeNull()
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('updateTreeData transforms and assigns treeData', async () => {
    const wrapper = factory()
    await flushPromises()
    ;(wrapper.vm as any).updateTreeData({ a: { b: {} } })
    expect(Array.isArray((wrapper.vm as any).treeData)).toBe(true)
    wrapper.unmount()
  })

  it('resolvePaths + getBasePath cover user/root and local-team decoding', async () => {
    const wrapper = factory()
    await flushPromises()

    expect((wrapper.vm as any).resolvePaths('root@x')).toBe('/root')
    expect((wrapper.vm as any).resolvePaths('alice@x')).toBe('/home/alice')

    // local-team path uses base64 decode
    const v = 'u@1.1.1.1:local-team:ZGVtbw=='
    expect((wrapper.vm as any).getBasePath(v)).toContain('/Default/decoded-host')

    // non local-team returns empty
    expect((wrapper.vm as any).getBasePath('u@1.1.1.1:ssh:x')).toBe('')
    wrapper.unmount()
  })

  it('getFileExt returns lower-case extension and empty when missing', async () => {
    const wrapper = factory()
    await flushPromises()

    expect((wrapper.vm as any).getFileExt('/a/b/c.TXT')).toBe('.txt')
    expect((wrapper.vm as any).getFileExt('/a/b/c')).toBe('')
    wrapper.unmount()
  })

  it('openFile covers create/edit, permission denied, and existing editor reopening', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()

    // Give the root container a stable bounding rect so editor can be opened
    const elRef = (wrapper.vm as any).fileElement
    const el = (elRef && 'value' in elRef ? elRef.value : elRef) as HTMLElement
    // Provide a stable bounding rect so editor can be opened
    el.getBoundingClientRect = () =>
      ({
        width: 1000,
        height: 800,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1000,
        bottom: 800,
        toJSON: () => ({})
      }) as any

    // Create path (No such file)
    api.sshConnExec.mockResolvedValueOnce({ stdout: '', stderr: 'No such file or directory' })
    await (wrapper.vm as any).openFile({ filePath: '/tmp/new.txt', terminalId: 't1' })
    await flushPromises()
    expect((wrapper.vm as any).openEditors.length).toBe(1)

    // Existing editor reopen path
    api.sshConnExec.mockResolvedValueOnce({ stdout: 'x', stderr: '' })
    await (wrapper.vm as any).openFile({ filePath: '/tmp/new.txt', terminalId: 't1' })
    expect((wrapper.vm as any).openEditors[0].visible).toBe(true)

    // Permission denied path
    api.sshConnExec.mockResolvedValueOnce({ stdout: '', stderr: 'Permission denied' })
    await (wrapper.vm as any).openFile({ filePath: '/root/secret.txt', terminalId: 't1' })
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('handleSave covers error message and success paths (needClose true/false)', async () => {
    const api = (window as any).api
    const wrapper = factory()
    await flushPromises()

    // Error path (stderr not empty)
    ;(wrapper.vm as any).openEditors.push({
      key: 'k1',
      filePath: '/tmp/a.txt',
      fileChange: true,
      saved: false,
      vimText: 'x',
      terminalId: 't1',
      loading: false
    })
    api.sshConnExec.mockResolvedValueOnce({ stderr: 'write failed' })
    await (wrapper.vm as any).handleSave({ key: 'k1', needClose: false })
    expect(message.error).toHaveBeenCalled()
    expect((wrapper.vm as any).openEditors[0].loading).toBe(false)

    // Success path (needClose=false)
    api.sshConnExec.mockResolvedValueOnce({ stderr: '' })
    await (wrapper.vm as any).handleSave({ key: 'k1', needClose: false })
    expect(message.success).toHaveBeenCalled()
    expect((wrapper.vm as any).openEditors[0].saved).toBe(true)

    // Success path (needClose=true) removes editor
    ;(wrapper.vm as any).openEditors.push({
      key: 'k2',
      filePath: '/tmp/b.txt',
      fileChange: true,
      saved: false,
      vimText: 'y',
      terminalId: 't1',
      loading: false
    })
    api.sshConnExec.mockResolvedValueOnce({ stderr: '' })
    await (wrapper.vm as any).handleSave({ key: 'k2', needClose: true })
    expect((wrapper.vm as any).openEditors.find((e) => e.key === 'k2')).toBeUndefined()

    // Missing editor key => early return
    await (wrapper.vm as any).handleSave({ key: 'missing', needClose: true })

    wrapper.unmount()
  })
})
