<template>
  <div class="k8s-cluster-config-container">
    <div class="split-layout">
      <div class="left-section">
        <div class="search-header">
          <a-input
            v-model:value="searchValue"
            class="search-input"
            :placeholder="t('common.search')"
            allow-clear
          >
            <template #suffix>
              <SearchOutlined />
            </template>
          </a-input>
          <a-button
            class="action-button"
            @click="handleAddCluster"
          >
            <template #icon><PlusOutlined /></template>
            {{ t('k8s.terminal.addCluster') }}
          </a-button>
        </div>

        <div class="cluster-list">
          <a-spin :spinning="k8sStore.loading">
            <div
              v-for="cluster in filteredClusters"
              :key="cluster.id"
              class="cluster-item"
              :class="{ active: selectedClusterId === cluster.id }"
              @click="handleSelectCluster(cluster)"
            >
              <div class="cluster-icon">
                <ClusterOutlined />
              </div>
              <div class="cluster-info">
                <div class="cluster-name">
                  {{ cluster.name }}
                  <a-tag
                    v-if="cluster.is_active === 1"
                    color="success"
                    size="small"
                  >
                    {{ t('k8s.terminal.active') }}
                  </a-tag>
                </div>
                <div class="cluster-context">{{ cluster.context_name }}</div>
              </div>
              <div class="cluster-status">
                <a-tag :color="getStatusColor(cluster.connection_status)">
                  {{ getStatusText(cluster.connection_status) }}
                </a-tag>
              </div>
            </div>
            <a-empty
              v-if="filteredClusters.length === 0"
              :description="t('k8s.terminal.noClusters')"
            />
          </a-spin>
        </div>
      </div>

      <div
        class="right-section"
        :class="{ collapsed: !selectedCluster }"
      >
        <div
          v-if="selectedCluster"
          class="cluster-detail"
        >
          <div class="detail-header">
            <h3>{{ selectedCluster.name }}</h3>
            <a-button
              type="text"
              @click="closeDetail"
            >
              <template #icon><CloseOutlined /></template>
            </a-button>
          </div>

          <a-form
            :label-col="{ span: 6 }"
            :wrapper-col="{ span: 18 }"
            class="detail-form"
          >
            <a-form-item :label="t('k8s.terminal.clusterName')">
              <a-input
                v-model:value="editForm.name"
                :placeholder="t('k8s.terminal.clusterNamePlaceholder')"
              />
            </a-form-item>

            <a-form-item :label="t('k8s.terminal.contextName')">
              <a-input
                v-model:value="editForm.contextName"
                :placeholder="t('k8s.terminal.contextNamePlaceholder')"
                disabled
              />
            </a-form-item>

            <a-form-item :label="t('k8s.terminal.serverUrl')">
              <a-input
                v-model:value="editForm.serverUrl"
                placeholder="https://kubernetes.default.svc:6443"
                disabled
              />
            </a-form-item>

            <a-form-item :label="t('k8s.terminal.defaultNamespace')">
              <a-input
                v-model:value="editForm.defaultNamespace"
                placeholder="default"
              />
            </a-form-item>

            <a-form-item :label="t('k8s.terminal.connectionStatus')">
              <a-tag :color="getStatusColor(selectedCluster.connection_status)">
                {{ getStatusText(selectedCluster.connection_status) }}
              </a-tag>
            </a-form-item>

            <div class="form-actions">
              <a-space>
                <a-button
                  type="primary"
                  :loading="saving"
                  @click="handleSave"
                >
                  {{ t('common.save') }}
                </a-button>
                <a-button @click="handleReset">
                  {{ t('common.reset') }}
                </a-button>
              </a-space>
            </div>
          </a-form>

          <a-divider />

          <div class="danger-zone">
            <div class="danger-info">
              <h4>{{ t('k8s.terminal.dangerZone') }}</h4>
              <p class="danger-warning">{{ t('k8s.terminal.deleteClusterWarning') }}</p>
            </div>
            <a-button
              type="text"
              danger
              @click="handleDelete"
            >
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </div>
        </div>

        <div
          v-else
          class="no-selection"
        >
          <a-empty :description="t('k8s.terminal.selectClusterToEdit')" />
        </div>
      </div>
    </div>

    <!-- Add Cluster Modal -->
    <AddClusterModal
      v-model:visible="showAddModal"
      @success="handleAddSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { SearchOutlined, PlusOutlined, ClusterOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { useK8sStore } from '@/store/k8sStore'
