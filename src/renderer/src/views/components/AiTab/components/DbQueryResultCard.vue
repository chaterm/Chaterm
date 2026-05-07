<template>
  <div class="db-query-result-card">
    <div class="meta-row">
      <span class="badge">{{ result.engine }}</span>
      <span class="meta-item">rows: {{ result.rowCount }}</span>
      <span class="meta-item">duration: {{ result.durationMs }}ms</span>
      <span
        v-if="result.truncated"
        class="meta-item warn"
      >
        truncated
      </span>
    </div>

    <div
      v-if="showSqlBlock"
      class="sql-block"
    >
      <div class="sql-title">SQL</div>
      <pre>{{ result.executedSql }}</pre>
    </div>

    <a-table
      v-if="tableRows.length > 0"
      size="small"
      :columns="tableColumns"
      :data-source="tableRows"
      :pagination="pagination"
      :scroll="{ x: 'max-content' }"
      row-key="__rowKey"
      class="db-result-table"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface DbQueryResultView {
  engine: 'mysql' | 'postgresql'
  executedSql: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  truncated: boolean
  durationMs: number
}

const props = defineProps<{
  result: DbQueryResultView
}>()

const isWriteSql = computed(() => {
  const sql = (props.result.executedSql || '').trim().toLowerCase()
  if (!sql) return false
  return /^(insert|update|delete|replace|alter|create|drop|truncate|rename)\b/.test(sql)
})

const showSqlBlock = computed(() => !isWriteSql.value)

const tableColumns = computed(() =>
  props.result.columns.map((key) => ({
    title: key,
    dataIndex: key,
    key,
    customRender: ({ text }: { text: unknown }) => (text === null ? 'null' : String(text))
  }))
)

const tableRows = computed(() =>
  props.result.rows.map((row, idx) => ({
    __rowKey: idx,
    ...row
  }))
)

const pagination = computed(() => ({
  pageSize: 20,
  showSizeChanger: true,
  pageSizeOptions: ['20', '50', '100'],
  showTotal: (total: number) => `Total ${total}`
}))
</script>

<style scoped lang="less">
.db-query-result-card {
  margin-top: 6px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-color);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-color-quinary);
  font-size: 12px;
}

.meta-item {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.meta-item.warn {
  color: #d89614;
}

.sql-block {
  margin-bottom: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.sql-title {
  padding: 4px 8px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  color: var(--text-color-secondary);
}

.sql-block pre {
  margin: 0;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: var(--text-color);
  background: var(--bg-color);
}

.db-result-table :deep(.ant-table-cell) {
  font-size: 12px;
  vertical-align: top;
  white-space: nowrap;
}

.db-result-table :deep(.ant-table) {
  background: var(--bg-color);
  color: var(--text-color);
}

.db-result-table :deep(.ant-table-container) {
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.db-result-table :deep(.ant-table-thead > tr > th) {
  background: var(--bg-color-secondary);
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color);
}

.db-result-table :deep(.ant-table-tbody > tr > td) {
  background: var(--bg-color);
  color: var(--text-color-secondary);
  border-bottom: 1px solid var(--border-color-light);
}

.db-result-table :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--hover-bg-color);
}

.db-result-table :deep(.ant-pagination) {
  color: var(--text-color-secondary);
}

.db-result-table :deep(.ant-pagination .ant-pagination-item) {
  background: var(--bg-color);
  border-color: var(--border-color);
}

.db-result-table :deep(.ant-pagination .ant-pagination-item a) {
  color: var(--text-color-secondary);
}

.db-result-table :deep(.ant-pagination .ant-pagination-item-active) {
  border-color: #1677ff;
}

.db-result-table :deep(.ant-select-selector) {
  background: var(--bg-color) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-secondary) !important;
}
</style>
