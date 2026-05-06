<template>
  <div class="sql-overview">
    <div
      v-if="history.length === 0"
      class="sql-overview__empty"
    >
      {{ $t('database.noExecutionsYet') }}
    </div>
    <table
      v-else
      class="sql-overview__table"
    >
      <thead>
        <tr>
          <th>{{ $t('database.overviewColSql') }}</th>
          <th>{{ $t('database.overviewColMessage') }}</th>
          <th>{{ $t('database.overviewColTime') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="h in history"
          :key="`${h.seq}-${h.idx}`"
          class="sql-overview__row"
          :class="{ 'sql-overview__row--closed': isClosed(h) }"
          @click="onRowClick(h.resultTabId)"
        >
          <td class="sql-overview__sql">{{ h.sql }}</td>
          <td :class="h.status === 'ok' ? 'sql-overview__msg-ok' : 'sql-overview__msg-err'">
            {{ h.message }}
          </td>
          <td>{{ h.durationMs }}ms</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { SqlExecutionHistoryEntry } from '../types'

/**
 * Overview pane for a SQL workspace tab: shows every historical execution.
 * Clicking a row switches to that execution's result tab if it is still
 * open; rows whose result tab has been closed are rendered dimmed and
 * don't respond to clicks.
 */
const props = defineProps<{
  history: SqlExecutionHistoryEntry[]
  closedResultTabIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'open-result', id: string): void
}>()

const isClosed = (h: SqlExecutionHistoryEntry): boolean => {
  if (h.resultTabId === null) return true
  return props.closedResultTabIds.has(h.resultTabId)
}

const onRowClick = (id: string | null) => {
  if (!id) return
  if (props.closedResultTabIds.has(id)) return
  emit('open-result', id)
}
</script>

<style scoped lang="less">
.sql-overview {
  height: 100%;
  overflow: auto;
  font-size: 12px;
}

.sql-overview__empty {
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary, #8a94a6);
}

.sql-overview__table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    text-align: left;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    background: var(--bg-color-secondary);
    font-weight: 600;
    position: sticky;
    top: 0;
  }
}

.sql-overview__row {
  cursor: pointer;

  &:hover {
    background: var(--hover-bg-color);
  }

  &--closed {
    cursor: default;
    opacity: 0.6;

    &:hover {
      background: transparent;
    }
  }
}

.sql-overview__sql {
  font-family: Menlo, monospace;
  max-width: 720px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sql-overview__msg-ok {
  color: #22c55e;
}

.sql-overview__msg-err {
  color: #ef4444;
}
</style>
