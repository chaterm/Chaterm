<template>
  <div class="db-tabs">
    <div
      class="db-tabs__list"
      role="tablist"
    >
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="db-tabs__item"
        :class="{ 'db-tabs__item--active': tab.id === activeTabId }"
        role="tab"
        :aria-selected="tab.id === activeTabId"
        @click="emit('select', tab.id)"
      >
        <span class="db-tabs__title">{{ tab.title }}</span>
        <button
          v-if="tab.kind !== 'overview'"
          class="db-tabs__close"
          :aria-label="`close ${tab.title}`"
          @click.stop="emit('close', tab.id)"
        >
          <CloseOutlined />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue'
import type { DatabaseWorkspaceTab } from '../types'

defineProps<{
  tabs: DatabaseWorkspaceTab[]
  activeTabId: string
}>()

const emit = defineEmits<{
  (e: 'select', tabId: string): void
  (e: 'close', tabId: string): void
}>()
</script>

<style lang="less" scoped>
.db-tabs {
  display: flex;
  height: 32px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  overflow-x: auto;

  &__list {
    display: flex;
    align-items: stretch;
    height: 100%;
  }

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
    cursor: pointer;
    border-right: 1px solid var(--border-color);
    user-select: none;

    &:hover {
      background: var(--hover-bg-color);
    }

    &--active {
      color: var(--text-color);
      background: var(--bg-color);
      border-bottom: 2px solid var(--primary-color, #3b82f6);
    }
  }

  &__title {
    white-space: nowrap;
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: inherit;
    cursor: pointer;

    &:hover {
      background: var(--active-bg-color);
    }
  }
}
</style>
