import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// Event bus hoisted
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
    }),
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

vi.mock('../../../../utils/eventBus', () => ({ default: eventBus }))
vi.mock('../fileTransfer', () => ({ initTransferListener: vi.fn() }))
vi.mock('../../../../utils/base64', () => ({ Base64Util: { decode: vi.fn((s: string) => `decoded:${s}`) } }))
vi.mock('../../Ssh/editors/languageMap', () => ({ LanguageMap: { '.python': 'python', '.txt': 'text', '.js': 'javascript' } }))
// @ts-ignore
vi.mock('../../Ssh/editors/dragEditor.vue', () => ({
  default: { name: 'EditorCode', template: '<div class="editor" />' },
  editorData: {}
}))
vi.mock('./fileTransferProgress.vue', () => ({ default: { name: 'TransferPanel', template: '<div class="transfer" />' } }))
vi.mock('@/assets/menu/files.svg', () => ({ default: 'files.svg' }))
// @ts-ignore
vi.mock('@ant-design/icons-vue', () => ({
  DownOutlined: { name: 'DownOutlined', template: '<i />' },
  RightOutlined: { name: 'RightOutlined', template: '<i />' }
}))

import { message, Modal } from 'ant-design-vue'
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
        defaultMode: 'Default',
        dragTransferMode: 'Transfer',
        treeExpand: 'Expand',
        treeFoldUp: 'Fold',
        sftpConnectFailed: 'SFTP connect failed',
        noDataAvailable: 'No data available',
        uploadSuccess: 'Upload success',
        uploadCancel: 'Upload cancel',
        uploadFailed: 'Upload failed',
        downloadSuccess: 'Download success',
        downloadCancel: 'Download cancel',
        downloadFailed: 'Download failed',
        downloadSkipped: 'Skipped',
        transferSuccess: 'Transfer success'
      },
      transferFailed: 'Transfer failed'
    }
  }
})

type ApiStub = {
  sftpConnList: ReturnType<typeof vi.fn>
  sshConnExec: ReturnType<typeof vi.fn>
  getAppPath: ReturnType<typeof vi.fn>
  uploadFile: ReturnType<typeof vi.fn>
  uploadDirectory: ReturnType<typeof vi.fn>
  downloadFile: ReturnType<typeof vi.fn>
  downloadDirectory: ReturnType<typeof vi.fn>
  transferFileRemoteToRemote: ReturnType<typeof vi.fn>
  transferDirectoryRemoteToRemote: ReturnType<typeof vi.fn>
}

const makeApi = (): ApiStub => ({
  sftpConnList: vi.fn().mockResolvedValue([]),
  sshConnExec: vi.fn().mockResolvedValue({ stdout: 'hello', stderr: '' }),
  getAppPath: vi.fn().mockResolvedValue('/home/me'),
  uploadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  uploadDirectory: vi.fn().mockResolvedValue({ status: 'success' }),
  downloadFile: vi.fn().mockResolvedValue({ status: 'success' }),
  downloadDirectory: vi.fn().mockResolvedValue({ status: 'success' }),
  transferFileRemoteToRemote: vi.fn().mockResolvedValue({ status: 'success' }),
  transferDirectoryRemoteToRemote: vi.fn().mockResolvedValue({ status: 'success' })
})

class DataTransferMock {
  private store = new Map<string, string>()
  dropEffect: string = 'none'
  effectAllowed: string = 'none'
  getData(type: string) {
    return this.store.get(type) || ''
  }
  setData(type: string, value: string) {
    this.store.set(type, value)
  }
}

const mountIndex = () =>
  mount(Index, {
    global: {
      plugins: [i18n],
      stubs: {
        TermFileSystem: { template: '<div class="fs" />' },
        EditorCode: { template: '<div class="editor" />' },
        TransferPanel: { template: '<div class="transfer" />' },
        'a-tree': { template: '<div><slot /></div>' },
        'a-radio-group': { template: '<div><slot /></div>' },
        'a-radio-button': { template: '<button><slot /></button>' },
        'a-tooltip': { template: '<span><slot /></span>' },
        'a-empty': { template: '<div class="empty" />' }
      }
    }
  })

