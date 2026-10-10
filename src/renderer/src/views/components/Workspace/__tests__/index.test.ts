import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
    removeConnectionHistory: vi.fn(async () => ({ data: { message: 'success', changes: 1 } }))
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
})
