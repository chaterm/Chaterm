import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

type ApiStub = Record<string, any>

const makeApi = (): ApiStub => ({
  // menus
  getLocalAssetRoute: vi.fn().mockResolvedValue({ data: { routers: [] } }),
  getShellsLocal: vi.fn().mockResolvedValue(null),

  // favorites
  updateLocalAsseFavorite: vi.fn().mockResolvedValue({ data: { message: 'success' } }),
  updateOrganizationAssetFavorite: vi.fn().mockResolvedValue({ data: { message: 'success' } }),

  // comments
  updateOrganizationAssetComment: vi.fn().mockResolvedValue({ data: { message: 'success' } }),

  // custom folders
  getCustomFolders: vi.fn().mockResolvedValue({ data: { message: 'success', folders: [] } }),
  createCustomFolder: vi.fn().mockResolvedValue({ data: { message: 'success' } }),
  updateCustomFolder: vi.fn().mockResolvedValue({ data: { message: 'success' } }),
  deleteCustomFolder: vi.fn().mockResolvedValue({ data: { message: 'success' } }),

  // folder ops
  moveAssetToFolder: vi.fn().mockResolvedValue({ data: { message: 'success' } }),
  removeAssetFromFolder: vi.fn().mockResolvedValue({ data: { message: 'success' } }),

  // ssh agent (safe noops)
  agentEnableAndConfigure: vi.fn().mockResolvedValue({ success: true }),
  getKeyChainInfo: vi.fn().mockResolvedValue({ private_key: 'k', chain_name: 'n', passphrase: '' }),
  addKey: vi.fn().mockResolvedValue({ success: true })
})

const api = makeApi()
// tabIndex.vue reads api from window at module-init
const __w: any = (globalThis as any).window ?? globalThis
__w.api = api
Object.defineProperty(globalThis, 'api', { value: api, writable: true })

const loggerSpies = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}
Object.defineProperty(globalThis, 'createRendererLogger', {
  value: vi.fn(() => loggerSpies),
  writable: true
})

// Mocks
const eventBus = vi.hoisted(() => {
  type Handler = (...args: any[]) => void
  const handlers = new Map<string, Set<Handler>>()

  const bus = {
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
    __reset: () => {
      handlers.clear()
    }
  }
  return bus
})
vi.mock('@/utils/eventBus', () => ({ default: eventBus }))

const refreshOrganizationAssetFromWorkspace = vi.fn(async (_node: any, cb?: () => void) => {
  cb?.()
})
vi.mock('../../LeftTab/components/refreshOrganizationAssets', () => ({
  refreshOrganizationAssetFromWorkspace
}))

const isOrganizationAsset = vi.fn(() => false)
vi.mock('../../LeftTab/utils/types', () => ({ isOrganizationAsset }))

const userConfigStore = {
  getConfig: vi.fn().mockResolvedValue({ workspaceShowIpMode: false, sshAgentsStatus: 0 }),
  saveConfig: vi.fn().mockResolvedValue(undefined)
}
vi.mock('@/services/userConfigStoreService', () => ({ userConfigStore }))

vi.mock('@/utils/util', () => ({
  deepClone: (v: any) => JSON.parse(JSON.stringify(v))
}))

vi.mock('@ant-design/icons-vue', () => {
  const stub = (name: string) => ({ name, template: '<i />' })
  return {
    StarFilled: stub('StarFilled'),
    StarOutlined: stub('StarOutlined'),
    LaptopOutlined: stub('LaptopOutlined'),
    SearchOutlined: stub('SearchOutlined'),
    RedoOutlined: stub('RedoOutlined'),
    EditOutlined: stub('EditOutlined'),
    CheckOutlined: stub('CheckOutlined'),
    CloseOutlined: stub('CloseOutlined'),
    FolderOutlined: stub('FolderOutlined'),
    DeleteOutlined: stub('DeleteOutlined'),
    SwapOutlined: stub('SwapOutlined')
  }
})

// ant-design-vue: we need both message/Modal.confirm AND components used as <Modal>, <Input>, <Button>
const message = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  loading: vi.fn()
}

