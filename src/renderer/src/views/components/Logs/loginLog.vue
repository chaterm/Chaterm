<template>
  <div class="login-log-container">
    <div class="header">
      <h2>{{ t('logs.loginLogs') }}</h2>
      <div class="search-section">
        <a-space>
          <a-input
            v-model:value="searchForm.email"
            :placeholder="t('logs.searchByEmail')"
            style="width: 200px"
            allow-clear
          />
          <a-range-picker
            v-model:value="searchForm.dateRange"
            :placeholder="[t('logs.startDate'), t('logs.endDate')]"
            format="YYYY-MM-DD"
          />
          <a-button
            type="primary"
            :loading="loading"
            @click="handleSearch"
          >
            {{ t('common.search') }}
          </a-button>
          <a-button @click="handleReset">
            {{ t('common.reset') }}
          </a-button>
        </a-space>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="loginLogs"
      :pagination="pagination"
      :loading="loading"
      :scroll="{ x: 1200 }"
      row-key="id"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === 'success' ? 'green' : 'red'">
            {{ record.status === 'success' ? t('logs.loginSuccess') : t('logs.loginFailed') }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'created_at'">
          {{ formatDateTime(record.created_at) }}
        </template>
        <template v-else-if="column.key === 'login_method'">
          <a-tag color="blue">{{ record.login_method || t('logs.unknown') }}</a-tag>
        </template>
        <template v-else-if="column.key === 'platform'">
          <a-tag color="purple">{{ record.platform || t('logs.unknown') }}</a-tag>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { getLoginLogs } from '@/utils/loginLogger'
import type { TableColumnsType, TableProps } from 'ant-design-vue'
import dayjs from 'dayjs'

const { t } = useI18n()

interface LoginLogRecord {
  id: number
  username: string
  email: string
  ip_address: string
  mac_address: string
  login_method: string
  status: string
  user_agent: string
  platform: string
  created_at: string
}

const loading = ref(false)
const loginLogs = ref<LoginLogRecord[]>([])

const searchForm = ref({
  email: '',
  dateRange: undefined as [string, string] | undefined
})

const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} / ${total} ${t('logs.items')}`
})

const columns: TableColumnsType<LoginLogRecord> = [
  {
    title: t('logs.username'),
    dataIndex: 'username',
    key: 'username',
    width: 120,
    ellipsis: true
  },
  {
    title: t('logs.email'),
    dataIndex: 'email',
    key: 'email',
    width: 200,
    ellipsis: true
  },
  {
    title: t('logs.ipAddress'),
    dataIndex: 'ip_address',
    key: 'ip_address',
    width: 130
  },
  {
    title: t('logs.macAddress'),
    dataIndex: 'mac_address',
    key: 'mac_address',
    width: 150,
    ellipsis: true
  },
  {
    title: t('logs.loginMethod'),
    dataIndex: 'login_method',
    key: 'login_method',
    width: 120
  },
  {
    title: t('logs.status'),
    dataIndex: 'status',
    key: 'status',
    width: 100
  },
  {
    title: t('logs.platform'),
    dataIndex: 'platform',
    key: 'platform',
    width: 100
  },
  {
    title: t('logs.loginTime'),
    dataIndex: 'created_at',
    key: 'created_at',
    width: 160
  }
]

const formatDateTime = (dateTime: string) => {
  return dayjs(dateTime).add(8, 'hour').format('YYYY-MM-DD HH:mm:ss')
}

const fetchLoginLogs = async () => {
  try {
    loading.value = true

    const params: any = {
      limit: pagination.value.pageSize,
      offset: (pagination.value.current - 1) * pagination.value.pageSize
    }

    if (searchForm.value.email) {
      params.email = searchForm.value.email
    }

    if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
      params.startDate = dayjs(searchForm.value.dateRange[0]).format('YYYY-MM-DD 00:00:00')
      params.endDate = dayjs(searchForm.value.dateRange[1]).format('YYYY-MM-DD 23:59:59')
    }

    const result = await getLoginLogs(params)

    if (result.success) {
      loginLogs.value = result.data.logs
      pagination.value.total = result.data.total
    } else {
      message.error(t('logs.fetchError') + ': ' + result.error)
    }
  } catch (error) {
    console.error('Failed to fetch login logs:', error)
    message.error(t('logs.fetchError'))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.value.current = 1
  fetchLoginLogs()
}

const handleReset = () => {
  searchForm.value.email = ''
  searchForm.value.dateRange = undefined
  pagination.value.current = 1
  fetchLoginLogs()
}

const handleTableChange: TableProps['onChange'] = (pag, filters, sorter) => {
  pagination.value.current = pag.current || 1
  pagination.value.pageSize = pag.pageSize || 20
  fetchLoginLogs()
}

onMounted(() => {
  fetchLoginLogs()
})
</script>

<style lang="less" scoped>
.login-log-container {
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

    &.ant-tag-purple {
      background-color: rgba(114, 46, 209, 0.15);
      color: #722ed1;
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
}
</style>
