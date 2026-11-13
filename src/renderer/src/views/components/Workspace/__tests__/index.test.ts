import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { Modal, message } from 'ant-design-vue'
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
    deleteAsset: vi.fn(async () => ({ data: { message: 'success' } })),
    updateLocalAssetLabel: vi.fn(async () => ({ data: { message: 'success' } })),
    updateOrganizationAssetComment: vi.fn(async () => ({ data: { message: 'success' } }))
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

    expect(menuItems[0].text()).toMatch(/复制主机名|Copy Hostname/)

    vm.showIpMode = true
    vm.handleContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), host)
    await nextTick()
    expect(wrapper.find('.context-menu-item').text()).toMatch(/复制IP|Copy IP/)
    await vm.handleContextMenuAction('copy')
    expect(writeText).toHaveBeenLastCalledWith('10.0.0.1')

    // IP mode falls back to the hostname for hosts without an IP
    const hostWithoutIp = { key: 'host-no-ip', title: 'web-02' }
    vm.handleContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), hostWithoutIp)
    await nextTick()
    expect(wrapper.find('.context-menu-item').text()).toMatch(/复制主机名|Copy Hostname/)

    // Folder nodes get no copy item
    const folder = { key: 'folder_1', title: 'Folder', asset_type: 'custom_folder', children: [] }
    vm.handleContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), folder)
    await nextTick()
    expect(wrapper.findAll('.context-menu-item').some((item) => /复制|Copy/.test(item.text()))).toBe(false)

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
    expect(menuItems.some((item) => /重命名|Rename/.test(item.text()))).toBe(true)

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

  describe('inline editing', () => {
    const focus = vi.fn()
    const select = vi.fn()
    const inputStub = {
      props: ['value'],
      template: '<input class="input-stub" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
      setup: (_: unknown, { expose }: { expose: (api: Record<string, unknown>) => void }) => expose({ focus, select })
    }
    const slotTreeStub = {
      props: ['treeData'],
      template:
        '<div class="slot-tree"><div v-for="node in treeData" :key="node.key"><slot name="title" :title="node.title" :data-ref="node" /></div></div>'
    }
    const mountWorkspace = () =>
      mount(Workspace, {
        global: {
          stubs: {
            'a-tree': slotTreeStub,
            'a-input': inputStub,
            'a-tabs': true,
            'a-tab-pane': true,
            'a-button': true,
            'a-tooltip': true,
            'a-dropdown': true,
            'a-menu': true,
            'a-menu-item': true,
            'a-popconfirm': true
          }
        }
      })
    const directHost = {
      key: 'host-1',
      title: 'web-01',
      uuid: 'asset-1',
      ip: '10.0.0.1',
      asset_type: 'person',
      organizationId: 'personal'
    }

    beforeEach(() => {
      focus.mockClear()
      select.mockClear()
    })

    it('renames a direct host inline and refreshes the asset menu', async () => {
      const wrapper = mountWorkspace()
      // Let the initial asset load settle so it cannot overwrite the tree below
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
      const vm = wrapper.vm as any
      vm.assetTreeData = [directHost]
      await nextTick()

      vm.handleContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), directHost)
      await nextTick()
      const renameItem = wrapper.findAll('.context-menu-item').find((item) => /重命名|Rename/.test(item.text()))
      await renameItem!.trigger('click')
      await nextTick()
      expect(vm.editingNode).toBe('host-1')
      expect(vm.editingTitle).toBe('web-01')
      expect(focus).toHaveBeenCalledOnce()
      expect(select).toHaveBeenCalledOnce()
      expect(wrapper.find('.edit-container').exists()).toBe(true)

      // Enter with an unchanged name leaves edit mode without saving
      await wrapper.find('.edit-container .input-stub').trigger('keydown', { key: 'Enter' })
      await nextTick()
      expect(vm.editingNode).toBeNull()
      expect(mockApi.updateLocalAssetLabel).not.toHaveBeenCalled()

      // Escape cancels
      vm.contextMenuData = directHost
      await vm.handleContextMenuAction('rename')
      await nextTick()
      await wrapper.find('.edit-container .input-stub').setValue('web-02')
      await wrapper.find('.edit-container .input-stub').trigger('keydown', { key: 'Escape' })
      await nextTick()
      expect(vm.editingNode).toBeNull()
      expect(mockApi.updateLocalAssetLabel).not.toHaveBeenCalled()

      // The confirm icon saves the trimmed name and reloads the tree
      vm.contextMenuData = directHost
      await vm.handleContextMenuAction('rename')
      await nextTick()
      await wrapper.find('.edit-container .input-stub').setValue('  web-02  ')
      await wrapper.find('.edit-container .confirm-icon').trigger('click')
      await nextTick()
      expect(mockApi.updateLocalAssetLabel).toHaveBeenCalledWith({ uuid: 'asset-1', label: 'web-02' })
      expect(mockEventBus.emit).toHaveBeenCalledWith('LocalAssetMenu')
      expect(vm.editingNode).toBeNull()

      // The cancel icon leaves edit mode
      vm.contextMenuData = directHost
      await vm.handleContextMenuAction('rename')
      await nextTick()
      await wrapper.find('.edit-container .cancel-icon').trigger('click')
      expect(vm.editingNode).toBeNull()

      wrapper.unmount()
    })

    it('keeps the rename input open and reports a failed save', async () => {
      const errorSpy = vi.spyOn(message, 'error').mockImplementation((() => undefined) as any)
      const wrapper = mountWorkspace()
      await nextTick()
      const vm = wrapper.vm as any

      // A blank name cancels without calling the API
      vm.editingNode = 'host-1'
      vm.editingTitle = '   '
      await vm.saveRename(directHost)
      expect(vm.editingNode).toBeNull()
      expect(mockApi.updateLocalAssetLabel).not.toHaveBeenCalled()

      mockApi.updateLocalAssetLabel.mockResolvedValueOnce({ data: { message: 'failed' } } as any)
      vm.editingNode = 'host-1'
      vm.editingTitle = 'web-02'
      await vm.saveRename(directHost)
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(vm.editingNode).toBe('host-1')

      mockApi.updateLocalAssetLabel.mockRejectedValueOnce(new Error('db locked'))
      await vm.saveRename(directHost)
      expect(errorSpy).toHaveBeenCalledTimes(2)
      expect(vm.editingNode).toBe('host-1')
      expect(mockEventBus.emit).not.toHaveBeenCalledWith('LocalAssetMenu')

      errorSpy.mockRestore()
      wrapper.unmount()
    })

    it('focuses the comment input when a bastion host starts editing its comment', async () => {
      const wrapper = mountWorkspace()
      await nextTick()
      const vm = wrapper.vm as any
      const bastionHost = { key: 'org_10.0.0.9_host', title: 'host', ip: '10.0.0.9', comment: 'gpu node', organizationId: 'org-uuid' }
      vm.enterpriseData = [bastionHost]
      await nextTick()

      vm.contextMenuData = bastionHost
      await vm.handleContextMenuAction('comment')
      await nextTick()
      expect(vm.commentNode).toBe('org_10.0.0.9_host')
      expect(vm.editingComment).toBe('gpu node')
      expect(wrapper.find('.comment-edit-container .input-stub').exists()).toBe(true)
      expect(focus).toHaveBeenCalledOnce()

      wrapper.unmount()
    })
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
