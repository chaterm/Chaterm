<template>
  <div class="cluster-sidebar-container">
    <!-- Header -->
    <div class="sidebar-header">
      <template v-if="!collapsed">
        <span class="header-title">{{ t('k8s.terminal.clusters') }}</span>
        <div class="header-actions">
          <a-button
            type="text"
            size="small"
            @click="emit('openAddModal')"
          >
            <template #icon><PlusOutlined /></template>
          </a-button>
          <a-button
            type="text"
            size="small"
            :loading="k8sStore.loading"
            @click="handleRefresh"
          >
            <template #icon><ReloadOutlined /></template>
          </a-button>
          <a-button
            type="text"
            size="small"
            @click="handleOpenClusterConfig"
          >
            <template #icon><SettingOutlined /></template>
          </a-button>
          <a-button
            type="text"
            size="small"
            @click="emit('toggleCollapse')"
          >
            <template #icon><MenuFoldOutlined /></template>
          </a-button>
        </div>
      </template>
      <template v-else>
        <a-button
          type="text"
          size="small"
          @click="emit('toggleCollapse')"
        >
          <template #icon><MenuUnfoldOutlined /></template>
        </a-button>
      </template>
    </div>

    <!-- Cluster List -->
    <div
      v-if="!collapsed"
      class="cluster-list"
    >
      <a-spin :spinning="k8sStore.loading">
        <template v-if="k8sStore.clusters.length > 0">
          <ClusterItem
            v-for="cluster in k8sStore.clusters"
            :key="cluster.id"
            :cluster="cluster"
            :is-active="cluster.id === k8sStore.activeClusterId"
            @select="emit('selectCluster', cluster.id)"
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
                @click="emit('openAddModal')"
              >
                {{ t('k8s.terminal.addCluster') }}
              </a-button>
            </a-empty>
          </div>
        </template>
      </a-spin>
    </div>

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
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { useK8sStore } from '@/store/k8sStore'
import type { K8sCluster } from '@/api/k8s'
import eventBus from '@/utils/eventBus'
import ClusterItem from './ClusterItem.vue'
import ClusterSettings from './ClusterSettings.vue'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  (e: 'toggleCollapse'): void
  (e: 'openAddModal'): void
  (e: 'selectCluster', id: string): void
}>()

const { t } = useI18n()
const k8sStore = useK8sStore()

const showEditModal = ref(false)
const editingCluster = ref<K8sCluster | null>(null)

const handleOpenClusterConfig = () => {
  eventBus.emit('open-user-tab', 'k8sClusterConfig')
}

const handleRefresh = async () => {
  await k8sStore.loadClusters()
  message.success(t('k8s.terminal.refreshSuccess'))
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
</script>

<style scoped>
.cluster-sidebar-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-container);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  min-height: 48px;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.cluster-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-clusters {
  padding: 32px 16px;
  text-align: center;
}
</style>
