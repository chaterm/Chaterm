<template>
  <div class="k8s-sidebar-container">
    <!-- Header -->
    <div class="sidebar-header">
      <span class="header-title">{{ t('k8s.terminal.clusters') }}</span>
    </div>

    <!-- Action Buttons -->
    <div class="action-buttons">
      <a-button
        size="small"
        class="action-button"
        @click="showAddClusterModal = true"
      >
        <template #icon>
          <PlusOutlined />
        </template>
        {{ t('k8s.terminal.addCluster') }}
      </a-button>
      <a-button
        size="small"
        class="action-button"
        :loading="k8sStore.loading"
        @click="handleRefresh"
      >
        <template #icon>
          <ReloadOutlined />
        </template>
      </a-button>
      <a-button
        size="small"
        class="action-button"
        @click="handleOpenClusterConfig"
      >
        <template #icon>
          <SettingOutlined />
        </template>
      </a-button>
    </div>

    <!-- Cluster List -->
    <div class="cluster-list">
      <a-spin :spinning="k8sStore.loading">
        <template v-if="k8sStore.clusters.length > 0">
          <ClusterItem
            v-for="cluster in k8sStore.clusters"
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
              :description="t('k8s.terminal.noClusters')"
              :image-style="{ height: '60px' }"
            >
              <a-button
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

    <!-- Edit Cluster Modal -->
    <ClusterSettings
      v-model:visible="showEditModal"
      :cluster="editingCluster"
      @success="handleEditSuccess"
      @delete="handleDeleteConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons-vue'
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

onMounted(async () => {
  await k8sStore.initialize()
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
  padding: 12px;
}

.sidebar-header {
  margin-bottom: 12px;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
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

  &:hover {
    background: var(--hover-bg-color);
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  &:active {
    background: var(--active-bg-color);
  }
}

.cluster-list {
  flex: 1;
  overflow-y: auto;
}

.empty-clusters {
  padding: 32px 16px;
  text-align: center;
}
</style>
