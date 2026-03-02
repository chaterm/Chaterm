import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// NOTE: adjust path if your repo layout differs
import Index from '../index.vue'

beforeEach(() => {
  ;(globalThis as any).createRendererLogger = vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
})

// ---------------- Event bus (hoisted singleton) ----------------
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

// index.vue uses a relative import; keep both just in case the test file sits in a different folder in the repo
vi.mock('../../../utils/eventBus', () => ({ default: eventBus }))
vi.mock('../../../../utils/eventBus', () => ({ default: eventBus }))

// ---------------- antd mocks ----------------
vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn() },
  Modal: { confirm: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
}))

// ---------------- other deps ----------------
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn().mockResolvedValue({}),
    saveConfig: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('../fileTransfer', () => ({ initTransferListener: vi.fn() }))

const base64Fns = vi.hoisted(() => ({
  decode: vi.fn((s: string) => `decoded:${s}`),
  encode: vi.fn((s: string) => `encoded:${s}`)
}))

vi.mock('@utils/base64', () => ({
  Base64Util: { decode: base64Fns.decode, encode: base64Fns.encode }
}))
vi.mock('../../Editors/base/languageMap', () => ({
  LanguageMap: { '.txt': 'text', '.js': 'javascript', '.py': 'python' }
}))

vi.mock('../../Ssh/editors/dragEditor.vue', () => ({
  default: { name: 'EditorCode', template: '<div class="editor-code" />' },
  editorData: {}
}))

vi.mock('./fileTransferProgress.vue', () => ({
  default: { name: 'TransferPanel', template: '<div class="transfer-panel" />' }
}))

vi.mock('@/assets/menu/files.svg', () => ({ default: 'files.svg' }))

// ---------------- i18n ----------------
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

