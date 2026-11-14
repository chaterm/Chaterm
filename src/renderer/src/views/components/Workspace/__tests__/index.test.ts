import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { Modal } from 'ant-design-vue'
import Workspace from '../index.vue'

const { mockEventBus, mockApi } = vi.hoisted(() => ({
  mockEventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    emitAsync: vi.fn()
  },
  mockApi: {
    getLocalAssetRoute: vi.fn(async () => ({
      data: {
        routers: [{ key: 'group', title: 'Group', children: [{ key: 'host', title: 'Host', ip: '10.0.0.1' }] }]
      }
    })),
    getShellsLocal: vi.fn(async () => null),
    getCustomFolders: vi.fn(async () => ({ data: [] })),
    removeConnectionHistory: vi.fn(async () => ({ data: { message: 'success', changes: 1 } })),
    deleteAsset: vi.fn(async () => ({ data: { message: 'success' } }))
  }
}))

vi.mock('@/utils/eventBus', () => ({
  default: mockEventBus
}))

vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn(async () => ({})),
    saveConfig: vi.fn(async () => undefined)
  }
}))

vi.mock('../../LeftTab/components/refreshOrganizationAssets', () => ({
  refreshOrganizationAssetFromWorkspace: vi.fn()
}))

vi.mock('../../LeftTab/utils/types', () => ({
  isOrganizationAsset: vi.fn(() => false)
}))

const treeStub = {
  template: '<div class="workspace-tree-stub" />'
}

describe('Workspace tree search rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).api = mockApi
  })

  it('remounts the active tree after a search returns no results', async () => {
    const wrapper = mount(Workspace, {
      global: {
        stubs: {
          'a-tree': treeStub,
          'a-tabs': true,
          'a-tab-pane': true,
          'a-input': true,
          'a-button': true,
          'a-tooltip': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-popconfirm': true
        }
      }
    })

    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()

    expect(wrapper.findAll('.workspace-tree-stub')).toHaveLength(1)

    const vm = wrapper.vm as any
    vm.searchValue = '  no-such-host  '
    vm.onSearchInput()
    expect(vm.searchValue).toBe('no-such-host')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
    expect(wrapper.findAll('.workspace-tree-stub')).toHaveLength(0)

    vm.searchValue = ''
    vm.onSearchInput()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
    expect(wrapper.findAll('.workspace-tree-stub')).toHaveLength(1)

    vm.enterpriseData = [{ key: 'organization', title: 'Organization', children: [] }]
    await nextTick()
    expect(wrapper.findAll('.workspace-tree-stub')).toHaveLength(2)

    vm.enterpriseData = []
    await nextTick()
    expect(wrapper.findAll('.workspace-tree-stub')).toHaveLength(1)

    const recentConnection = {
      key: 'recent_uuid-123_10.0.0.1_root',
      title: 'Recent host',
      uuid: 'uuid-123',
      ip: '10.0.0.1',
      username: 'root',
      asset_type: 'person',
      organizationId: 'personal',
      isRecentConnection: true
    }
    vm.contextMenuData = recentConnection
    await vm.handleContextMenuAction('removeRecentConnection')
    expect(mockApi.removeConnectionHistory).toHaveBeenCalledWith({
      assetUuid: 'uuid-123',
      assetIp: '10.0.0.1',
      assetUsername: 'root',
      assetType: 'person',
      organizationId: 'personal'
    })

    wrapper.unmount()
  })

  it('copies the displayed hostname or IP from the context menu', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mount(Workspace, {
      global: {
        stubs: {
          'a-tree': treeStub,
          'a-tabs': true,
          'a-tab-pane': true,
          'a-input': true,
          'a-button': true,
          'a-tooltip': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-popconfirm': true
        }
      }
    })
    await nextTick()

    const vm = wrapper.vm as any
    const host = { key: 'host', title: 'web-01', ip: '10.0.0.1' }

    // Copy option is offered for host nodes but not for folders
    expect(vm.hasContextMenu(host)).toBe(true)
    vm.handleContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), host)
    await nextTick()
    // Host nodes without other options show only the copy item
    const menuItems = wrapper.findAll('.context-menu-item')
    expect(menuItems).toHaveLength(1)

    await menuItems[0].trigger('click')
    await nextTick()
    expect(writeText).toHaveBeenLastCalledWith('web-01')

    vm.showIpMode = true
    vm.contextMenuData = host
    await vm.handleContextMenuAction('copy')
    expect(writeText).toHaveBeenLastCalledWith('10.0.0.1')

    writeText.mockRejectedValueOnce(new Error('denied'))
    vm.contextMenuData = host
    await vm.handleContextMenuAction('copy')
    expect(writeText).toHaveBeenCalledTimes(3)

    expect(vm.hasContextMenu({ key: 'group', title: 'Group', children: [] })).toBe(false)

    wrapper.unmount()
  })

  it('offers direct hosts a delete action and deletes after confirmation', async () => {
    const wrapper = mount(Workspace, {
      global: {
        stubs: {
          'a-tree': treeStub,
          'a-tabs': true,
          'a-tab-pane': true,
          'a-input': true,
          'a-button': true,
          'a-tooltip': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-popconfirm': true
        }
      }
    })
    await nextTick()

    const directHost = {
      key: 'host-1',
      title: 'web-01',
      uuid: 'asset-1',
      ip: '10.0.0.1',
      asset_type: 'person',
      organizationId: 'personal'
    }
    const vm = wrapper.vm as any
    let confirmOptions: any
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((options: any) => {
      confirmOptions = options
      return {} as any
    })

    vm.handleContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), directHost)
    await nextTick()
    const menuItems = wrapper.findAll('.context-menu-item')
    expect(menuItems).toHaveLength(5)
    expect(menuItems.some((item) => /删除|Delete/.test(item.text()))).toBe(true)

    vm.contextMenuData = directHost
    await vm.handleContextMenuAction('deleteHost')
    expect(confirmSpy).toHaveBeenCalledOnce()
    await confirmOptions.onOk()

    expect(mockApi.deleteAsset).toHaveBeenCalledWith({ uuid: 'asset-1' })
    expect(mockEventBus.emit).toHaveBeenCalledWith('LocalAssetMenu')
    confirmSpy.mockRestore()
    wrapper.unmount()
  })

  it('counts every rendered direct host item when flipping the context menu above the cursor', async () => {
    const wrapper = mount(Workspace, {
      global: {
        stubs: {
          'a-tree': treeStub,
          'a-tabs': true,
          'a-tab-pane': true,
          'a-input': true,
          'a-button': true,
          'a-tooltip': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-popconfirm': true
        }
      }
    })
    await nextTick()

    const directHost = {
      key: 'host-1',
      title: 'web-01',
      uuid: 'asset-1',
      ip: '10.0.0.1',
      asset_type: 'person',
      organizationId: 'personal'
    }
    const vm = wrapper.vm as any
    const originalHeight = window.innerHeight
    // 180 + (6 + 5 * 25) overflows a 300px viewport, while 180 + (6 + 4 * 25) would still fit
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true, writable: true })

    try {
      vm.handleContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 180 }), directHost)
      await nextTick()

      const renderedItems = wrapper.findAll('.context-menu-item').length
      expect(renderedItems).toBe(5)
      expect(vm.contextMenuStyle.top).toBe(`${180 - (6 + renderedItems * 25)}px`)
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true, writable: true })
      wrapper.unmount()
    }
  })

  it('remounts the tree on every search instead of letting vc-tree diff the new data', async () => {
    const mounted = vi.fn()
    const wrapper = mount(Workspace, {
      global: {
        stubs: {
          'a-tree': { template: '<div class="workspace-tree-stub" />', mounted },
          'a-tabs': true,
          'a-tab-pane': true,
          'a-input': true,
          'a-button': true,
          'a-tooltip': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-popconfirm': true
        }
      }
    })

    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(mounted).toHaveBeenCalledTimes(1)

    const vm = wrapper.vm as any
    vm.searchValue = 'host'
    vm.onSearchInput()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
    expect(mounted).toHaveBeenCalledTimes(2)

    vm.searchValue = ''
    vm.onSearchInput()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
    expect(mounted).toHaveBeenCalledTimes(3)
    expect(vm.assetTreeData).toEqual([{ key: 'group', title: 'Group', children: [{ key: 'host', title: 'Host', ip: '10.0.0.1' }] }])

    wrapper.unmount()
  })
})

