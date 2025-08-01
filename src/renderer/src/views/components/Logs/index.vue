<template>
  <div class="logs_list">
    <div style="display: inline-block; font-size: 16px">{{ t('logs.logs') }}</div>
    <div style="width: 100%; margin-top: 7px">
      <a-menu
        v-model:selected-keys="selectedKeys"
        v-model:open-keys="openKeys"
        class="menu_list"
        mode="inline"
        :theme="currentTheme === 'light' ? 'light' : 'dark'"
        @select="handleSelect"
      >
        <a-menu-item
          key="loginLogs"
          :title="t('logs.loginLogs')"
        >
          <template #icon>
            <user-outlined />
          </template>
          <div class="menu_list_item_name">
            {{ t('logs.loginLogs') }}
          </div>
          <div class="menu_list_item_description">{{ t('logs.loginLogsDesc') }}</div>
        </a-menu-item>

        <a-menu-item
          key="operationLogs"
          :title="t('logs.operationLogs')"
        >
          <template #icon>
            <file-text-outlined />
          </template>
          <div class="menu_list_item_name">
            {{ t('logs.operationLogs') }}
          </div>
          <div class="menu_list_item_description">{{ t('logs.operationLogsDesc') }}</div>
        </a-menu-item>
      </a-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { UserOutlined, FileTextOutlined } from '@ant-design/icons-vue'
import { userConfigStore } from '@/services/userConfigStoreService'

const { t } = useI18n()
const emit = defineEmits(['open-log-tab'])

const selectedKeys = ref([])
const openKeys = ref([])
const currentTheme = ref('dark')

const handleSelect = (item) => {
  emit('open-log-tab', item.key)
}

// Load configuration
const loadConfig = async () => {
  try {
    const config = await userConfigStore.getConfig()
    if (config) {
      currentTheme.value = config.theme || 'dark'
    }
  } catch (error) {
    console.error('Failed to load config:', error)
  }
}

onMounted(() => {
  loadConfig()
})

defineExpose({
  handleExplorerActive: (tabId) => {
    const index = selectedKeys.value.findIndex((item) => item === tabId)
    if (index !== -1) {
      selectedKeys.value.splice(index, 1)
    }
  }
})
</script>

<style lang="less" scoped>
.logs_list {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  background-color: var(--bg-color);
  color: var(--text-color);

  .menu_list {
    margin-top: 8px;
    border: none !important;
    background: transparent !important;

    :deep(.ant-menu-item) {
      margin: 4px 0;
      border-radius: 6px;
      padding: 8px 12px;
      height: auto;
      line-height: 1.4;
      background-color: var(--bg-color);
      color: var(--text-color-secondary);
      border: 1px solid transparent;
      transition: all 0.3s ease;

      &:hover {
        background-color: var(--hover-bg-color) !important;
        color: var(--text-color) !important;
        border-color: var(--border-color-light);
      }

      &.ant-menu-item-selected {
        background-color: rgba(24, 144, 255, 0.15) !important;
        color: #1890ff !important;
        border-color: #1890ff;
      }

      .ant-menu-item-icon {
        margin-right: 8px;
        font-size: 16px;
        color: inherit;
      }

      .menu_list_item_name {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 2px;
        color: inherit;
      }

      .menu_list_item_description {
        font-size: 12px;
        color: var(--text-color-tertiary);
        line-height: 1.3;
      }
    }
  }
}

// Light theme specific style adjustments
:global(.theme-light) .logs_list {
  .menu_list {
    :deep(.ant-menu-item) {
      &:hover {
        background-color: var(--hover-bg-color) !important;
        border-color: var(--border-color-light);
      }

      &.ant-menu-item-selected {
        background-color: rgba(24, 144, 255, 0.08) !important;
        color: #1890ff !important;
        border-color: #1890ff;
      }

      .menu_list_item_description {
        color: var(--text-color-tertiary);
      }
    }
  }
}
</style>