const ModalComp: any = {
  name: 'Modal',
  props: { open: { type: Boolean, default: false }, title: { type: String, default: '' }, footer: { default: undefined } },
  emits: ['update:open', 'ok', 'cancel'],
  template: `<div class="modal" v-if="open"><slot /></div>`
}
ModalComp.confirm = vi.fn()

const InputComp: any = {
  name: 'Input',
  props: ['value'],
  emits: ['update:value'],
  template: `<input class="input" :value="value" @input="$emit('update:value', ($event && $event.target && $event.target.value))" />`
}
InputComp.TextArea = {
  name: 'InputTextArea',
  props: ['value', 'rows'],
  emits: ['update:value'],
  template: `<textarea class="textarea" :rows="rows" :value="value" @input="$emit('update:value', ($event && $event.target && $event.target.value))" />`
}

const ButtonComp: any = {
  name: 'Button',
  template: `<button class="btn" @click="$emit('click')"><slot /></button>`
}

vi.mock('ant-design-vue', () => ({
  message,
  Modal: ModalComp,
  Input: InputComp,
  Button: ButtonComp
}))

// i18n + component stubs
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      files: { files: 'Files' },
      common: { search: 'Search' },
      personal: {
        personal: 'Personal',
        enterprise: 'Enterprise',
        createFolder: 'Create Folder',
        editFolder: 'Edit Folder',
        moveToFolder: 'Move To Folder',
        showHostname: 'Show Hostname',
        showIp: 'Show IP',
        pleaseInputFolderName: 'Please input folder name'
      }
    }
  }
})