import type { K8sCluster } from '@/api/k8s'
import AddClusterModal from '@/views/k8s/terminal/components/AddClusterModal.vue'

const { t } = useI18n()
const k8sStore = useK8sStore()

const searchValue = ref('')
const selectedClusterId = ref<string | null>(null)
const showAddModal = ref(false)
const saving = ref(false)

const editForm = reactive({
  name: '',
  contextName: '',
  serverUrl: '',
  defaultNamespace: ''
})

const selectedCluster = computed(() => {
  if (!selectedClusterId.value) return null
  return k8sStore.clusters.find((c) => c.id === selectedClusterId.value) || null
})

const filteredClusters = computed(() => {
  if (!searchValue.value) return k8sStore.clusters
  const query = searchValue.value.toLowerCase().trim()
  return k8sStore.clusters.filter((c) => c.name.toLowerCase().includes(query) || c.context_name.toLowerCase().includes(query))
})

watch(selectedCluster, (cluster) => {
  if (cluster) {
    editForm.name = cluster.name
    editForm.contextName = cluster.context_name
    editForm.serverUrl = cluster.server_url || ''
    editForm.defaultNamespace = cluster.default_namespace || 'default'
  }
})

const getStatusColor = (status: string) => {
  switch (status) {
    case 'connected':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'connected':
      return t('k8s.terminal.connected')
    case 'error':
      return t('k8s.terminal.error')
    default:
      return t('k8s.terminal.disconnected')
  }
}

const handleSelectCluster = (cluster: K8sCluster) => {
  selectedClusterId.value = cluster.id
}

const closeDetail = () => {
  selectedClusterId.value = null
}

const handleAddCluster = () => {
  showAddModal.value = true
}

const handleAddSuccess = async () => {
  await k8sStore.loadClusters()
  message.success(t('k8s.terminal.clusterAdded'))
}

const handleSave = async () => {
  if (!selectedClusterId.value) return

  saving.value = true
  try {
    const result = await k8sStore.updateCluster(selectedClusterId.value, {
      name: editForm.name,
      defaultNamespace: editForm.defaultNamespace
    })

    if (result.success) {
      message.success(t('k8s.terminal.updateSuccess'))
    } else {
      message.error(result.error || t('k8s.terminal.updateFailed'))
    }
  } finally {
    saving.value = false
  }
}

const handleReset = () => {
  if (selectedCluster.value) {
    editForm.name = selectedCluster.value.name
    editForm.contextName = selectedCluster.value.context_name
    editForm.serverUrl = selectedCluster.value.server_url || ''
    editForm.defaultNamespace = selectedCluster.value.default_namespace || 'default'
  }
}

const handleDelete = () => {
  if (!selectedCluster.value) return

  Modal.confirm({
    wrapClassName: 'k8s-delete-confirm-modal',
    title: t('k8s.terminal.deleteConfirm'),
    content: t('k8s.terminal.deleteClusterMessage', { name: selectedCluster.value.name }),
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    okType: 'danger',
    onOk: async () => {
      if (!selectedClusterId.value) return

      const result = await k8sStore.removeCluster(selectedClusterId.value)
      if (result.success) {
        selectedClusterId.value = null
        message.success(t('k8s.terminal.deleteSuccess'))
      } else {
        message.error(result.error || t('k8s.terminal.deleteFailed'))
      }
    }
  })
}

// Initialize
k8sStore.loadClusters()
</script>

<style scoped>
.k8s-cluster-config-container {
  height: 100%;
  background-color: var(--bg-color);
  color: var(--text-color);
}

.split-layout {
  display: flex;
  height: 100%;
}

.left-section {
  width: 400px;
  min-width: 300px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.search-input.ant-input-affix-wrapper,
.search-input :deep(.ant-input-affix-wrapper),
.search-header :deep(.ant-input-affix-wrapper) {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: none !important;
}

.search-input :deep(.ant-input) {
  background-color: transparent !important;
  color: var(--text-color) !important;
}

.search-input :deep(.ant-input::placeholder) {
  color: var(--text-color-tertiary) !important;
}

.search-input :deep(.ant-input-suffix) {
  color: var(--text-color-tertiary) !important;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  transition: all 0.3s ease;
  white-space: nowrap;
}

.action-button:hover {
  background: var(--hover-bg-color);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.action-button:active {
  background: var(--active-bg-color);
}

.danger-zone :deep(.ant-btn-text.ant-btn-dangerous:hover) {
  background-color: rgba(255, 77, 79, 0.1) !important;
}

.cluster-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.cluster-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 12px;
  margin-bottom: 4px;
}

.cluster-item:hover {
  background-color: var(--hover-bg-color);
}

.cluster-item.active {
  background-color: var(--hover-bg-color);
  border: 1px solid var(--border-color);
}

.cluster-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color-secondary);
  border-radius: 8px;
  font-size: 20px;
  color: var(--text-color-secondary);
}

