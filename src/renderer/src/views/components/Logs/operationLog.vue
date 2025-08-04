<template>
  <div class="operation-log-container">
    <div class="header">
      <div class="search-section">
        <a-space>
          <a-input
            v-model:value="searchForm.ip"
            :placeholder="t('logs.searchHostIP')"
            style="width: 200px"
            allow-clear
          />
          <a-input
            v-model:value="searchForm.command_input"
            :placeholder="t('logs.searchInputCommand')"
            style="width: 200px"
            allow-clear
          />
          <a-input
            v-model:value="searchForm.username"
            :placeholder="t('logs.searchUsername')"
            style="width: 150px"
            allow-clear
          />
          <a-range-picker
            v-model:value="dateRange"
            :placeholder="[t('logs.startTime'), t('logs.endTime')]"
            show-time
            format="YYYY-MM-DD HH:mm:ss"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
          <a-button
            type="primary"
            :loading="loading"
            @click="handleSearch"
          >
            {{ t('logs.search') }}
          </a-button>
          <a-button @click="handleReset">{{ t('logs.reset') }}</a-button>
        </a-space>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="operationLogs"
      :pagination="pagination"
      :loading="loading"
      :scroll="{ x: 1200 }"
      row-key="id"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'command_input'">
          <a-tooltip :title="record.command_input">
            <span>{{ record.command_input.length > 30 ? record.command_input.substring(0, 30) + '...' : record.command_input }}</span>
          </a-tooltip>
        </template>
        <template v-if="column.key === 'command_output'">
          <a-tooltip :title="record.command_output">
            <span>{{ record.command_output.length > 30 ? record.command_output.substring(0, 30) + '...' : record.command_output }}</span>
          </a-tooltip>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="record.status === 'success' ? 'green' : record.status === 'failed' ? 'red' : 'orange'">
            {{ getStatusText(record.status) }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'created_at'">
          {{ formatDateTime(record.created_at) }}
        </template>
        <template v-else-if="column.key === 'username'">
          <a-tag color="blue">{{ record.username || t('logs.unknown') }}</a-tag>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType, TableProps } from 'ant-design-vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Interface definitions
interface OperationLog {
  id: number
  username: string
  ip: string
  command_input: string
  command_output: string
  status: 'success' | 'failed' | 'timeout'
  session_id?: string
  task_id?: string
  created_at: string
}

interface SearchForm {
  ip: string
  command_input: string
  username: string
}

// Reactive data
const loading = ref(false)
const operationLogs = ref<OperationLog[]>([])

// Search form
const searchForm = reactive<SearchForm>({
  ip: '',
  command_input: '',
  username: ''
})

// Date range
const dateRange = ref<[string, string] | undefined>(undefined)

// Pagination configuration data
const paginationData = ref({
  current: 1,
  pageSize: 20,
  total: 0
})

