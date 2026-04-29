<template>
  <select
    class="db-picker db-picker--connection"
    :value="modelValue ?? ''"
    :disabled="options.length === 0"
    @change="onChange"
  >
    <option
      value=""
      disabled
    >
      {{ $t('database.pickConnection') }}
    </option>
    <option
      v-for="opt in options"
      :key="opt.assetId"
      :value="opt.assetId"
    >
      {{ opt.label }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DatabaseTreeNode } from '../types'

/**
 * Connection picker for the SQL workbench toolbar.
 *
 * Walks `tree` (group -> connection -> database) and surfaces only the
 * connections that are currently `connected`. A connection's `assetId` is
 * kept inside `meta` by the backend-sync layer (`buildTreeFromAssets`), so
 * this component reads it from there.
 */
const props = defineProps<{
  modelValue?: string
  tree: DatabaseTreeNode[]
  connectionStatuses: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', assetId: string): void
}>()

const options = computed(() => {
  const out: Array<{ assetId: string; label: string }> = []
  for (const group of props.tree) {
    for (const conn of group.children ?? []) {
      if (conn.type !== 'connection') continue
      const meta = conn.meta as { assetId?: string } | undefined
      const assetId = meta?.assetId
      if (!assetId) continue
      if (props.connectionStatuses[assetId] === 'connected') {
        out.push({ assetId, label: conn.name })
      }
    }
  }
  return out
})

const onChange = (e: Event) => {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', v)
}
</script>

<style scoped lang="less">
.db-picker {
  font-size: 12px;
  padding: 2px 6px;
  min-width: 140px;
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
