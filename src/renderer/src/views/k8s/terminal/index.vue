<template>
  <div class="k8s-sidebar-container">
    <!-- Header/Manage section aligned with Workspace -->
    <div class="manage">
      <a-input
        v-model:value="searchValue"
        class="transparent-Input"
        :placeholder="t('common.search')"
        allow-clear
      >
        <template #suffix>
          <SearchOutlined />
        </template>
      </a-input>

      <a-tooltip
        :title="t('k8s.terminal.addCluster')"
        placement="top"
      >
        <a-button
          type="primary"
          size="small"
          class="workspace-button"
          @click="showAddClusterModal = true"
        >
          <template #icon>
            <PlusOutlined />
          </template>
        </a-button>
      </a-tooltip>

      <a-tooltip
        :title="t('common.refresh')"
        placement="top"
      >
        <a-button
          type="primary"
          size="small"
          class="workspace-button"
          :loading="k8sStore.loading"
          @click="handleRefresh"
        >
          <template #icon>
            <ReloadOutlined />
          </template>
        </a-button>
      </a-tooltip>

      <a-tooltip
        :title="t('common.settings')"
        placement="top"
      >
        <a-button
          type="primary"
          size="small"
          class="workspace-button"
          @click="handleOpenClusterConfig"
        >
          <template #icon>
            <SettingOutlined />
          </template>
        </a-button>
      </a-tooltip>
    </div>

    <!-- Cluster List -->
    <div class="cluster-list">
      <a-spin :spinning="k8sStore.loading">
        <template v-if="filteredClusters.length > 0">
          <ClusterItem
            v-for="cluster in filteredClusters"
            :key="cluster.id"
            :cluster="cluster"
            :is-active="cluster.id === k8sStore.activeClusterId"
            @select="handleClusterClick(cluster)"
            @connect="handleConnect(cluster.id)"
            @disconnect="handleDisconnect(cluster.id)"
            @edit="handleEdit(cluster)"
            @delete="handleDelete(cluster)"
          />
        </template>
        <template v-else>
          <div class="empty-clusters">
            <a-empty
              :description="searchValue ? t('common.noData') : t('k8s.terminal.noClusters')"
              :image-style="{ height: '60px' }"
            >
              <a-button
                v-if="!searchValue"
                type="primary"
                size="small"
                @click="showAddClusterModal = true"
              >
                {{ t('k8s.terminal.addCluster') }}
              </a-button>
            </a-empty>
          </div>
        </template>
      </a-spin>
    </div>

    <!-- Add Cluster Modal -->
    <AddClusterModal
      v-model:visible="showAddClusterModal"
      @success="handleClusterAdded"
    />

    <ClusterSettings
      v-model:visible="showEditModal"
      :cluster="editingCluster"
      @success="handleEditSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, SettingOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { useK8sStore } from '@/store/k8sStore'
import type { K8sCluster } from '@/api/k8s'
import eventBus from '@/utils/eventBus'
import ClusterItem from './components/ClusterItem.vue'
import AddClusterModal from './components/AddClusterModal.vue'
import ClusterSettings from './components/ClusterSettings.vue'

const { t } = useI18n()
const k8sStore = useK8sStore()

const showAddClusterModal = ref(false)
const showEditModal = ref(false)
const editingCluster = ref<K8sCluster | null>(null)
const searchValue = ref('')

onMounted(async () => {
  await k8sStore.initialize()
})

const filteredClusters = computed(() => {
  if (!searchValue.value) return k8sStore.clusters
  const query = searchValue.value.toLowerCase().trim()
  return k8sStore.clusters.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      (c.context_name && c.context_name.toLowerCase().includes(query)) ||
      (c.server_url && c.server_url.toLowerCase().includes(query))
  )
})

const handleRefresh = async () => {
  await k8sStore.loadClusters()
  message.success(t('k8s.terminal.refreshSuccess'))
}

const handleOpenClusterConfig = () => {
  eventBus.emit('open-user-tab', 'k8sClusterConfig')
}

const handleClusterClick = async (cluster: K8sCluster) => {
  // Connect to cluster first
  const result = await k8sStore.connectCluster(cluster.id)
  if (result.success) {
    // Emit event to open terminal in main area (similar to hosts)
    eventBus.emit('currentClickServer', {
      key: `k8s-${cluster.id}`,
      title: cluster.name,
      type: 'k8s',
      ip: cluster.server_url,
      data: cluster
    })
  } else {
    message.error(result.error || t('k8s.terminal.connectFailed'))
  }
}

const handleConnect = async (id: string) => {
  const result = await k8sStore.connectCluster(id)
  if (result.success) {
    message.success(t('k8s.terminal.connectSuccess'))
  } else {
    message.error(result.error || t('k8s.terminal.connectFailed'))
  }
}

const handleDisconnect = async (id: string) => {
  const result = await k8sStore.disconnectCluster(id)
  if (result.success) {
    message.success(t('k8s.terminal.disconnectSuccess'))
  } else {
    message.error(result.error || t('k8s.terminal.disconnectFailed'))
  }
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
    wrapClassName: 'k8s-delete-confirm-modal',
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

const handleClusterAdded = async () => {
  await k8sStore.loadClusters()
  message.success(t('k8s.terminal.clusterAdded'))
}
</script>

<style lang="less" scoped>
.k8s-sidebar-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  padding: 4px 0;
}

.manage {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;

  :deep(.ant-input-affix-wrapper) {
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color) !important;
    box-shadow: none !important;
    padding: 0 7px;
    height: 30px;
    line-height: 28px;
  }
}

.transparent-Input {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color) !important;
  border-radius: 4px;
  flex: 1;

  :deep(.ant-input) {
    background-color: var(--bg-color-secondary) !important;
    color: var(--text-color) !important;
    height: 28px;
    &::placeholder {
      color: var(--text-color-tertiary) !important;
      font-size: 13px;
    }
  }

  :deep(.ant-input-suffix) {
    color: var(--text-color-tertiary) !important;
    font-size: 14px;
  }
}

.workspace-button {
  font-size: 14px;
  height: 30px;
  width: 30px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
  border-radius: 4px;

  &:hover {
    color: #1890ff !important;
    border-color: #1890ff !important;
    background-color: var(--bg-color-secondary) !important;
  }

  &:active {
    background-color: var(--active-bg-color) !important;
  }
}

.cluster-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px;
  margin-top: 8px;
}

.empty-clusters {
  padding: 32px 16px;
  text-align: center;
}
</style>