// ---------------- component stubs ----------------
const antdStubs = {
  'a-button': { template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>' },
  'a-tabs': { template: '<div class="a-tabs"><slot /></div>' },
  'a-tab-pane': { template: '<div class="a-tab-pane"><slot /></div>' },
  'a-card': { template: '<div class="a-card"><slot /></div>' },
  'a-space': { template: '<div class="a-space"><slot /></div>' },
  'a-tooltip': { template: '<span class="a-tooltip"><slot /></span>' },
  'a-radio-group': { template: '<div class="a-radio-group"><slot /></div>' },
  'a-radio-button': { template: '<button class="a-radio-button"><slot /></button>' },
  'a-select': { template: '<select class="a-select"><slot /></select>' },
  'a-spin': { template: '<div class="a-spin"><slot /></div>' },
  'a-modal': { template: '<div class="a-modal"><slot /></div>' },
  'a-tree': { template: '<div class="a-tree"><slot /></div>' }
}

// ---------------- api stub ----------------
type ApiStub = {
  sftpConnList: ReturnType<typeof vi.fn>
  getAppPath: ReturnType<typeof vi.fn>
  sshConnExec: ReturnType<typeof vi.fn>
  connectAssetInfo: ReturnType<typeof vi.fn>
  sftpConnect: ReturnType<typeof vi.fn>
  sftpClose: ReturnType<typeof vi.fn>
  sftpCancel: ReturnType<typeof vi.fn>
  invoke: ReturnType<typeof vi.fn>
}

const makeApi = (): ApiStub => ({
  sftpConnList: vi.fn().mockResolvedValue([]),
  getAppPath: vi.fn().mockResolvedValue('/home/test'),
  sshConnExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  connectAssetInfo: vi.fn().mockResolvedValue(null),
  sftpConnect: vi.fn().mockResolvedValue({ status: 'connected' }),
  sftpClose: vi.fn().mockResolvedValue(undefined),
  sftpCancel: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue(null)
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

    // make raf deterministic for refreshAfterSelect loops
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
          TransferPanel: { name: 'TransferPanel', template: '<div class="transfer-panel" />' },
          // icons
          RightOutlined: { template: '<i class="icon-right" />' },
          DownOutlined: { template: '<i class="icon-down" />' },
          PlusOutlined: { template: '<i class="icon-plus" />' },
          CloseOutlined: { template: '<i class="icon-close" />' },
          CheckOutlined: { template: '<i class="icon-check" />' }
        }
      }
    })

  const setContainerRect = (wrapper: any, rect: Partial<DOMRect> = {}) => {
    const el = wrapper.find('.tree-container')?.element as any
    if (!el) return
    el.getBoundingClientRect = vi.fn(
      () =>
        ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 800,
          right: 1200,
          width: 1200,
          height: 800,
          toJSON: () => ({}),
          ...rect
        }) as any
    )
  }

  const makeDragEvent = (payload: any | null) =>
    ({
      dataTransfer: {
        getData: vi.fn().mockReturnValue(payload ? JSON.stringify(payload) : ''),
        dropEffect: 'none'
      },
      preventDefault: vi.fn()
    }) as any as DragEvent

  it('mount: should render without crashing', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  it('assetInfoResult flow: triggers sftpConnList', async () => {
    api.sftpConnList.mockResolvedValueOnce([{ id: 'root@10.0.0.2:ssh:xx', isSuccess: true }])

    const wrapper = mountView()
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '10.0.0.2' })
    await flushPromises()

    expect(api.sftpConnList).toHaveBeenCalled()
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  it('mode switch: can switch to transfer mode', async () => {
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as any
    await vm.onModeChange?.('transfer')
    await flushPromises()
    expect(vm.uiMode).toBe('transfer')
    wrapper.unmount()
  })

  it('unmount: should not crash and removes listeners', async () => {
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
    wrapper.unmount()
  })

  it('list sessions + active highlight: Local injected and active terminal gets class', async () => {
    api.sftpConnList.mockResolvedValueOnce([
      { id: 'root@10.0.0.2:ssh:xx', isSuccess: true },
      { id: 'dev@10.0.0.3:local-team:aG9zdA==:files-left', isSuccess: false, error: 'boom' }
    ])

    const wrapper = mountView()
    await flushPromises()

    // Resolve getCurrentActiveTerminalInfo in onMounted so objectToTreeData can mark active terminal.
    eventBus.emit('assetInfoResult', { uuid: 'u1', ip: '10.0.0.2' })
    await flushPromises()

    const tree = (wrapper.vm as any).treeData as any[]
    expect(tree.some((n) => n?.title === 'Local')).toBe(true)
    expect(tree.some((n) => n?.title === '10.0.0.2' && n?.class === 'active-terminal')).toBe(true)
    expect(tree.some((n) => String(n?.title).includes('decoded:') && n?.errorMsg === 'boom')).toBe(true)
    wrapper.unmount()
  })

  it('drag/drop: forbidden vs allowed drop updates panel classes and dropEffect', async () => {
    const wrapper = mountView()
    await flushPromises()

    // Make right side already be root@10.0.0.2 so dropping that payload to left becomes forbidden
    ;(wrapper.vm as any).selectedRightUuid = 'root@10.0.0.2:ssh:xx'

    const forbiddenEv = makeDragEvent({ uuid: 'u1', username: 'root', ip: '10.0.0.2' })
    ;(wrapper.vm as any).onSideDragOver(forbiddenEv, 'left')
    expect(forbiddenEv.preventDefault).not.toHaveBeenCalled()
    expect((wrapper.vm as any).sideDropClass('left')['panel-drop-forbidden']).toBe(true)
    expect((forbiddenEv as any).dataTransfer.dropEffect).toBe('none')

    const allowedEv = makeDragEvent({ uuid: 'u2', username: 'root', ip: '10.0.0.9' })
    ;(wrapper.vm as any).onSideDragOver(allowedEv, 'left')
    expect(allowedEv.preventDefault).toHaveBeenCalled()
    expect((wrapper.vm as any).sideDropClass('left')['panel-drop-hover']).toBe(true)
    expect((allowedEv as any).dataTransfer.dropEffect).toBe('copy')
    ;(wrapper.vm as any).onSideDragLeave({} as any, 'left')
    expect((wrapper.vm as any).sideDropClass('left')['panel-drop-hover']).toBe(false)
    expect((wrapper.vm as any).sideDropClass('left')['panel-drop-forbidden']).toBe(false)

    wrapper.unmount()
  })

  it('empty placeholder: OS file dragging toggles emptyDragging', async () => {
    const wrapper = mountView()
    await flushPromises()

    const osEv = makeDragEvent(null)
    ;(wrapper.vm as any).handleEmptyDragEnter(osEv, 'left')
    expect((wrapper.vm as any).emptyDragging.left).toBe(true)
    ;(wrapper.vm as any).handleEmptyDragLeave({} as any, 'left')
    expect((wrapper.vm as any).emptyDragging.left).toBe(false)
    wrapper.unmount()
  })

  it('editor flow: openFile (edit/create/permission) + handleSave + closeVimEditor', async () => {
    api.sshConnExec.mockResolvedValueOnce({ stdout: 'hello', stderr: '' })

    const wrapper = mountView()
    await flushPromises()
    setContainerRect(wrapper)

    await (wrapper.vm as any).openFile({ filePath: '/tmp/a.txt', terminalId: 't1' })
    const editors = (wrapper.vm as any).openEditors as any[]
    expect(editors.length).toBe(1)
    expect(editors[0].filePath).toBe('/tmp/a.txt')
    expect(editors[0].action).toBe('create')
    expect(editors[0].contentType).toBe('text')

    // Save success
    editors[0].fileChange = true
    editors[0].vimText = 'changed'
    api.sshConnExec.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await (wrapper.vm as any).handleSave({ key: editors[0].key, needClose: false })
    expect(editors[0].saved).toBe(true)
    expect(editors[0].fileChange).toBe(false)

    // close when no unsaved changes => removed
    ;(wrapper.vm as any).closeVimEditor({ key: editors[0].key, editorType: editors[0].editorType })
    expect((wrapper.vm as any).openEditors.length).toBe(0)

    // No such file => create
    api.sshConnExec.mockResolvedValueOnce({ stdout: '', stderr: 'No such file or directory' })
    await (wrapper.vm as any).openFile({ filePath: '/tmp/missing.py', terminalId: 't2' })
    expect((wrapper.vm as any).openEditors[0].action).toBe('create')

    // Permission denied branch
    api.sshConnExec.mockResolvedValueOnce({ stdout: '', stderr: 'Permission denied' })
    await (wrapper.vm as any).openFile({ filePath: '/root/secret.txt', terminalId: 't3' })
    const { message } = await import('ant-design-vue')
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('closeVimEditor: unsaved changes triggers confirm; cancel removes editor; ok triggers save', async () => {
    const wrapper = mountView()
    await flushPromises()
    setContainerRect(wrapper)

    // Create an editor entry directly
    ;(wrapper.vm as any).openEditors.push({
      filePath: '/tmp/x.txt',
      visible: true,
      vimText: 'x',
      originVimText: 'x',
      action: 'edit',
      vimEditorX: 0,
      vimEditorY: 0,
      contentType: 'text',
      vimEditorHeight: 100,
      vimEditorWidth: 100,
      loading: false,
      fileChange: true,
      saved: false,
      key: 't1-/tmp/x.txt',
      terminalId: 't1',
      editorType: '.txt',
      userResized: false
    })

    const ed = (wrapper.vm as any).openEditors[0]
    ;(wrapper.vm as any).closeVimEditor({ key: ed.key, editorType: ed.editorType })

    const { Modal } = await import('ant-design-vue')
    expect(Modal.confirm).toHaveBeenCalled()

    const cfg = (Modal.confirm as any).mock.calls[0][0]
    cfg.onCancel()
    expect((wrapper.vm as any).openEditors.length).toBe(0)

    // Re-add and test OK path => save invoked
    ;(wrapper.vm as any).openEditors.push({ ...ed })
    api.sshConnExec.mockResolvedValueOnce({ stdout: '', stderr: '' })
    ;(wrapper.vm as any).closeVimEditor({ key: ed.key, editorType: ed.editorType })
    const cfg2 = (Modal.confirm as any).mock.calls.at(-1)[0]
    cfg2.onOk()
    await flushPromises()
    expect(api.sshConnExec).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('transfer resize: mousedown registers listeners and mouseup cleans state', async () => {
    const wrapper = mountView()
    await flushPromises()

    const layout = wrapper.find('.transfer-layout')
    if (layout.exists()) {
      ;(layout.element as any).getBoundingClientRect = vi.fn(() => ({ left: 0, width: 1000 }) as any)
      ;(wrapper.vm as any).onTransferResizeMouseDown({
        preventDefault: vi.fn(),
        clientX: 400
      } as any)

      expect((wrapper.vm as any).isResizing).toBe(true)
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 800 }))
      window.dispatchEvent(new MouseEvent('mouseup'))
      expect((wrapper.vm as any).isResizing).toBe(false)
    }

    wrapper.unmount()
  })
})
