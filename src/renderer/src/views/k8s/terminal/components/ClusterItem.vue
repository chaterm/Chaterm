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
        <span
          v-if="cluster.connection_status === 'connected'"
          class="name-status-dot"
        ></span>
        {{ cluster.name }}
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
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: all 0.2s ease;
}

.cluster-item:hover {
  background: var(--color-bg-hover);
}

.cluster-item.active {
  background: var(--color-primary-bg);
}

.cluster-item.connected .cluster-icon {
  color: var(--color-success);
}

.cluster-icon {
  position: relative;
  font-size: 20px;
  color: var(--color-text-tertiary);
  margin-right: 12px;
}

.status-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--color-bg-container);
}

.status-dot.connected {
  background: var(--color-success);
}

.status-dot.disconnected {
  background: var(--color-text-quaternary);
}

.status-dot.error {
  background: var(--color-error);
}

.cluster-info {
  flex: 1;
  min-width: 0;
}

.cluster-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.name-status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
}

.cluster-context {
  font-size: 11px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cluster-actions {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.cluster-item:hover .cluster-actions {
  opacity: 1;
}
</style>
