<template>
  <select
    class="db-picker db-picker--database"
    :value="modelValue ?? ''"
    :disabled="options.length === 0"
    @change="onChange"
  >
    <option
      value=""
      disabled
    >
      {{ $t('database.pickDatabase') }}
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

/**
 * Database picker for the SQL workbench toolbar. Locates the connection
 * whose `meta.assetId` matches the provided `assetId` (recursively so
 * connections inside nested groups are found) and exposes its child
 * database node names. Empty when no connection is chosen or the
 * connection has not loaded databases yet.
 */
const props = defineProps<{
  modelValue?: string
  tree: DatabaseTreeNode[]
  assetId?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', db: string): void
}>()

const options = computed(() => {
  if (!props.assetId) return []
  const conn = findConnectionByAssetId(props.tree, props.assetId)
  if (!conn) return []
  return (conn.children ?? []).filter((c) => c.type === 'database').map((c) => c.name)
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