// Pagination configuration
const pagination = computed(() => ({
  current: paginationData.value.current,
  pageSize: paginationData.value.pageSize,
  total: paginationData.value.total,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} / ${total} ${t('logs.records')}`
}))

// Table column configuration
const columns = computed<TableColumnsType<OperationLog>>(() => [
  {
    title: t('logs.id'),
    dataIndex: 'id',
    key: 'id',
    width: 80
  },
  {
    title: t('logs.username'),
    dataIndex: 'username',
    key: 'username',
    width: 120
  },
  {
    title: t('logs.ip'),
    dataIndex: 'ip',
    key: 'ip',
    width: 150
  },
  {
    title: t('logs.commandInput'),
    dataIndex: 'command_input',
    key: 'command_input',
    width: 200,
    ellipsis: true
  },
  {
    title: t('logs.commandOutput'),
    dataIndex: 'command_output',
    key: 'command_output',
    width: 200,
    ellipsis: true
  },
  {
    title: t('logs.status'),
    dataIndex: 'status',
    key: 'status',
    width: 100
  },
  {
    title: t('logs.operationTime'),
    dataIndex: 'created_at',
    key: 'created_at',
    width: 180
  }
])

// Format date time
const formatDateTime = (dateTime: string | undefined) => {
  if (!dateTime) return '-'
  return dayjs(dateTime).format('YYYY-MM-DD HH:mm:ss')
}

// Get status text
const getStatusText = (status: string) => {
  switch (status) {
    case 'success':
      return t('logs.success')
    case 'failed':
      return t('logs.failed')
    case 'timeout':
      return t('logs.timeout')
    default:
      return t('logs.unknown')
  }
}

// Get operation logs
const getOperationLogs = async () => {
  loading.value = true
  try {
    const query = {
      ...searchForm,
      page: paginationData.value.current,
      limit: paginationData.value.pageSize,
      start_date: dateRange.value?.[0],
      end_date: dateRange.value?.[1]
    }

    // Filter empty values
    Object.keys(query).forEach((key) => {
      if (query[key] === '' || query[key] === null || query[key] === undefined) {
        delete query[key]
      }
    })

    const result = await window.api.getOperationLogs(query)

    if (result.success && result.data) {
      operationLogs.value = result.data.logs
      paginationData.value.total = result.data.total
    } else {
      throw new Error(result.error || t('logs.getOperationLogsFailed'))
    }
  } catch (error) {
    console.error('Failed to get operation logs:', error)
    message.error(t('logs.getOperationLogsFailed') + ': ' + (error as Error).message)
  } finally {
    loading.value = false
  }
}

// Search
const handleSearch = () => {
  paginationData.value.current = 1
  getOperationLogs()
}

// Reset
const handleReset = () => {
  searchForm.ip = ''
  searchForm.command_input = ''
  searchForm.username = ''
  dateRange.value = undefined
  paginationData.value.current = 1
  getOperationLogs()
}

// Handle table change
const handleTableChange: TableProps['onChange'] = (pag, filters, sorter) => {
  paginationData.value.current = pag.current || 1
  paginationData.value.pageSize = pag.pageSize || 20
  getOperationLogs()
}

// Get data when component is mounted
onMounted(() => {
  getOperationLogs()
})
</script>

<style lang="less" scoped>
.operation-log-container {
  padding: 16px;
  background-color: var(--bg-color);
  height: 100%;
  display: flex;
  flex-direction: column;

  .header {
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;

    h2 {
      color: var(--text-color);
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .search-section {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
  }

  // Search form style optimization
  :deep(.ant-input) {
    background-color: var(--bg-color-secondary) !important;
    border-color: var(--border-color-light) !important;
    color: var(--text-color-secondary) !important;
    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }
  }

  :deep(.ant-input-affix-wrapper) {
    background-color: var(--bg-color-secondary) !important;
    border-color: var(--border-color-light) !important;
    color: var(--text-color-secondary) !important;

    &:hover {
      border-color: var(--border-color-light) !important;
      background-color: var(--bg-color-tertiary) !important;
    }

    &:focus {
      border-color: #1890ff !important;
      background-color: var(--bg-color-tertiary) !important;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
    }
  }

  // Date picker styles
  :deep(.ant-picker) {
    background-color: var(--bg-color-secondary) !important;
    border-color: var(--border-color-light) !important;
    color: var(--text-color-secondary) !important;

    &:hover {
      border-color: var(--border-color-light) !important;
      background-color: var(--bg-color-tertiary) !important;
    }

    &.ant-picker-focused {
      border-color: #1890ff !important;
      background-color: var(--bg-color-tertiary) !important;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
    }

    .ant-picker-input > input {
      color: var(--text-color-secondary) !important;

      &::placeholder {
        color: var(--text-color-tertiary) !important;
      }
    }
  }

  // Button style optimization
  :deep(.ant-btn) {
    border-radius: 6px;
    transition: all 0.3s ease;

    &:not(.ant-btn-primary) {
      background-color: var(--bg-color-secondary) !important;
      border-color: var(--border-color-light) !important;
      color: var(--text-color-secondary) !important;

      &:hover {
        background-color: var(--bg-color-tertiary) !important;
        border-color: #1890ff !important;
        color: #1890ff !important;
      }
    }

    &.ant-btn-primary {
      background-color: #1890ff !important;
      border-color: #1890ff !important;

      &:hover {
        background-color: #40a9ff !important;
        border-color: #40a9ff !important;
      }
    }
  }

  // Table style optimization
  :deep(.ant-table) {
    background-color: var(--bg-color);
    border-radius: 8px;
    overflow: hidden;

    .ant-table-container {
      border-radius: 8px;
    }

    .ant-table-thead > tr > th {
      background-color: var(--bg-color-secondary);
      color: var(--text-color);
      border-bottom: 2px solid var(--border-color-light);
      font-weight: 600;
      padding: 12px 16px;
      transition: all 0.3s ease;

      &:hover {
        background-color: var(--bg-color-tertiary) !important;
      }

      // Sortable column styles
      &.ant-table-column-has-sorters {
        &:hover {
          background-color: var(--bg-color-tertiary) !important;
        }
      }

      // Sort icon color
      .ant-table-column-sorter {
        color: var(--text-color-tertiary);
      }
    }

    .ant-table-tbody > tr > td {
      background-color: var(--bg-color);
      color: var(--text-color);
      padding: 12px 16px;
      transition: all 0.3s ease;
    }

    .ant-table-tbody > tr:hover > td {
      background-color: var(--bg-color-secondary) !important;
    }

    // Table border optimization
    .ant-table-tbody > tr:last-child > td {
      border-bottom: none;
    }

    // Empty data state
    .ant-empty {
      color: var(--text-color-tertiary);

      .ant-empty-description {
        color: var(--text-color-tertiary);
      }
    }
  }

  // Tag style optimization
  :deep(.ant-tag) {
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 12px;
    border: none;

    &.ant-tag-green {
      background-color: rgba(82, 196, 26, 0.15);
      color: #52c41a;
    }

    &.ant-tag-red {
      background-color: rgba(255, 77, 79, 0.15);
      color: #ff4d4f;
    }

    &.ant-tag-blue {
      background-color: rgba(24, 144, 255, 0.15);
      color: #1890ff;
    }

    &.ant-tag-orange {
      background-color: rgba(250, 173, 20, 0.15);
      color: #faad14;
    }
  }

  // Pagination style optimization
  :deep(.ant-pagination) {
    margin-top: 20px;
    text-align: right;
    padding: 16px 0;

    .ant-pagination-item {
      background-color: var(--bg-color-secondary);
      border-color: var(--border-color-light);
      border-radius: 6px;
      transition: all 0.3s ease;

      a {
        color: var(--text-color-secondary);
      }

      &:hover {
        border-color: #1890ff;

        a {
          color: #1890ff;
        }
      }
    }

    .ant-pagination-item-active {
      background-color: #1890ff;
      border-color: #1890ff;

      a {
        color: #ffffff;
      }
    }

    .ant-pagination-prev,
    .ant-pagination-next {
      .ant-pagination-item-link {
        background-color: var(--bg-color-secondary);
        border-color: var(--border-color-light);
        color: var(--text-color-secondary);
        border-radius: 6px;
        transition: all 0.3s ease;

        &:hover {
          border-color: #1890ff;
          color: #1890ff;
        }
      }
    }

    .ant-pagination-options {
      .ant-select {
        .ant-select-selector {
          background-color: var(--bg-color-secondary) !important;
          border-color: var(--border-color-light) !important;
          color: var(--text-color-secondary) !important;
        }

        &:hover .ant-select-selector {
          border-color: #1890ff !important;
        }
      }
    }

    .ant-pagination-total-text {
      color: var(--text-color-secondary);
    }

    .ant-pagination-jump-prev,
    .ant-pagination-jump-next {
      .ant-pagination-item-container {
        .ant-pagination-item-link-icon {
          color: var(--text-color-tertiary);
        }

        .ant-pagination-item-ellipsis {
          color: var(--text-color-tertiary);
        }
      }
    }
  }

  :deep(.ant-table),
  :deep(.ant-table-body),
  :deep(.ant-table-container) {
    ::-webkit-scrollbar {
      width: 8px !important;
      height: 8px !important;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg-color-secondary) !important;
      border-radius: 6px;
    }

    ::-webkit-scrollbar-thumb {
      background-color: var(--border-color-light) !important;
      border-radius: 6px;
      transition: background-color 0.3s ease;

      &:hover {
        background-color: var(--text-color-tertiary) !important;
      }
    }

    ::-webkit-scrollbar-corner {
      background: var(--bg-color-secondary) !important;
    }

    scrollbar-width: thin !important;
  }

  :deep(.ant-spin) {
    .ant-spin-dot {
      .ant-spin-dot-item {
        background-color: #1890ff;
      }
    }

    .ant-spin-text {
      color: var(--text-color-secondary);
    }
  }

  :deep(.ant-picker-dropdown) {
    background-color: var(--bg-color) !important;
    border: 1px solid var(--border-color-light) !important;
    box-shadow:
      0 6px 16px 0 rgba(0, 0, 0, 0.08),
      0 3px 6px -4px rgba(0, 0, 0, 0.12),
      0 9px 28px 8px rgba(0, 0, 0, 0.05) !important;

    .ant-picker-panel {
      background-color: var(--bg-color) !important;
      border: none !important;
    }

    .ant-picker-header {
      border-bottom: 1px solid var(--border-color) !important;
    }

    .ant-picker-header button {
      color: var(--text-color-secondary) !important;

      &:hover {
        color: #1890ff !important;
      }
    }

    .ant-picker-content {
      th {
        color: var(--text-color-tertiary) !important;
      }

      td {
        color: var(--text-color-secondary) !important;

        &:hover .ant-picker-cell-inner {
          background: var(--hover-bg-color) !important;
        }

        &.ant-picker-cell-selected .ant-picker-cell-inner {
          background: #1890ff !important;
          color: #ffffff !important;
        }

        &.ant-picker-cell-today .ant-picker-cell-inner {
          border-color: #1890ff !important;
        }
      }
    }
  }

  // Modal styles
  :deep(.ant-modal) {
    .ant-modal-content {
      background-color: var(--bg-color);
    }

    .ant-modal-header {
      background-color: var(--bg-color);
      border-bottom: 1px solid var(--border-color-light);

      .ant-modal-title {
        color: var(--text-color);
      }
    }

    .ant-modal-body {
      background-color: var(--bg-color);
    }
  }

  .output-detail {
    max-height: 600px;
    overflow-y: auto;

    .command-info {
      margin-bottom: 20px;
    }

    .command-output h4 {
      margin: 20px 0 10px 0;
      color: var(--text-color);
      font-weight: 600;
    }

    .output-content {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 15px;
      border-radius: 6px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.4;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      border: 1px solid var(--border-color-light);
    }
  }

  :deep(.ant-descriptions) {
    .ant-descriptions-header {
      .ant-descriptions-title {
        color: var(--text-color);
      }
    }

    .ant-descriptions-item-label {
      background-color: var(--bg-color-secondary);
      color: var(--text-color);
      font-weight: 600;
    }

    .ant-descriptions-item-content {
      background-color: var(--bg-color);
      color: var(--text-color-secondary);
    }
  }
}
</style>
