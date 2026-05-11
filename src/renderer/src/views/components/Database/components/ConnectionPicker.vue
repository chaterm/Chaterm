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
      {{ opt.label }}{{ opt.status === 'testing' ? ' [connecting...]' : '' }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DatabaseTreeNode } from '../types'
import { collectConnections } from '@/store/databaseWorkspaceStore'

/**
 * Connection picker for the SQL workbench toolbar.
 *
 * Walks the tree depth-first (groups can nest sub-groups) and surfaces all
 * connections regardless of status. A connection's `assetId` is kept inside
 * `meta` by the backend-sync layer (`buildTreeFromAssets`). When the user
 * selects a disconnected asset, the component emits `auto-connect` so the
 * parent can trigger `connectAsset` on demand.
 */
const props = defineProps<{
  modelValue?: string
  tree: DatabaseTreeNode[]
  connectionStatuses: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', assetId: string): void
  (e: 'auto-connect', assetId: string): void
}>()

const options = computed(() => {
  const out: Array<{ assetId: string; label: string; status: 'connected' | 'testing' | 'idle' | 'failed' }> = []
  for (const conn of collectConnections(props.tree)) {
    const meta = conn.meta as { assetId?: string } | undefined
    const assetId = meta?.assetId
    if (!assetId) continue
    out.push({
      assetId,
      label: conn.name,
      status: props.connectionStatuses[assetId] ?? 'idle'
    })
  }
  return out
})

const onChange = (e: Event) => {
  const assetId = (e.target as HTMLSelectElement).value
  const opt = options.value.find((o) => o.assetId === assetId)
  if (opt && opt.status !== 'connected' && opt.status !== 'testing') {
    emit('auto-connect', assetId)
  }
  emit('update:modelValue', assetId)
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
