<template>
  <div
    class="cluster-item"
    :class="{ active: isActive, connected: cluster.connection_status === 'connected' }"
    @click="emit('select')"
  >
    <div class="cluster-icon">
      <CloudServerOutlined />
      <span
        class="status-dot"
        :class="cluster.connection_status"
      ></span>
    </div>

    <div class="cluster-info">
      <div class="cluster-name">
        <div class="name-status-placeholder">
          <span
            v-if="cluster.connection_status === 'connected'"
            class="name-status-dot"
          ></span>
        </div>
        <span class="hostname-text">{{ cluster.name }}</span>
      </div>
      <div class="cluster-context">{{ cluster.context_name }}</div>
    </div>

    <div
      class="cluster-actions"
      @click.stop
    >
      <a-dropdown :trigger="['click']">
        <a-button
          type="text"
          size="small"
        >
          <template #icon><MoreOutlined /></template>
        </a-button>
        <template #overlay>
          <a-menu @click="handleMenuClick">
            <a-menu-item
              v-if="cluster.connection_status !== 'connected'"
              key="connect"
            >
              <LinkOutlined />
              <span>{{ t('k8s.terminal.connect') }}</span>
            </a-menu-item>
            <a-menu-item
              v-if="cluster.connection_status === 'connected'"
              key="disconnect"
            >
              <DisconnectOutlined />
              <span>{{ t('k8s.terminal.disconnect') }}</span>
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item key="edit">
              <EditOutlined />
              <span>{{ t('common.edit') }}</span>
            </a-menu-item>
            <a-menu-item
              key="delete"
              danger
            >
              <DeleteOutlined />
              <span>{{ t('common.delete') }}</span>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CloudServerOutlined, MoreOutlined, LinkOutlined, DisconnectOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { K8sCluster } from '@/api/k8s'

defineProps<{
  cluster: K8sCluster
  isActive: boolean
}>()

const emit = defineEmits<{
  (e: 'select'): void
  (e: 'connect'): void
  (e: 'disconnect'): void
  (e: 'edit'): void
  (e: 'delete'): void
}>()

const { t } = useI18n()

const handleMenuClick = ({ key }: { key: string }) => {
  switch (key) {
    case 'connect':
      emit('connect')
      break
    case 'disconnect':
      emit('disconnect')
      break
    case 'edit':
      emit('edit')
      break
    case 'delete':
      emit('delete')
      break
  }
}
</script>

<style scoped>
.cluster-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: all 0.2s ease;
}

.cluster-item:hover {
  background: var(--hover-bg-color);
}

.cluster-item.active {
  background: var(--hover-bg-color);
}

.cluster-item.active .cluster-name {
  color: #1890ff;
}

.cluster-item.connected .cluster-icon {
  color: var(--success-color);
}

.cluster-icon {
  position: relative;
  font-size: 14px;
  color: var(--text-color);
  margin-right: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--bg-color);
}

.status-dot.connected {
  background: var(--success-color);
}

.status-dot.disconnected {
  background: var(--text-color-quaternary);
}

.status-dot.error {
  background: var(--error-color);
}

.cluster-info {
  flex: 1;
  min-width: 0;
}

.cluster-name {
  display: flex;
  align-items: center;
  font-weight: 400;
  font-size: 13px;
  color: var(--text-color);
  line-height: normal;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Added placeholder to stabilize text start position between connected/disconnected states */
.name-status-placeholder {
  width: 10px; /* dot 6px + gap roughly 4px = 10px */
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.name-status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success-color);
}

.cluster-context {
  display: block;
  font-size: 11px;
  color: var(--text-color-tertiary);
  line-height: normal;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 0;
  margin-left: 10px; /* This margin MUST match the .name-status-placeholder width for perfect alignment */
}

.cluster-actions {
  opacity: 0;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.cluster-item:hover .cluster-actions {
  opacity: 1;
}

.cluster-actions :deep(.ant-btn-text) {
  color: var(--text-color-secondary);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.ant-btn-text:hover) {
  color: var(--primary-color) !important;
  background-color: transparent !important;
  transform: scale(1.15);
}
</style>