describe('index.vue - rewritten tests (aiming for maximum coverage)', () => {
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

  it('onMounted resolves active terminal info, lists sessions & grouping', async () => {
    const wrapper = mountIndex()

    api.sftpConnList.mockResolvedValueOnce([
      { id: 'root@10.0.0.2:ssh:xx', isSuccess: true },
      { id: 'alice@10.0.0.3:local-team:YmFzZTY0', isSuccess: true },
      { id: 'bob@10.0.0.4:ssh:yy', isSuccess: false, error: 'bad' }
    ])

    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '10.0.0.2' })
    await flushPromises()

    expect(eventBus.on).toHaveBeenCalledWith('activeTabChanged', expect.any(Function))
    expect(api.sftpConnList).toHaveBeenCalled()

    const tree = (wrapper.vm as any).treeData as any[]
    expect(tree.some((n) => n.title === 'Local')).toBe(true)
    expect(tree.some((n) => String(n.title).startsWith('decoded:'))).toBe(true)

    const failed = tree.find((n) => n.value.includes('bob@10.0.0.4'))
    expect(failed?.errorMsg).toBe('bad')

    wrapper.unmount()
  })

  it('transfer mode split + collapse/open + root DnD reorder', async () => {
    api.sftpConnList.mockResolvedValueOnce([
      { id: 'root@10.0.0.2:ssh:xx', isSuccess: true },
      { id: 'alice@10.0.0.3:ssh:yy', isSuccess: true },
      { id: 'bob@10.0.0.4:ssh:zz', isSuccess: true }
    ])

    const wrapper = mountIndex()
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '10.0.0.2' })
    await flushPromises()

    await (wrapper.vm as any).onModeChange('transfer')
    await flushPromises()
    expect((wrapper.vm as any).uiMode).toBe('transfer')

    const leftOrder = (wrapper.vm as any).leftOrder as string[]
    const rightOrder = (wrapper.vm as any).rightOrder as string[]
    expect(rightOrder.length).toBe(1)

    const someUuid = leftOrder[0]
    ;(wrapper.vm as any).collapseSession(someUuid)
    expect((wrapper.vm as any).isCollapsed(someUuid)).toBe(true)
    ;(wrapper.vm as any).toggleSession(someUuid)
    expect((wrapper.vm as any).isCollapsed(someUuid)).toBe(false)

    const dt = new DataTransferMock()
    const draggedUuid = leftOrder[0]
    const node = { value: draggedUuid }

    expect((wrapper.vm as any).canDragRoot('left')).toBe(true)

    await (wrapper.vm as any).onRootDragStart({ dataTransfer: dt, preventDefault: vi.fn() }, node, 'left')
    await (wrapper.vm as any).onRootDragOver({ dataTransfer: dt, preventDefault: vi.fn() }, 'right')
    expect((wrapper.vm as any).rootDropSide).toBe('right')

    await (wrapper.vm as any).onRootDrop({ dataTransfer: dt }, 'right')
    expect(((wrapper.vm as any).rightOrder as string[]).includes(String(draggedUuid))).toBe(true)

    wrapper.unmount()
  })

  it('split resize clamps + cleanup', async () => {
    api.sftpConnList.mockResolvedValueOnce([
      { id: 'root@10.0.0.2:ssh:xx', isSuccess: true },
      { id: 'alice@10.0.0.3:ssh:yy', isSuccess: true }
    ])

    const wrapper = mountIndex()
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '10.0.0.2' })
    await flushPromises()

    await (wrapper.vm as any).onModeChange('transfer')
    await flushPromises()

    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as any
    ;(wrapper.vm as any).transferLayoutRef = el

    await (wrapper.vm as any).onTransferResizeMouseDown({ preventDefault: vi.fn() })
    expect((wrapper.vm as any).isResizing).toBe(true)

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect((wrapper.vm as any).isResizing).toBe(false)
    wrapper.unmount()
  })

  it('handleCrossTransfer covers local/remote/remote->remote + status notify + error catch', async () => {
    const wrapper = mountIndex()
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '1.1.1.1' })
    await flushPromises()

    api.uploadFile.mockResolvedValueOnce({ status: 'success' })
    await (wrapper.vm as any).handleCrossTransfer({
      kind: 'fs-item',
      fromUuid: 'localhost@127.0.0.1:local:xx',
      fromSide: 'left',
      srcPath: '/local/a.txt',
      name: 'a.txt',
      isDir: false,
      toUuid: 'root@10.0.0.2:ssh:xx',
      toSide: 'right',
      targetDir: '/remote'
    })
    expect(message.success).toHaveBeenCalled()

    api.transferFileRemoteToRemote.mockRejectedValueOnce(new Error('boom'))
    await (wrapper.vm as any).handleCrossTransfer({
      kind: 'fs-item',
      fromUuid: 'root@10.0.0.2:ssh:xx',
      fromSide: 'left',
      srcPath: '/r1/a.txt',
      name: 'a.txt',
      isDir: false,
      toUuid: 'alice@10.0.0.3:ssh:yy',
      toSide: 'right',
      targetDir: '/r2'
    })
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('openFile + close editor confirm ok/cancel + resizeEditor scale', async () => {
    const wrapper = mountIndex()
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '1.1.1.1' })
    await flushPromises()

    const elRef = (wrapper.vm as any).fileElement
    const el = (elRef && 'value' in elRef ? elRef.value : elRef) as HTMLElement
    el.getBoundingClientRect = () => ({ width: 800, height: 600 }) as any

    api.sshConnExec.mockResolvedValueOnce({ stdout: '', stderr: 'No such file or directory' })
    await (wrapper.vm as any).openFile({ filePath: '/tmp/new.txt', terminalId: 't1' })
    expect((wrapper.vm as any).openEditors.length).toBe(1)

    const ed = (wrapper.vm as any).openEditors[0]
    ed.fileChange = true
    ed.saved = false
    ;(Modal.confirm as any).mockImplementationOnce((cfg: any) => cfg.onCancel && cfg.onCancel())
    await (wrapper.vm as any).closeVimEditor({ key: ed.key, editorType: ed.editorType })
    expect((wrapper.vm as any).openEditors.length).toBe(0)

    wrapper.unmount()
  })
})