describe('Workspace search keyboard navigation', () => {
  // The auto stub swallows onKeydown as a prop; a real input forwards it the way vc-input does
  const searchInputStub = {
    emits: ['keydown'],
    template: '<input class="search-input-stub" @keydown="$emit(\'keydown\', $event)" />'
  }
  const scrollSpy = vi.fn()
  const scrollableTreeStub = {
    props: ['treeData'],
    template: '<div class="workspace-tree-stub" />',
    methods: {
      scrollTo(arg: unknown) {
        const keys = (this as any).treeData.map((node: any) => node.key)
        scrollSpy(keys, arg)
      }
    }
  }

  const hostTree = () => [
    { key: 'recent_connections', title: 'Recent', children: [{ key: 'recent_a', title: 'web-01', ip: '10.0.0.1' }] },
    {
      key: 'g1',
      title: 'Group',
      children: [
        { key: 'a', title: 'web-01', ip: '10.0.0.1' },
        { key: 'b', title: 'web-02', ip: '10.0.0.2' }
      ]
    }
  ]

  const mountWorkspace = async () => {
    const wrapper = mount(Workspace, {
      global: {
        stubs: {
          'a-tree': scrollableTreeStub,
          'a-tabs': true,
          'a-tab-pane': true,
          'a-input': searchInputStub,
          'a-button': true,
          'a-tooltip': true,
          'a-dropdown': true,
          'a-menu': true,
          'a-menu-item': true,
          'a-popconfirm': true
        }
      }
    })
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    return wrapper
  }

  const press = async (wrapper: ReturnType<typeof mount>, key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init })
    wrapper.find('.search-input-stub').element.dispatchEvent(event)
    await nextTick()
    return event
  }

  const search = async (wrapper: ReturnType<typeof mount>, value: string) => {
    const vm = wrapper.vm as any
    vm.searchValue = value
    vm.onSearchInput()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).api = mockApi
  })

  it('highlights the first match after a search and moves with the arrow keys', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()

    await search(wrapper, 'web')
    expect(vm.selectedKeys).toEqual(['recent_a'])

    const down = await press(wrapper, 'ArrowDown')
    expect(down.defaultPrevented).toBe(true)
    expect(vm.selectedKeys).toEqual(['a'])
    expect(scrollSpy).toHaveBeenLastCalledWith(['recent_connections', 'g1'], { key: 'a' })

    await press(wrapper, 'ArrowDown')
    expect(vm.selectedKeys).toEqual(['b'])

    await press(wrapper, 'ArrowDown')
    expect(vm.selectedKeys).toEqual(['recent_a'])

    await press(wrapper, 'ArrowUp')
    expect(vm.selectedKeys).toEqual(['b'])

    wrapper.unmount()
  })

  it('starts from the first or last host when nothing is highlighted', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()
    await search(wrapper, 'web')

    vm.selectedKeys = []
    await press(wrapper, 'ArrowDown')
    expect(vm.selectedKeys).toEqual(['recent_a'])

    vm.selectedKeys = []
    await press(wrapper, 'ArrowUp')
    expect(vm.selectedKeys).toEqual(['b'])

    wrapper.unmount()
  })

  it('skips hosts inside collapsed folders', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()
    await search(wrapper, 'web')

    vm.expandedKeys = ['recent_connections']
    vm.selectedKeys = ['recent_a']
    await press(wrapper, 'ArrowDown')
    expect(vm.selectedKeys).toEqual(['recent_a'])

    wrapper.unmount()
  })

  it('connects the highlighted host on Enter', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()
    await search(wrapper, 'web-02')
    expect(vm.selectedKeys).toEqual(['b'])

    const enter = await press(wrapper, 'Enter')
    expect(enter.defaultPrevented).toBe(true)
    expect(wrapper.emitted('currentClickServer')).toHaveLength(1)
    expect(wrapper.emitted('currentClickServer')![0][0]).toMatchObject({ key: 'b', ip: '10.0.0.2' })

    wrapper.unmount()
  })

  it('does not connect on Enter when the highlighted host is not visible', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()
    await search(wrapper, 'web')

    vm.selectedKeys = ['missing']
    await press(wrapper, 'Enter')
    expect(wrapper.emitted('currentClickServer')).toBeUndefined()

    wrapper.unmount()
  })

  it('applies a search still waiting on its debounce before handling the key', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()

    vm.searchValue = 'web-02'
    vm.onSearchInput()
    await press(wrapper, 'Enter')

    expect(wrapper.emitted('currentClickServer')![0][0]).toMatchObject({ key: 'b' })
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(vm.assetTreeData).toHaveLength(1)

    wrapper.unmount()
  })

  it('clears the highlight when a search matches nothing and keeps it when the search is cleared', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()

    await search(wrapper, 'no-such-host')
    expect(vm.selectedKeys).toEqual([])
    await press(wrapper, 'ArrowDown')
    expect(vm.selectedKeys).toEqual([])
    await press(wrapper, 'Enter')
    expect(wrapper.emitted('currentClickServer')).toBeUndefined()

    vm.selectedKeys = ['b']
    await search(wrapper, '')
    expect(vm.selectedKeys).toEqual(['b'])

    wrapper.unmount()
  })

  it('navigates the enterprise tree when the enterprise workspace is active', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.company = 'remote'
    vm.originalTreeData = hostTree()
    await search(wrapper, 'web-0')
    expect(vm.selectedKeys).toEqual(['recent_a'])

    await press(wrapper, 'ArrowDown')
    expect(vm.selectedKeys).toEqual(['a'])
    expect(scrollSpy).toHaveBeenLastCalledWith(['recent_connections', 'g1'], { key: 'a' })

    wrapper.unmount()
  })

  it('ignores IME composition and unrelated keys', async () => {
    const wrapper = await mountWorkspace()
    const vm = wrapper.vm as any
    vm.originalTreeData = hostTree()
    await search(wrapper, 'web')

    const composing = await press(wrapper, 'Enter', { isComposing: true })
    expect(composing.defaultPrevented).toBe(false)
    const imeKey = await press(wrapper, 'ArrowDown', { keyCode: 229 })
    expect(imeKey.defaultPrevented).toBe(false)
    const letter = await press(wrapper, 'a')
    expect(letter.defaultPrevented).toBe(false)

    expect(vm.selectedKeys).toEqual(['recent_a'])
    expect(wrapper.emitted('currentClickServer')).toBeUndefined()

    wrapper.unmount()
  })
})
