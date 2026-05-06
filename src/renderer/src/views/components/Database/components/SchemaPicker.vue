<template>
  <select
    class="db-picker db-picker--schema"
    :value="modelValue ?? ''"
    :disabled="options.length === 0"
    @change="onChange"
  >
    <option
      value=""
      disabled
    >
      {{ $t('database.pickSchema') }}
    </option>
    <option
      v-for="opt in options"
      :key="opt"
      :value="opt"
    >
      {{ opt }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DatabaseTreeNode } from '../types'
import { findConnectionByAssetId } from '@/store/databaseWorkspaceStore'

// Schema picker for the SQL workbench toolbar. Rendered only for PostgreSQL
// connections. Sources its option list from the tree: locates the connection
// whose meta.assetId matches (recursively so nested groups are supported),
// descends into the named database, then returns its `type === 'schema'`
// children.
const props = defineProps<{
  modelValue?: string
  tree: DatabaseTreeNode[]
  assetId?: string
  databaseName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', schema: string): void
}>()

const options = computed(() => {
  if (!props.assetId || !props.databaseName) return []
  const conn = findConnectionByAssetId(props.tree, props.assetId)
  if (!conn) return []
  const db = (conn.children ?? []).find((c) => c.type === 'database' && c.name === props.databaseName)
  if (!db) return []
  return (db.children ?? []).filter((c) => c.type === 'schema').map((c) => c.name)
})

const onChange = (e: Event) => {
  emit('update:modelValue', (e.target as HTMLSelectElement).value)
}
</script>

<style scoped lang="less">
.db-picker {
  font-size: 12px;
  padding: 2px 6px;
  min-width: 120px;
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
