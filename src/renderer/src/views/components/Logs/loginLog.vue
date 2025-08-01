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
    width: 160,
    sorter: true
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
    console.error('获取登录日志失败:', error)
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

  :deep(.ant-table) {
    background-color: var(--bg-color);

    .ant-table-thead > tr > th {
      background-color: var(--bg-color-secondary);
      color: var(--text-color);
      border-bottom: 1px solid var(--border-color);
    }

    .ant-table-tbody > tr > td {
      background-color: var(--bg-color);
      color: var(--text-color);
      border-bottom: 1px solid var(--border-color);
    }

    .ant-table-tbody > tr:hover > td {
      background-color: var(--hover-bg-color);
    }
  }

  :deep(.ant-pagination) {
    margin-top: 16px;
    text-align: right;

    .ant-pagination-item {
      background-color: var(--bg-color);
      border-color: var(--border-color);

      a {
        color: var(--text-color);
      }
    }

    .ant-pagination-item-active {
      background-color: var(--primary-color);

      a {
        color: var(--text-color);
      }
    }

    .ant-pagination-prev,
    .ant-pagination-next {
      .ant-pagination-item-link {
        background-color: var(--bg-color);
        border-color: var(--border-color);
        color: var(--text-color);
      }
    }
  }
}

@media (max-width: 768px) {
  .login-log-container {
    .header {
      flex-direction: column;
      align-items: stretch;

      .search-section {
        justify-content: flex-start;
      }
    }
  }
}
</style>
