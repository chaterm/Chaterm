<template>
  <ul
    class="db-tree"
    role="tree"
  >
    <DatabaseTreeNodeItem
      v-for="node in nodes"
      :key="node.id"
      :node="node"
      :selected-id="selectedId"
      :connection-statuses="connectionStatuses"
      @toggle="(id) => emit('toggle', id)"
      @select="(id) => emit('select', id)"
      @open-table="(id) => emit('openTable', id)"
      @connect="(id) => emit('connect', id)"
      @disconnect="(id) => emit('disconnect', id)"
      @group-context="(payload) => emit('groupContext', payload)"
    />
  </ul>
</template>

<script setup lang="ts">
import type { DatabaseTreeNode } from '../types'
import DatabaseTreeNodeItem from './DatabaseTreeNodeItem.vue'

defineProps<{
  nodes: DatabaseTreeNode[]
  selectedId: string | null
  connectionStatuses?: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
}>()

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'select', id: string): void
  (e: 'openTable', id: string): void
  (e: 'connect', id: string): void
  (e: 'disconnect', id: string): void
  (e: 'groupContext', payload: { id: string; name: string; x: number; y: number }): void
}>()
</script>

<style lang="less" scoped>
.db-tree {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
</style>
