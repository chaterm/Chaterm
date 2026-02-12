import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ExtensionViewHost from '../ExtensionViewHost.vue'
import eventBus from '@/utils/eventBus'

// Mock window.api
const mockApi = {
  getTreeNodes: vi.fn(),
  getViewMetadata: vi.fn(),
  getAllContexts: vi.fn(),
  executeCommand: vi.fn(),
  onContextUpdate: vi.fn(() => vi.fn()),
  onOpenEditorRequest: vi.fn(() => vi.fn()),
  onOpenUserTabRequest: vi.fn<(cb: any) => () => void>(),
  onRefreshView: vi.fn()
}
;(window as any).api = mockApi

// 2. Mock eventBus
vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn()
  }
}))

// Stub Ant Design Vue components not auto-resolved in test env
const defaultMountOptions = {
  global: { stubs: { 'a-empty': true } }
}

describe('ExtensionViewHost.vue', () => {
  let wrapper: VueWrapper<any>

  beforeEach(() => {
    vi.clearAllMocks()

    // Default Mock return value
    mockApi.getViewMetadata.mockResolvedValue({
      name: 'Test View',
      menus: { 'view/title': [] },
      welcomes: []
    })
    mockApi.getAllContexts.mockResolvedValue({})
    mockApi.getTreeNodes.mockResolvedValue([
      { title: 'Node 1', key: 'n1', isLeaf: false },
      { title: 'Leaf 1', key: 'l1', isLeaf: true }
    ])
  })

  it('When mounting a component, metadata should be obtained and tree nodes should be loaded', async () => {
    wrapper = mount(ExtensionViewHost, {
      ...defaultMountOptions,
      props: { viewId: 'testView' }
    })

    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockApi.getViewMetadata).toHaveBeenCalledWith('testView')
    expect(mockApi.getTreeNodes).toHaveBeenCalledWith({ viewId: 'testView' })

    expect(wrapper.find('.vs-title').text()).toBe('Test View')
  })

  it('When entering information into the search box, tree nodes should be filtered correctly', async () => {
    mockApi.getTreeNodes.mockResolvedValue([
      { title: 'Apple', key: '1', isLeaf: true },
      { title: 'Banana', key: '2', isLeaf: true }
    ])

    wrapper = mount(ExtensionViewHost, {
      ...defaultMountOptions,
      props: { viewId: 'testView' }
    })

    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    wrapper.vm.searchValue = 'App'
    await nextTick()

    expect(wrapper.vm.filteredTreeData).toHaveLength(1)
    expect(wrapper.vm.filteredTreeData[0].title).toBe('Apple')
  })

  it('Clicking a leaf node should trigger handleNodeClick and execute the command', async () => {
    const nodeData = { title: 'Leaf', key: 'l1', isLeaf: true, command: 'test.cmd' }
    mockApi.getTreeNodes.mockResolvedValue([nodeData])

    wrapper = mount(ExtensionViewHost, {
      ...defaultMountOptions,
      props: { viewId: 'testView' }
    })
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    await wrapper.vm.handleNodeRowClick(nodeData)

    expect(mockApi.executeCommand).toHaveBeenCalledWith('test.cmd', nodeData)
  })

  it('Clicking on a non-leaf node should toggle its expanded/collapsed state', async () => {
    const folderData = { title: 'Folder', key: 'f1', isLeaf: false }
    wrapper = mount(ExtensionViewHost, {
      ...defaultMountOptions,
      props: { viewId: 'testView' }
    })

    await wrapper.vm.handleNodeRowClick(folderData)
    expect(wrapper.vm.expandedKeys).toContain('f1')

    await wrapper.vm.handleNodeRowClick(folderData)
    expect(wrapper.vm.expandedKeys).not.toContain('f1')
  })
  it('Upon receiving the openEditorRequest, the open tab event should be sent via the eventBus', async () => {
    let capturedCallback: any = null

    // @ts-ignore
    mockApi.onOpenEditorRequest.mockImplementation((cb) => {
      capturedCallback = cb
      return () => {
        console.log('unbound')
      }
    })

    wrapper = mount(ExtensionViewHost, { ...defaultMountOptions, props: { viewId: 'test' } })

    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(capturedCallback).toBeTypeOf('function')

    const testParams = {
      pluginId: 'p1',
      title: 'Config',
      filePath: '/test.json',
      content: '{}'
    }

    capturedCallback(testParams)

    expect(eventBus.emit).toHaveBeenCalledWith(
      'open-user-tab',
      expect.objectContaining({
        content: 'CommonConfigEditor',
        props: expect.objectContaining({
          pluginId: 'p1',
          filePath: '/test.json'
        })
      })
    )
  })
  it('The listener should be removed during uninstallation', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    wrapper = mount(ExtensionViewHost, {
      ...defaultMountOptions,
      props: { viewId: 'testView' }
    })

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function))
  })
})
