<template>
  <div class="terminal-tabs">
    <div class="tabs-list">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: tab.id === activeTabId }"
        @click="emit('selectTab', tab.id)"
      >
        <span class="tab-name">{{ tab.name }}</span>
        <a-button
          type="text"
          size="small"
          class="tab-close"
          @click.stop="emit('closeTab', tab.id)"
        >
          <template #icon><CloseOutlined /></template>
        </a-button>
      </div>
    </div>
    <div class="tabs-actions">
      <a-button
        type="text"
        size="small"
        @click="emit('addTab')"
      >
        <template #icon><PlusOutlined /></template>
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined, PlusOutlined } from '@ant-design/icons-vue'
import type { TerminalTab } from '@/store/k8sStore'

defineProps<{
  tabs: TerminalTab[]
  activeTabId: string | null
}>()

const emit = defineEmits<{
  (e: 'selectTab', id: string): void
  (e: 'closeTab', id: string): void
  (e: 'addTab'): void
}>()
</script>

<style scoped>
.terminal-tabs {
  display: flex;
  align-items: center;
  background: var(--color-bg-container);
  padding: 0 8px;
  height: 36px;
}

.tabs-list {
  display: flex;
  flex: 1;
  overflow-x: auto;
  gap: 2px;
}

.tabs-list::-webkit-scrollbar {
  display: none;
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 0 8px 0 12px;
  height: 28px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-bottom: none;
  transition: all 0.2s ease;
  min-width: 120px;
  max-width: 200px;
}

.tab-item:hover {
  background: var(--color-bg-hover);
}

.tab-item.active {
  background: var(--color-bg-container);
  border-color: var(--color-primary);
  border-bottom: 1px solid var(--color-bg-container);
  margin-bottom: -1px;
}

.tab-name {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-item.active .tab-name {
  color: var(--color-text);
}

.tab-close {
  margin-left: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.tab-item:hover .tab-close {
  opacity: 1;
}

.tabs-actions {
  margin-left: 8px;
}
</style>
