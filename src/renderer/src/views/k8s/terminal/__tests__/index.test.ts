/**
 * K8s Terminal Sidebar Component Unit Tests
 *
 * Tests for the K8s Terminal index.vue component including:
 * - Component mounting and rendering
 * - Cluster list display
 * - Add cluster functionality
 * - Refresh functionality
 * - Settings button
 * - Cluster operations (connect, disconnect, edit, delete)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Must be hoisted before vi.mock
const mockEventBus = vi.hoisted(() => ({
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}))

const mockK8sStore = vi.hoisted(() => ({
  clusters: [] as any[],
  activeClusterId: null as string | null,
  loading: false,
  initialize: vi.fn(),
  loadClusters: vi.fn(),
  connectCluster: vi.fn(),
  disconnectCluster: vi.fn(),
  removeCluster: vi.fn()
}))

// Mock i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'k8s.terminal.clusters': 'Clusters',
        'k8s.terminal.addCluster': 'Add Cluster',
        'k8s.terminal.noClusters': 'No clusters configured',
        'k8s.terminal.refreshSuccess': 'Clusters refreshed',
        'k8s.terminal.connectSuccess': 'Connected to cluster',
        'k8s.terminal.connectFailed': 'Failed to connect to cluster',
        'k8s.terminal.disconnectSuccess': 'Disconnected from cluster',
        'k8s.terminal.disconnectFailed': 'Failed to disconnect from cluster',
        'k8s.terminal.updateSuccess': 'Cluster updated',
        'k8s.terminal.deleteConfirm': 'Delete Cluster',
        'k8s.terminal.deleteClusterMessage': `Are you sure you want to delete cluster "${params?.name}"?`,
        'k8s.terminal.deleteSuccess': 'Cluster deleted',
        'k8s.terminal.deleteFailed': 'Failed to delete cluster',
        'k8s.terminal.clusterAdded': 'Cluster added successfully',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel'
      }
      return translations[key] || key
    }
  })
}))

// Mock Ant Design Vue
vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  },
  Modal: {
    confirm: vi.fn()
  }
}))

// Mock icons
vi.mock('@ant-design/icons-vue', () => ({
  PlusOutlined: { template: '<span>+</span>' },
  ReloadOutlined: { template: '<span>R</span>' },
  SettingOutlined: { template: '<span>S</span>' }
}))

// Mock eventBus
vi.mock('@/utils/eventBus', () => ({
  default: mockEventBus
}))

// Mock k8sStore
vi.mock('@/store/k8sStore', () => ({
  useK8sStore: () => mockK8sStore
}))

// Mock child components
vi.mock('../components/ClusterItem.vue', () => ({
  default: {
    name: 'ClusterItem',
    template: `
      <div class="cluster-item" @click="$emit('select')">
        <span class="cluster-name">{{ cluster.name }}</span>
        <button class="btn-connect" @click.stop="$emit('connect')">Connect</button>
        <button class="btn-disconnect" @click.stop="$emit('disconnect')">Disconnect</button>
        <button class="btn-edit" @click.stop="$emit('edit')">Edit</button>
        <button class="btn-delete" @click.stop="$emit('delete')">Delete</button>
      </div>
    `,
    props: ['cluster', 'isActive'],
    emits: ['select', 'connect', 'disconnect', 'edit', 'delete']
  }
}))

vi.mock('../components/AddClusterModal.vue', () => ({
  default: {
    name: 'AddClusterModal',
    template: '<div class="add-cluster-modal" v-if="visible"><slot /></div>',
    props: ['visible'],
    emits: ['update:visible', 'success']
  }
}))

vi.mock('../components/ClusterSettings.vue', () => ({
  default: {
    name: 'ClusterSettings',
    template: '<div class="cluster-settings" v-if="visible"><slot /></div>',
    props: ['visible', 'cluster'],
    emits: ['update:visible', 'success', 'delete']
  }
}))

// Import component after mocks
import K8sTerminalIndex from '../index.vue'
import { message, Modal } from 'ant-design-vue'

describe('K8s Terminal Sidebar Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = () => {
    return mount(K8sTerminalIndex, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-button': {
            template: '<button :class="$attrs.class" :disabled="loading" @click="$emit(\'click\')"><slot /><slot name="icon" /></button>',
            props: ['loading', 'type', 'size']
          },
          'a-spin': {
            template: '<div class="a-spin"><slot /></div>',
            props: ['spinning']
          },
          'a-empty': {
            template: '<div class="a-empty"><span>{{ description }}</span><slot /></div>',
            props: ['description', 'imageStyle']
          }
        }
      }
    })
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    // Reset mock store state
    mockK8sStore.clusters = []
    mockK8sStore.activeClusterId = null
    mockK8sStore.loading = false
    mockK8sStore.initialize.mockResolvedValue(undefined)
    mockK8sStore.loadClusters.mockResolvedValue(undefined)
    mockK8sStore.connectCluster.mockResolvedValue({ success: true })
    mockK8sStore.disconnectCluster.mockResolvedValue({ success: true })
    mockK8sStore.removeCluster.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', () => {
      wrapper = createWrapper()
      expect(wrapper.exists()).toBe(true)
    })

    it('should render header with title', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.header-title').text()).toBe('Clusters')
    })

    it('should render action buttons', () => {
      wrapper = createWrapper()
      const buttons = wrapper.findAll('.action-button')
      expect(buttons.length).toBe(3) // Add, Refresh, Settings
    })

    it('should initialize k8sStore on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      expect(mockK8sStore.initialize).toHaveBeenCalled()
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no clusters', () => {
      mockK8sStore.clusters = []
      wrapper = createWrapper()
      expect(wrapper.find('.a-empty').exists()).toBe(true)
      expect(wrapper.text()).toContain('No clusters configured')
    })

    it('should show Add Cluster button in empty state', () => {
      mockK8sStore.clusters = []
      wrapper = createWrapper()
      const emptyButton = wrapper.find('.empty-clusters button')
      expect(emptyButton.exists()).toBe(true)
    })
  })

  describe('Cluster List', () => {
    it('should render cluster items when clusters exist', () => {
      mockK8sStore.clusters = [
        { id: 'c1', name: 'Cluster 1' },
        { id: 'c2', name: 'Cluster 2' }
      ]
      wrapper = createWrapper()

      const items = wrapper.findAll('.cluster-item')
      expect(items.length).toBe(2)
    })

    it('should pass correct isActive prop to cluster item', () => {
      mockK8sStore.clusters = [
        { id: 'c1', name: 'Cluster 1' },
        { id: 'c2', name: 'Cluster 2' }
      ]
      mockK8sStore.activeClusterId = 'c1'
      wrapper = createWrapper()

      const clusterItems = wrapper.findAllComponents({ name: 'ClusterItem' })
      expect(clusterItems[0].props('isActive')).toBe(true)
      expect(clusterItems[1].props('isActive')).toBe(false)
    })
  })

  describe('Add Cluster', () => {
    it('should open add cluster modal when add button clicked', async () => {
      wrapper = createWrapper()
      const addButton = wrapper.findAll('.action-button')[0]
      await addButton.trigger('click')
      await nextTick()

      expect(wrapper.vm.showAddClusterModal).toBe(true)
    })

    it('should open add cluster modal from empty state button', async () => {
      mockK8sStore.clusters = []
      wrapper = createWrapper()
      const emptyButton = wrapper.find('.empty-clusters button')
      await emptyButton.trigger('click')
      await nextTick()

      expect(wrapper.vm.showAddClusterModal).toBe(true)
    })
  })

  describe('Refresh', () => {
    it('should call loadClusters when refresh button clicked', async () => {
      wrapper = createWrapper()
      const refreshButton = wrapper.findAll('.action-button')[1]
      await refreshButton.trigger('click')
      await nextTick()

      expect(mockK8sStore.loadClusters).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith('Clusters refreshed')
    })
  })

  describe('Settings Button', () => {
    it('should emit open-user-tab event when settings button clicked', async () => {
      wrapper = createWrapper()
      const settingsButton = wrapper.findAll('.action-button')[2]
      await settingsButton.trigger('click')
      await nextTick()

      expect(mockEventBus.emit).toHaveBeenCalledWith('open-user-tab', 'k8sClusterConfig')
    })
  })

  describe('Cluster Operations', () => {
    beforeEach(() => {
      mockK8sStore.clusters = [{ id: 'c1', name: 'Cluster 1', server_url: 'http://s1' }]
    })

    describe('Click Cluster', () => {
      it('should connect to cluster and emit event on click', async () => {
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('select')
        await nextTick()

        expect(mockK8sStore.connectCluster).toHaveBeenCalledWith('c1')
        expect(mockEventBus.emit).toHaveBeenCalledWith(
          'currentClickServer',
          expect.objectContaining({
            key: 'k8s-c1',
            type: 'k8s'
          })
        )
      })

      it('should show error message when connect fails', async () => {
        mockK8sStore.connectCluster.mockResolvedValue({ success: false, error: 'Connection failed' })
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('select')
        await nextTick()

        expect(message.error).toHaveBeenCalledWith('Connection failed')
      })
    })

    describe('Connect', () => {
      it('should connect to cluster', async () => {
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('connect')
        await nextTick()

        expect(mockK8sStore.connectCluster).toHaveBeenCalledWith('c1')
        expect(message.success).toHaveBeenCalledWith('Connected to cluster')
      })

      it('should show error on connect failure', async () => {
        mockK8sStore.connectCluster.mockResolvedValue({ success: false, error: 'Failed' })
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('connect')
        await nextTick()

        expect(message.error).toHaveBeenCalledWith('Failed')
      })
    })

    describe('Disconnect', () => {
      it('should disconnect from cluster', async () => {
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('disconnect')
        await nextTick()

        expect(mockK8sStore.disconnectCluster).toHaveBeenCalledWith('c1')
        expect(message.success).toHaveBeenCalledWith('Disconnected from cluster')
      })

      it('should show error on disconnect failure', async () => {
        mockK8sStore.disconnectCluster.mockResolvedValue({ success: false, error: 'Failed' })
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('disconnect')
        await nextTick()

        expect(message.error).toHaveBeenCalledWith('Failed')
      })
    })

    describe('Edit', () => {
      it('should open edit modal', async () => {
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('edit')
        await nextTick()

        expect(wrapper.vm.showEditModal).toBe(true)
        expect(wrapper.vm.editingCluster).toEqual(mockK8sStore.clusters[0])
      })
    })

    describe('Delete', () => {
      it('should show confirm dialog on delete', async () => {
        wrapper = createWrapper()
        const clusterItem = wrapper.findComponent({ name: 'ClusterItem' })
        await clusterItem.vm.$emit('delete')
        await nextTick()

        expect(Modal.confirm).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Delete Cluster',
            okType: 'danger'
          })
        )
      })
    })
  })

  describe('Loading State', () => {
    it('should show loading state on refresh button', async () => {
      mockK8sStore.loading = true
      wrapper = createWrapper()

      const refreshButton = wrapper.findAll('.action-button')[1]
      expect(refreshButton.attributes('disabled')).toBeDefined()
    })
  })

  describe('Modal Callbacks', () => {
    it('should reload clusters on add success', async () => {
      wrapper = createWrapper()
      wrapper.vm.showAddClusterModal = true
      await nextTick()

      await wrapper.vm.handleClusterAdded()

      expect(mockK8sStore.loadClusters).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith('Cluster added successfully')
    })

    it('should reload clusters on edit success', async () => {
      wrapper = createWrapper()
      wrapper.vm.showEditModal = true
      wrapper.vm.editingCluster = { id: 'c1', name: 'Test' }
      await nextTick()

      await wrapper.vm.handleEditSuccess()

      expect(wrapper.vm.showEditModal).toBe(false)
      expect(wrapper.vm.editingCluster).toBeNull()
      expect(mockK8sStore.loadClusters).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith('Cluster updated')
    })
  })
})