.cluster-info {
  flex: 1;
  min-width: 0;
}

.cluster-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.cluster-context {
  font-size: 12px;
  color: var(--text-color-tertiary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cluster-status {
  flex-shrink: 0;
}

.cluster-status :deep(.ant-tag) {
  background-color: var(--bg-color-tertiary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color-secondary) !important;
}

.right-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background-color: var(--bg-color);
}

.right-section.collapsed {
  display: flex;
  align-items: center;
  justify-content: center;
}

.cluster-detail {
  padding: 24px;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.detail-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.detail-form {
  max-width: 600px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

.detail-form :deep(.ant-form-item-label > label) {
  color: var(--text-color-secondary) !important;
}

.detail-form :deep(.ant-input) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

.detail-form :deep(.ant-tag) {
  background-color: var(--bg-color-tertiary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color-secondary) !important;
}

.cluster-status :deep(.ant-tag-success),
.cluster-name :deep(.ant-tag-success),
.detail-form :deep(.ant-tag-success) {
  background-color: rgba(82, 196, 26, 0.1) !important;
  border-color: rgba(82, 196, 26, 0.3) !important;
  color: #52c41a !important;
}

.detail-form :deep(.ant-input[disabled]) {
  background-color: var(--bg-color-tertiary) !important;
  color: var(--text-color-secondary) !important;
  border-color: var(--border-color) !important;
  opacity: 0.7;
}

/* Reset button styling */
:deep(.form-actions .ant-btn:not(.ant-btn-primary)) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

:deep(.form-actions .ant-btn:not(.ant-btn-primary):hover) {
  background-color: var(--hover-bg-color) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}

.danger-zone {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 32px;
  padding: 16px 20px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  max-width: 600px;
  background-color: rgba(239, 68, 68, 0.02);
}

.danger-info h4 {
  margin: 0 0 4px 0;
  color: var(--error-color);
  font-weight: 600;
  font-size: 14px;
}

.danger-warning {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-tertiary);
}

:deep(.ant-divider) {
  border-top-color: var(--border-color);
}
</style>

<style>
.k8s-delete-confirm-modal .ant-modal-content {
  background-color: var(--bg-color) !important;
  color: var(--text-color) !important;
}

.k8s-delete-confirm-modal .ant-modal-confirm-title {
  color: var(--text-color) !important;
}

.k8s-delete-confirm-modal .ant-modal-body,
.k8s-delete-confirm-modal .ant-modal-confirm-body-wrapper,
.k8s-delete-confirm-modal .ant-modal-confirm-body {
  background-color: transparent !important;
}

.k8s-delete-confirm-modal .ant-modal-confirm-content {
  color: var(--text-color-secondary) !important;
}

.k8s-delete-confirm-modal .ant-btn-dangerous,
.k8s-delete-confirm-modal .ant-btn-primary.ant-btn-dangerous {
  background-color: rgba(255, 77, 79, 0.1) !important;
  border-color: rgba(255, 77, 79, 0.4) !important;
  color: #ff4d4f !important;
}

.k8s-delete-confirm-modal .ant-btn-dangerous:hover,
.k8s-delete-confirm-modal .ant-btn-primary.ant-btn-dangerous:hover {
  background-color: rgba(255, 77, 79, 0.2) !important;
  border-color: #ff4d4f !important;
  color: #ff4d4f !important;
}

/* Style secondary buttons globally in K8s context (Modals) */
.k8s-delete-confirm-modal .ant-btn:not(.ant-btn-dangerous),
.cluster-settings-modal .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous),
.add-cluster-modal .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

.k8s-delete-confirm-modal .ant-btn:not(.ant-btn-dangerous):hover,
.cluster-settings-modal .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):hover,
.add-cluster-modal .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):hover {
  background-color: var(--hover-bg-color) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}
</style>
