/**
 * K8s Cluster Config Component Unit Tests
 *
 * Tests for the K8sClusterConfig.vue component including:
 * - Component mounting and rendering
 * - Search functionality
 * - Cluster list display
 * - Cluster selection
 * - Edit form functionality
 * - Add cluster modal
 * - Delete cluster functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Must be hoisted before vi.mock
const mockK8sStore = vi.hoisted(() => ({
  clusters: [] as any[],
  loading: false,
  loadClusters: vi.fn(),
  updateCluster: vi.fn(),
  removeCluster: vi.fn()
}))

// Mock i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'k8s.terminal.addCluster': 'Add Cluster',
        'k8s.terminal.noClusters': 'No clusters configured',
        'k8s.terminal.clusterName': 'Cluster Name',
        'k8s.terminal.clusterNamePlaceholder': 'Enter cluster name',
        'k8s.terminal.contextName': 'Context Name',
        'k8s.terminal.contextNamePlaceholder': 'Enter context name',
        'k8s.terminal.serverUrl': 'Server URL',
        'k8s.terminal.defaultNamespace': 'Default Namespace',
        'k8s.terminal.connectionStatus': 'Connection Status',
        'k8s.terminal.connected': 'Connected',
        'k8s.terminal.disconnected': 'Disconnected',
        'k8s.terminal.error': 'Error',
        'k8s.terminal.active': 'Active',
        'k8s.terminal.dangerZone': 'Danger Zone',
        'k8s.terminal.deleteClusterWarning': 'Delete this cluster. This action cannot be undone.',
        'k8s.terminal.deleteConfirm': 'Delete Cluster',
        'k8s.terminal.deleteClusterMessage': `Are you sure you want to delete cluster "${params?.name}"?`,
        'k8s.terminal.deleteSuccess': 'Cluster deleted',
        'k8s.terminal.deleteFailed': 'Failed to delete cluster',
        'k8s.terminal.updateSuccess': 'Cluster updated',
        'k8s.terminal.updateFailed': 'Failed to update cluster',
        'k8s.terminal.clusterAdded': 'Cluster added successfully',
        'k8s.terminal.selectClusterToEdit': 'Select a cluster to view and edit details',
        'common.save': 'Save',
        'common.reset': 'Reset',
        'common.search': 'Search',
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
    confirm: vi.fn((config) => {
      // Simulate OK click for testing
      if (config.onOk) {
        config.onOk()
      }
    })
  }
}))

// Mock icons
vi.mock('@ant-design/icons-vue', () => ({
  SearchOutlined: { template: '<span>Search</span>' },
  PlusOutlined: { template: '<span>+</span>' },
  ClusterOutlined: { template: '<span>Cluster</span>' },
  CloseOutlined: { template: '<span>X</span>' },
  DeleteOutlined: { template: '<span>Delete</span>' }
}))

// Mock k8sStore
vi.mock('@/store/k8sStore', () => ({
  useK8sStore: () => mockK8sStore
}))

// Mock AddClusterModal
vi.mock('@/views/k8s/terminal/components/AddClusterModal.vue', () => ({
  default: {
    name: 'AddClusterModal',
    template: '<div class="add-cluster-modal" v-if="visible"><slot /></div>',
    props: ['visible'],
    emits: ['update:visible', 'success']
  }
}))

// Import component after mocks
import K8sClusterConfig from '../K8sClusterConfig.vue'
import { message, Modal } from 'ant-design-vue'

describe('K8s Cluster Config Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const mockClusters = [
    {
      id: 'c1',
      name: 'Cluster 1',
      context_name: 'ctx1',
      server_url: 'https://localhost:6443',
      default_namespace: 'default',
      connection_status: 'connected',
      is_active: 1
    },
    {
      id: 'c2',
      name: 'Cluster 2',
      context_name: 'ctx2',
      server_url: 'https://localhost:6444',
      default_namespace: 'kube-system',
      connection_status: 'disconnected',
      is_active: 0
    },
    {
      id: 'c3',
      name: 'Production',
      context_name: 'prod',
      server_url: 'https://prod.example.com:6443',
      default_namespace: 'default',
      connection_status: 'error',
      is_active: 0
    }
  ]

  const createWrapper = () => {
    return mount(K8sClusterConfig, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-input': {
            template:
              '<div class="a-input-wrapper"><input class="a-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" :placeholder="placeholder" /></div>',
            props: ['value', 'placeholder', 'disabled']
          },
          'a-button': {
            template:
              "<button class=\"a-button\" :class=\"[type === 'primary' ? 'primary' : '', $attrs.danger !== undefined ? 'is-danger' : '']\" :disabled=\"loading\" @click=\"$emit('click')\"><slot name=\"icon\" /><slot /></button>",
            props: ['type', 'loading'],
            inheritAttrs: true
          },
          'a-spin': {
            template: '<div class="a-spin"><slot /></div>',
            props: ['spinning']
          },
          'a-empty': {
            template: '<div class="a-empty">{{ description }}</div>',
            props: ['description']
          },
          'a-tag': {
            template: '<span class="a-tag" :class="color">{{ $slots.default ? $slots.default()[0].children : "" }}<slot /></span>',
            props: ['color', 'size']
          },
          'a-form': {
            template: '<form class="a-form"><slot /></form>',
            props: ['labelCol', 'wrapperCol']
          },
          'a-form-item': {
            template: '<div class="a-form-item"><label>{{ label }}</label><slot /></div>',
            props: ['label', 'wrapperCol']
          },
          'a-space': {
            template: '<div class="a-space"><slot /></div>'
          },
          'a-divider': {
            template: '<hr class="a-divider" />'
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
    mockK8sStore.clusters = [...mockClusters]
    mockK8sStore.loading = false
    mockK8sStore.loadClusters.mockResolvedValue(undefined)
    mockK8sStore.updateCluster.mockResolvedValue({ success: true })
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

    it('should render search input', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.search-input').exists()).toBe(true)
    })

    it('should render add cluster button', () => {
      wrapper = createWrapper()
      const addButton = wrapper.find('.search-header .action-button')
      expect(addButton.exists()).toBe(true)
      expect(addButton.text()).toContain('Add Cluster')
    })

    it('should load clusters on mount', () => {
      wrapper = createWrapper()
      expect(mockK8sStore.loadClusters).toHaveBeenCalled()
    })
  })

  describe('Cluster List', () => {
    it('should render all clusters', () => {
      wrapper = createWrapper()
      const items = wrapper.findAll('.cluster-item')
      expect(items.length).toBe(3)
    })

    it('should display cluster names', () => {
      wrapper = createWrapper()
      const names = wrapper.findAll('.cluster-name')
      expect(names[0].text()).toContain('Cluster 1')
      expect(names[1].text()).toContain('Cluster 2')
      expect(names[2].text()).toContain('Production')
    })

    it('should display context names', () => {
      wrapper = createWrapper()
      const contexts = wrapper.findAll('.cluster-context')
      expect(contexts[0].text()).toBe('ctx1')
      expect(contexts[1].text()).toBe('ctx2')
      expect(contexts[2].text()).toBe('prod')
    })

    it('should display active tag for active cluster', () => {
      wrapper = createWrapper()
      const activeTags = wrapper.findAll('.a-tag.success')
      expect(activeTags.length).toBeGreaterThanOrEqual(1)
    })

    it('should display connection status tags', () => {
      wrapper = createWrapper()
      const statusTags = wrapper.findAll('.cluster-status .a-tag')
      expect(statusTags.length).toBe(3)
    })
  })

  describe('Search Functionality', () => {
    it('should filter clusters by name', async () => {
      wrapper = createWrapper()
      const searchInput = wrapper.find('.search-input .a-input')
      await searchInput.setValue('Production')
      await nextTick()

      const items = wrapper.findAll('.cluster-item')
      expect(items.length).toBe(1)
      expect(items[0].find('.cluster-name').text()).toContain('Production')
    })

    it('should filter clusters by context name', async () => {
      wrapper = createWrapper()
      const searchInput = wrapper.find('.search-input .a-input')
      await searchInput.setValue('ctx2')
      await nextTick()

      const items = wrapper.findAll('.cluster-item')
      expect(items.length).toBe(1)
      expect(items[0].find('.cluster-context').text()).toBe('ctx2')
    })

    it('should be case insensitive', async () => {
      wrapper = createWrapper()
      const searchInput = wrapper.find('.search-input .a-input')
      await searchInput.setValue('PRODUCTION')
      await nextTick()

      const items = wrapper.findAll('.cluster-item')
      expect(items.length).toBe(1)
    })

    it('should show all clusters when search is empty', async () => {
      wrapper = createWrapper()
      const searchInput = wrapper.find('.search-input .a-input')
      await searchInput.setValue('test')
      await nextTick()
      await searchInput.setValue('')
      await nextTick()

      const items = wrapper.findAll('.cluster-item')
      expect(items.length).toBe(3)
    })

    it('should show no results for non-matching search', async () => {
      wrapper = createWrapper()
      const searchInput = wrapper.find('.search-input .a-input')
      await searchInput.setValue('nonexistent')
      await nextTick()

      const items = wrapper.findAll('.cluster-item')
      expect(items.length).toBe(0)
      expect(wrapper.find('.a-empty').exists()).toBe(true)
    })
  })

  describe('Cluster Selection', () => {
    it('should select cluster when clicked', async () => {
      wrapper = createWrapper()
      const firstCluster = wrapper.findAll('.cluster-item')[0]
      await firstCluster.trigger('click')
      await nextTick()

      expect(wrapper.vm.selectedClusterId).toBe('c1')
    })

    it('should show detail panel when cluster is selected', async () => {
      wrapper = createWrapper()
      const firstCluster = wrapper.findAll('.cluster-item')[0]
      await firstCluster.trigger('click')
      await nextTick()

      expect(wrapper.find('.cluster-detail').exists()).toBe(true)
    })

    it('should populate edit form with cluster data', async () => {
      wrapper = createWrapper()
      const firstCluster = wrapper.findAll('.cluster-item')[0]
      await firstCluster.trigger('click')
      await nextTick()

      expect(wrapper.vm.editForm.name).toBe('Cluster 1')
      expect(wrapper.vm.editForm.contextName).toBe('ctx1')
      expect(wrapper.vm.editForm.serverUrl).toBe('https://localhost:6443')
      expect(wrapper.vm.editForm.defaultNamespace).toBe('default')
    })

    it('should add active class to selected cluster', async () => {
      wrapper = createWrapper()
      const firstCluster = wrapper.findAll('.cluster-item')[0]
      await firstCluster.trigger('click')
      await nextTick()

      expect(firstCluster.classes()).toContain('active')
    })
  })

  describe('Detail Panel', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      const firstCluster = wrapper.findAll('.cluster-item')[0]
      await firstCluster.trigger('click')
      await nextTick()
    })

    it('should display cluster name in header', () => {
      const header = wrapper.find('.detail-header h3')
      expect(header.text()).toBe('Cluster 1')
    })

    it('should have close button', () => {
      const closeButton = wrapper.find('.detail-header .a-button')
      expect(closeButton.exists()).toBe(true)
    })

    it('should close detail panel when close button clicked', async () => {
      const closeButton = wrapper.find('.detail-header .a-button')
      await closeButton.trigger('click')
      await nextTick()

      expect(wrapper.vm.selectedClusterId).toBeNull()
      expect(wrapper.find('.cluster-detail').exists()).toBe(false)
    })

    it('should show empty state when no cluster selected', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.no-selection').exists()).toBe(true)
      expect(wrapper.text()).toContain('Select a cluster to view and edit details')
    })
  })

  describe('Edit Form', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      const firstCluster = wrapper.findAll('.cluster-item')[0]
      await firstCluster.trigger('click')
      await nextTick()
    })

    it('should allow editing cluster name', async () => {
      const nameInput = wrapper.find('.detail-form .a-input')
      await nameInput.setValue('Updated Cluster Name')
      await nextTick()

      expect(wrapper.vm.editForm.name).toBe('Updated Cluster Name')
    })

    it('should save changes when save button clicked', async () => {
      wrapper.vm.editForm.name = 'Updated Name'
      await nextTick()

      const saveButton = wrapper.find('.detail-form .a-button.primary')
      await saveButton.trigger('click')
      await nextTick()

      expect(mockK8sStore.updateCluster).toHaveBeenCalledWith('c1', {
        name: 'Updated Name',
        defaultNamespace: 'default'
      })
      expect(message.success).toHaveBeenCalledWith('Cluster updated')
    })

    it('should show error on save failure', async () => {
      mockK8sStore.updateCluster.mockResolvedValue({ success: false, error: 'Update failed' })

      wrapper.vm.editForm.name = 'Updated Name'
      await nextTick()

      const saveButton = wrapper.find('.detail-form .a-button.primary')
      await saveButton.trigger('click')
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Update failed')
    })

    it('should reset form when reset button clicked', async () => {
      wrapper.vm.editForm.name = 'Changed Name'
      wrapper.vm.editForm.defaultNamespace = 'changed'
      await nextTick()

      const buttons = wrapper.findAll('.detail-form .a-space .a-button')
      const resetButton = buttons[1] // Second button is reset
      await resetButton.trigger('click')
      await nextTick()

      expect(wrapper.vm.editForm.name).toBe('Cluster 1')
      expect(wrapper.vm.editForm.defaultNamespace).toBe('default')
    })
  })

  describe('Danger Zone', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      const firstCluster = wrapper.findAll('.cluster-item')[0]
      await firstCluster.trigger('click')
      await nextTick()
    })

    it('should render danger zone section', () => {
      const dangerZone = wrapper.find('.danger-zone')
      expect(dangerZone.exists()).toBe(true)
    })

    it('should have delete button', () => {
      const deleteButton = wrapper.find('.danger-zone .a-button.is-danger')
      expect(deleteButton.exists()).toBe(true)
    })

    it('should show confirm dialog when delete clicked', async () => {
      const deleteButton = wrapper.find('.danger-zone .a-button.is-danger')
      await deleteButton.trigger('click')
      await nextTick()

      expect(Modal.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Delete Cluster',
          okType: 'danger'
        })
      )
    })

    it('should delete cluster and clear selection', async () => {
      const deleteButton = wrapper.find('.danger-zone .a-button.is-danger')
      await deleteButton.trigger('click')
      await nextTick()

      expect(mockK8sStore.removeCluster).toHaveBeenCalledWith('c1')
      expect(wrapper.vm.selectedClusterId).toBeNull()
      expect(message.success).toHaveBeenCalledWith('Cluster deleted')
    })

    it('should show error on delete failure', async () => {
      mockK8sStore.removeCluster.mockResolvedValue({ success: false, error: 'Delete failed' })

      const deleteButton = wrapper.find('.danger-zone .a-button.is-danger')
      await deleteButton.trigger('click')
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Delete failed')
    })
  })

  describe('Add Cluster Modal', () => {
    it('should open modal when add button clicked', async () => {
      wrapper = createWrapper()
      const addButton = wrapper.find('.search-header .action-button')
      await addButton.trigger('click')
      await nextTick()

      expect(wrapper.find('.add-cluster-modal').exists()).toBe(true)
    })

    it('should reload clusters on add success', async () => {
      wrapper = createWrapper()
      await wrapper.vm.handleAddSuccess()
      await nextTick()

      expect(mockK8sStore.loadClusters).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith('Cluster added successfully')
    })
  })

  describe('Status Colors', () => {
    it('should return success color for connected status', () => {
      wrapper = createWrapper()
      expect(wrapper.vm.getStatusColor('connected')).toBe('success')
    })

    it('should return error color for error status', () => {
      wrapper = createWrapper()
      expect(wrapper.vm.getStatusColor('error')).toBe('error')
    })

    it('should return default color for disconnected status', () => {
      wrapper = createWrapper()
      expect(wrapper.vm.getStatusColor('disconnected')).toBe('default')
    })
  })

  describe('Status Text', () => {
    it('should return Connected for connected status', () => {
      wrapper = createWrapper()
      expect(wrapper.vm.getStatusText('connected')).toBe('Connected')
    })

    it('should return Error for error status', () => {
      wrapper = createWrapper()
      expect(wrapper.vm.getStatusText('error')).toBe('Error')
    })

    it('should return Disconnected for disconnected status', () => {
      wrapper = createWrapper()
      expect(wrapper.vm.getStatusText('disconnected')).toBe('Disconnected')
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no clusters', () => {
      mockK8sStore.clusters = []
      wrapper = createWrapper()

      expect(wrapper.find('.a-empty').exists()).toBe(true)
    })
  })

  describe('Loading State', () => {
    it('should show loading spinner when loading', () => {
      mockK8sStore.loading = true
      wrapper = createWrapper()

      const spin = wrapper.find('.a-spin')
      expect(spin.exists()).toBe(true)
    })
  })
})
