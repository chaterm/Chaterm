<template>
  <a-modal
    :open="visible"
    :title="t('k8s.terminal.manageCluster')"
    :width="600"
    :footer="null"
    wrap-class-name="cluster-manage-modal"
    @cancel="handleClose"
  >
    <a-table
      :data-source="k8sStore.clusters"
      :columns="columns"
      :pagination="false"
      :loading="k8sStore.loading"
      row-key="id"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <div class="cluster-name">
            <span>{{ record.name }}</span>
            <a-tag
              v-if="record.is_active === 1"
              color="success"
              size="small"
            >
              {{ t('k8s.terminal.active') }}
            </a-tag>
          </div>
        </template>
        <template v-if="column.key === 'status'">
          <a-tag :color="getStatusColor(record.connection_status)">
            {{ getStatusText(record.connection_status) }}
          </a-tag>
        </template>
        <template v-if="column.key === 'actions'">
          <a-space>
            <a-button
              type="link"
              size="small"
              @click="handleEdit(record)"
            >
              {{ t('common.edit') }}
            </a-button>
            <a-button
              type="link"
              size="small"
              danger
              @click="handleDelete(record)"
            >
              {{ t('common.delete') }}
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- Edit Cluster Modal -->
    <ClusterSettings
      v-model:visible="showEditModal"
      :cluster="editingCluster"
      @success="handleEditSuccess"
      @delete="handleDeleteConfirm"
    />
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { useK8sStore } from '@/store/k8sStore'
import type { K8sCluster } from '@/api/k8s'
import ClusterSettings from './ClusterSettings.vue'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const { t } = useI18n()
const k8sStore = useK8sStore()

const showEditModal = ref(false)
const editingCluster = ref<K8sCluster | null>(null)

const columns = computed(() => [
  {
    title: t('k8s.terminal.clusterName'),
    key: 'name',
    dataIndex: 'name',
    ellipsis: true
  },
  {
    title: t('k8s.terminal.contextName'),
    dataIndex: 'context_name',
    ellipsis: true,
    width: 180
  },
  {
    title: t('k8s.terminal.status'),
    key: 'status',
    width: 100
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 120
  }
])

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

const handleClose = () => {
  emit('update:visible', false)
}

const handleEdit = (cluster: K8sCluster) => {
  editingCluster.value = cluster
  showEditModal.value = true
}

const handleEditSuccess = async () => {
  showEditModal.value = false
  editingCluster.value = null
  await k8sStore.loadClusters()
  message.success(t('k8s.terminal.updateSuccess'))
}

const handleDelete = (cluster: K8sCluster) => {
  Modal.confirm({
    title: t('k8s.terminal.deleteConfirm'),
    content: t('k8s.terminal.deleteClusterMessage', { name: cluster.name }),
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    okType: 'danger',
    onOk: () => handleDeleteConfirm(cluster.id)
  })
}

const handleDeleteConfirm = async (id: string) => {
  const result = await k8sStore.removeCluster(id)
  if (result.success) {
    showEditModal.value = false
    editingCluster.value = null
    message.success(t('k8s.terminal.deleteSuccess'))
  } else {
    message.error(result.error || t('k8s.terminal.deleteFailed'))
  }
}
</script>

<style>
.cluster-manage-modal .ant-modal-content {
  background-color: var(--bg-color) !important;
  color: var(--text-color) !important;
}

.cluster-manage-modal .ant-modal-header {
  background-color: transparent !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.cluster-manage-modal .ant-modal-title {
  color: var(--text-color) !important;
}

.cluster-manage-modal .ant-modal-close {
  color: var(--text-color-secondary) !important;
}

.cluster-manage-modal .ant-table {
  background-color: transparent !important;
  color: var(--text-color) !important;
}

.cluster-manage-modal .ant-table-thead > tr > th {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color-secondary) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.cluster-manage-modal .ant-table-tbody > tr > td {
  border-bottom: 1px solid var(--border-color) !important;
}

.cluster-manage-modal .ant-table-tbody > tr:hover > td {
  background-color: var(--hover-bg-color) !important;
}
</style>

<style scoped>
.cluster-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
