<template>
  <div class="db-sidebar">
    <div class="db-sidebar__header">
      <span class="db-sidebar__title">{{ $t('database.title') }}</span>
      <button
        class="db-sidebar__add-btn"
        :title="$t('database.newConnection')"
        @click="emit('add-connection')"
      >
        <PlusOutlined />
      </button>
    </div>
    <div class="db-sidebar__search">
      <a-input
        :value="keyword"
        class="transparent-Input"
        :placeholder="$t('database.searchPlaceholder')"
        allow-clear
        @update:value="(v: string) => emit('update:keyword', v)"
      >
        <template #suffix>
          <SearchOutlined />
        </template>
      </a-input>
    </div>
    <div class="db-sidebar__tree">
      <DatabaseTree
        :nodes="nodes"
        :selected-id="selectedId"
        :connection-statuses="connectionStatuses"
        @toggle="(id) => emit('toggle', id)"
        @select="(id) => emit('select', id)"
        @open-table="(id) => emit('openTable', id)"
        @connect="(id) => emit('connect', id)"
        @disconnect="(id) => emit('disconnect', id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PlusOutlined, SearchOutlined } from '@ant-design/icons-vue'
import DatabaseTree from './DatabaseTree.vue'
import type { DatabaseTreeNode } from '../types'

defineProps<{
  nodes: DatabaseTreeNode[]
  selectedId: string | null
  keyword: string
  connectionStatuses?: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
}>()

const emit = defineEmits<{
  (e: 'update:keyword', value: string): void
  (e: 'add-connection'): void
  (e: 'toggle', id: string): void
  (e: 'select', id: string): void
  (e: 'openTable', id: string): void
  (e: 'connect', id: string): void
  (e: 'disconnect', id: string): void
}>()
</script>

<style lang="less" scoped>
.db-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  border-right: 1px solid var(--border-color);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
  }

  &__add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-color);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
    }
  }

  &__search {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-color);
  }

  &__tree {
    flex: 1;
    overflow: auto;
  }
}
</style>