const antdStubs = {
  'a-tabs': {
    props: ['activeKey'],
    emits: ['update:activeKey', 'change'],
    template: `<div class="a-tabs"><slot /></div>`
  },
  'a-tab-pane': { props: ['tab'], template: '<div class="a-tab-pane"><slot /></div>' },
  'a-card': { template: '<div class="a-card"><slot /></div>' },
  'a-space': { template: '<div class="a-space"><slot /></div>' },
  'a-tooltip': { template: '<span class="a-tooltip"><slot /></span>' },
  'a-button': { template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>' },
  'a-input': {
    props: ['value'],
    emits: ['update:value', 'input'],
    template: `<input class="a-input" :value="value" @input="$emit('update:value', ($event && $event.target && $event.target.value)); $emit('input')" />`
  },
  'a-tree': { template: '<div class="a-tree" />' },
  'a-empty': { template: '<div class="a-empty" />' },
  'a-radio-group': { template: '<div class="a-radio-group"><slot /></div>' },
  'a-radio-button': { template: '<button class="a-radio-button"><slot /></button>' }
}

let TabIndex: any

describe('tabIndex.vue (enhanced coverage)', () => {
  beforeAll(async () => {
    // Use fake timers because the SFC uses setTimeout in several places
    vi.useFakeTimers()
    TabIndex = (await import('../tabIndex.vue')).default
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    eventBus.__reset()
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true })

    // Safe defaults for each test
    userConfigStore.getConfig.mockResolvedValue({ workspaceShowIpMode: false, sshAgentsStatus: 0 })
    api.getLocalAssetRoute.mockResolvedValue({ data: { routers: [] } })
    api.getShellsLocal.mockResolvedValue(null)
    api.getCustomFolders.mockResolvedValue({ data: { message: 'success', folders: [] } })
  })

  const mountView = async () => {
    const wrapper = mount(TabIndex, {
      global: { plugins: [i18n], stubs: antdStubs }
    })
    await flushPromises()

    // run any menu-expansion timers (200ms) scheduled by getLocalAssetMenu/getUserAssetMenu
    vi.runOnlyPendingTimers()
    await flushPromises()
    return wrapper
  }

  it('mount: loads tree + saved config (expanded keys + display mode)', async () => {
    userConfigStore.getConfig.mockResolvedValue({
      workspaceExpandedKeys: ['root'],
      workspaceShowIpMode: true,
      sshAgentsStatus: 0
    })

    api.getLocalAssetRoute.mockResolvedValueOnce({
      data: {
        routers: [
          {
            key: 'root',
            title: 'Root',
            children: [{ key: 'leaf', title: 'MyHost', ip: '10.0.0.1', comment: 'note', uuid: 'u1', favorite: false }]
          }
        ]
      }
    })

    const wrapper = await mountView()
    const vm: any = wrapper.vm

    expect(api.getLocalAssetRoute).toHaveBeenCalled()
    expect(vm.showIpMode).toBe(true)
    expect(vm.expandedKeys).toContain('root')

    // search by comment match (covers ip/comment/title filtering paths)
    vm.searchValue = 'note'
    vm.onSearchInput()
    await flushPromises()
    expect(vm.assetTreeData.length).toBe(1)
    expect(vm.expandedKeys).toContain('leaf')

    // empty search => returns original data (early-return branch)
    vm.searchValue = '   '
    vm.onSearchInput()
    await flushPromises()
    expect(vm.assetTreeData.length).toBe(1)

    // display text branch
    expect(vm.getDisplayText({ ip: '1.1.1.1' }, 'hostname')).toBe('1.1.1.1')

    // toggle display mode should save config
    await vm.toggleDisplayMode()
    expect(userConfigStore.saveConfig).toHaveBeenCalled()
    expect(vm.getDisplayText({ ip: '1.1.1.1' }, 'hostname')).toBe('hostname')

    wrapper.unmount()
  })

  it('folder row click: ignores refresh-button clicks; toggles expand state + persists config', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({
      data: { routers: [{ key: 'root', title: 'Root', children: [{ key: 'leaf', title: 'Leaf' }] }] }
    })
    userConfigStore.getConfig.mockResolvedValue({ workspaceExpandedKeys: ['root'], workspaceShowIpMode: false, sshAgentsStatus: 0 })

    const wrapper = await mountView()
    const vm: any = wrapper.vm

    // ignore clicks inside refresh icon
    const refreshWrap = document.createElement('div')
    refreshWrap.className = 'refresh-icon'
    const refreshTarget = document.createElement('span')
    refreshWrap.appendChild(refreshTarget)

    await vm.handleFolderRowClick({ target: refreshTarget } as any, { key: 'root', children: [{ key: 'leaf' }] })
    expect(vm.expandedKeys).toContain('root')

    // normal click collapses and saves
    const normalTarget = document.createElement('span')
    await vm.handleFolderRowClick({ target: normalTarget } as any, { key: 'root', children: [{ key: 'leaf' }] })
    expect(vm.expandedKeys).not.toContain('root')
    expect(userConfigStore.saveConfig).toHaveBeenCalled()

    // click again expands
    await vm.handleFolderRowClick({ target: normalTarget } as any, { key: 'root', children: [{ key: 'leaf' }] })
    expect(vm.expandedKeys).toContain('root')

    wrapper.unmount()
  })

  it('tab change: switches to enterprise workspace and loads folders + organization tree', async () => {
    api.getCustomFolders.mockResolvedValueOnce({ data: { message: 'success', folders: [{ uuid: 'f1', name: 'Folder1' }] } })
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } }) // initial personal
    api.getLocalAssetRoute.mockResolvedValueOnce({
      data: { routers: [{ key: 'org-root', title: 'OrgRoot', children: [] }] }
    }) // enterprise

    const wrapper = await mountView()
    const vm: any = wrapper.vm

    vm.selectedKeys = ['something']
    vm.searchValue = 'x'
    vm.expandedKeys = ['k']

    vm.handleTabChange('remote')
    await flushPromises()
    vi.runOnlyPendingTimers()
    await flushPromises()

    expect(vm.company).toBe('remote')
    expect(vm.selectedKeys).toEqual([])
    expect(vm.expandedKeys).toEqual([])
    expect(vm.searchValue).toBe('')
    expect(api.getCustomFolders).toHaveBeenCalled()
    expect(api.getLocalAssetRoute).toHaveBeenCalledWith({ searchType: 'tree', params: ['organization'] })

    wrapper.unmount()
  })

  it('favorite click validation + personal favorite toggle path', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } })
    const wrapper = await mountView()
    const vm: any = wrapper.vm

    // validation branches
    vm.handleFavoriteClick(null)
    vm.handleFavoriteClick({ key: 'x' }) // favorite undefined

    // personal workspace favorite update
    api.updateLocalAsseFavorite.mockResolvedValueOnce({ data: { message: 'success' } })
    vm.handleFavoriteClick({ uuid: 'u1', favorite: false })
    await flushPromises()

    expect(api.updateLocalAsseFavorite).toHaveBeenCalledWith({ uuid: 'u1', status: 1 })

    wrapper.unmount()
  })

  it('context menu: shows with overflow handling; actions close it (comment/move/remove)', async () => {
    isOrganizationAsset.mockReturnValue(true)

    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } })
    const wrapper = await mountView()
    const vm: any = wrapper.vm

    Object.defineProperty(window, 'innerWidth', { value: 120, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 90, configurable: true })

    const leafNode = {
      key: 'leaf',
      title: 'Host',
      uuid: 'u1',
      ip: '10.0.0.2',
      favorite: false,
      asset_type: 'org_asset',
      organizationId: 'org1'
    }

    const evt = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 110, clientY: 85 } as any
    vm.handleContextMenu(evt, leafNode)

    expect(vm.contextMenuVisible).toBe(true)
    expect(vm.selectedKeys).toEqual(['leaf'])
    expect(vm.machines).toEqual({ value: 'leaf', label: 'Host' })
    expect(String(vm.contextMenuStyle.left)).toContain('px')
    expect(String(vm.contextMenuStyle.top)).toContain('px')

    // comment action
    vm.handleContextMenuAction('comment')
    expect(vm.commentNode).toBe('leaf')
    expect(vm.contextMenuVisible).toBe(false)

    // move action
    vm.handleContextMenu(evt, leafNode)
    vm.handleContextMenuAction('move')
    expect(vm.showMoveToFolderModal).toBe(true)
    expect(vm.selectedAssetForMove?.key).toBe('leaf')

    // remove action (folder_ key + folderUuid)
    const folderLeaf = { ...leafNode, key: 'folder_leaf', folderUuid: 'f1' }
    vm.handleContextMenu(evt, folderLeaf)
    vm.handleContextMenuAction('remove')
    await flushPromises()
    expect(api.removeAssetFromFolder).toHaveBeenCalledWith({
      folderUuid: 'f1',
      organizationUuid: 'org1',
      assetHost: '10.0.0.2'
    })

    wrapper.unmount()
  })

  it('create folder: validation error + success flow', async () => {
    isOrganizationAsset.mockReturnValue(true)
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } })
    const wrapper = await mountView()
    const vm: any = wrapper.vm

    // Switch to enterprise so "create folder" flows match real usage
    vm.handleTabChange('remote')
    await flushPromises()

    // validation
    vm.createFolderForm = { name: '   ', description: '' }
    await vm.handleCreateFolder()
    expect(message.error).toHaveBeenCalled()

    // success
    api.createCustomFolder.mockResolvedValueOnce({ data: { message: 'success' } })
    vm.createFolderForm = { name: 'My Folder', description: 'desc' }
    vm.showCreateFolderModal = true
    await vm.handleCreateFolder()
    await flushPromises()

    expect(api.createCustomFolder).toHaveBeenCalledWith({ name: 'My Folder', description: 'desc' })
    expect(message.success).toHaveBeenCalled()
    expect(vm.showCreateFolderModal).toBe(false)
    expect(vm.createFolderForm).toEqual({ name: '', description: '' })

    wrapper.unmount()
  })

  it('edit/update folder: validation error + success flow', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } })
    const wrapper = await mountView()
    const vm: any = wrapper.vm

    vm.handleEditFolder({ folderUuid: 'f1', title: 'Old', description: 'd' })
    expect(vm.showEditFolderModal).toBe(true)
    expect(vm.editFolderForm.uuid).toBe('f1')

    // validation
    vm.editFolderForm.name = '   '
    await vm.handleUpdateFolder()
    expect(message.error).toHaveBeenCalled()

    // success
    api.updateCustomFolder.mockResolvedValueOnce({ data: { message: 'success' } })
    vm.editFolderForm.name = 'New'
    vm.editFolderForm.description = 'd2'
    await vm.handleUpdateFolder()
    await flushPromises()

    expect(api.updateCustomFolder).toHaveBeenCalledWith({ folderUuid: 'f1', name: 'New', description: 'd2' })
    expect(message.success).toHaveBeenCalled()
    expect(vm.showEditFolderModal).toBe(false)
    expect(vm.editFolderForm).toEqual({ uuid: '', name: '', description: '' })

    wrapper.unmount()
  })

  it('delete folder: Modal.confirm onOk handles success and failure', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } })
    const wrapper = await mountView()
    const vm: any = wrapper.vm

    // success
    api.deleteCustomFolder.mockResolvedValueOnce({ data: { message: 'success' } })
    vm.handleDeleteFolder({ folderUuid: 'f1', title: 'Folder', children: [{ key: 'a' }, { key: 'b' }] })
    expect(ModalComp.confirm).toHaveBeenCalled()
    const firstCallArg = (ModalComp.confirm as any).mock.calls[0][0]
    await firstCallArg.onOk()
    await flushPromises()
    expect(api.deleteCustomFolder).toHaveBeenCalledWith({ folderUuid: 'f1' })
    expect(message.success).toHaveBeenCalled()

    // failure
    api.deleteCustomFolder.mockResolvedValueOnce({ data: { message: 'fail' } })
    vm.handleDeleteFolder({ folderUuid: 'f2', title: 'Folder2', children: [] })
    const secondCallArg = (ModalComp.confirm as any).mock.calls[1][0]
    await secondCallArg.onOk()
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('click/dblclick + dragstart: emits events correctly', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } })
    const wrapper = await mountView()
    const vm: any = wrapper.vm

    const node = { key: 'leaf', title: 'Host', uuid: 'u1', ip: '10.0.0.9', asset_type: 'org_asset', organizationId: 'org1' }

    // click -> after 250ms emits open-sftp
    vm.handleClick(node)
    vi.advanceTimersByTime(250)
    await flushPromises()
    expect(eventBus.emit).toHaveBeenCalledWith(
      'files-open-sftp-by-asset-node',
      expect.objectContaining({
        node: expect.objectContaining({ uuid: 'u1', ip: '10.0.0.9' }),
        source: 'click'
      })
    )
    expect(eventBus.emit).toHaveBeenCalledWith('open-user-tab', 'files')

    // click then dblclick cancels timer + emits currentClickServer
    ;(eventBus.emit as any).mockClear()
    vm.handleClick(node)
    vm.handleDblClick(node)
    expect(wrapper.emitted('currentClickServer')?.[0]).toEqual([node])
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(eventBus.emit).not.toHaveBeenCalled()

    // dragstart payload
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: ''
    }
    vm.onAssetDragStart({ dataTransfer } as any, { ...node, proxyCommand: undefined })
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-asset-sftp', expect.any(String))
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'Host')
    expect(dataTransfer.effectAllowed).toBe('copy')

    wrapper.unmount()
  })

  it('handleRefresh: invokes refresh helper and clears refreshingNode after delay', async () => {
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } }) // mount
    api.getLocalAssetRoute.mockResolvedValueOnce({ data: { routers: [] } }) // refresh callback
    const wrapper = await mountView()
    const vm: any = wrapper.vm

    vm.handleTabChange('remote')
    await flushPromises()

    await vm.handleRefresh({ key: 'org-root', title: 'OrgRoot' })
    expect(refreshOrganizationAssetFromWorkspace).toHaveBeenCalled()
    expect(vm.refreshingNode).toBe('org-root')

    vi.advanceTimersByTime(800)
    await flushPromises()
    expect(vm.refreshingNode).toBe(null)

    wrapper.unmount()
  })
})
