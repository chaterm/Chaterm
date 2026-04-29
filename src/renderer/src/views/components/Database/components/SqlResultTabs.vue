<template>
  <div
    class="sql-result-tabs"
    role="tablist"
  >
    <div
      class="sql-result-tabs__item sql-result-tabs__item--overview"
      :class="{ 'sql-result-tabs__item--active': activeResultTabId === 'overview' }"
      role="tab"
      :aria-selected="activeResultTabId === 'overview'"
      @click="emit('select', 'overview')"
    >
      <span class="sql-result-tabs__title">{{ $t('database.overview') }}</span>
    </div>
    <div
      v-for="rt in resultTabs"
      :key="rt.id"
      class="sql-result-tabs__item"
      :class="{ 'sql-result-tabs__item--active': rt.id === activeResultTabId }"
      role="tab"
      :aria-selected="rt.id === activeResultTabId"
      :title="rt.title"
      @click="emit('select', rt.id)"
    >
      <span
        class="sql-result-tabs__dot"
        :class="`sql-result-tabs__dot--${rt.status}`"
      />
      <span class="sql-result-tabs__title">{{ rt.title }}</span>
      <button
        class="sql-result-tabs__close"
        :aria-label="$t('database.closeResultTab')"
        @click.stop="emit('close', rt.id)"
      >
        <CloseOutlined />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue'
import type { SqlResultTab } from '../types'

/**
 * Bottom result-tab strip for a SQL workspace tab.
 *
 * The first item is the permanent "Overview" pseudo-tab (id sentinel
 * `'overview'`), which cannot be closed. Each execution contributes one
 * closable tab after it. Status is reflected via a small colored dot so
 * the user can scan running / succeeded / failed at a glance.
 */
defineProps<{
  resultTabs: SqlResultTab[]
  activeResultTabId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'close', id: string): void
}>()
</script>

<style scoped lang="less">
.sql-result-tabs {
  display: flex;
  align-items: stretch;
  height: 28px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
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
    }
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-color);

    &--running {
      background: #f59e0b;
    }

    &--ok {
      background: #22c55e;
    }

    &--error {
      background: #ef4444;
    }
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: inherit;
    border-radius: 3px;

    &:hover {
      background: var(--active-bg-color);
    }
  }

  &__title {
    white-space: nowrap;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
