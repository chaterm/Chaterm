<template>
  <div class="extension_list">
    <div style="display: inline-block; font-size: 16px">{{ t('extensions.extensions') }}</div>
    <div style="width: 100%; margin-top: 7px">
      <a-input
        v-model:value="searchValue"
        class="transparent-Input"
        :placeholder="$t('extensions.fuzzySearch')"
        style="width: 100%"
        allow-clear
      >
        <template #suffix>
          <search-outlined />
        </template>
      </a-input>
      <a-menu
        v-model:selected-keys="selectedKeys"
        v-model:open-keys="openKeys"
        class="menu_list"
        mode="inline"
        :theme="currentTheme === 'light' ? 'light' : 'dark'"
        @select="handleSelect"
      >
        <template
          v-for="item in filteredList"
          :key="item.tabName"
        >
          <a-menu-item :title="item.name">
            <template #icon>
              <img
                :src="getIconSrc(item.icon)"
                alt=""
              />
            </template>
            <div class="menu_list_item_name">
              {{ item.name }}
            </div>
            <div class="menu_list_item_description">
              {{ item.description }}
            </div>
          </a-menu-item>
        </template>
      </a-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import i18n from '@/locales'
import iconAlias from '@/assets/img/alias.svg'
import { userConfigStore } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'

const emit = defineEmits(['open-user-tab'])
const searchValue = ref('')
const userConfig = ref({
  aliasStatus: 2
})
const currentTheme = ref('dark')

const iconMap = {
  'alias.svg': iconAlias
}

const { t } = i18n.global

const handleSelect = (item) => {
  emit('open-user-tab', item.key)
}

const getIconSrc = (iconName) => {
  return iconMap[iconName] || ''
}

const selectedKeys = ref([])
const openKeys = ref([])

const handleExplorerActive = (tabId) => {
  const index = selectedKeys.value.findIndex((item) => item === tabId)
  if (index !== -1) {
    selectedKeys.value.splice(index, 1)
  }
}

defineExpose({
  handleExplorerActive
})

// 加载配置
const loadConfig = async () => {
  try {
    const config = await userConfigStore.getConfig()
    if (config) {
      userConfig.value = config
      currentTheme.value = config.theme || 'dark'
    }
  } catch (error) {
    console.error('Failed to load config:', error)
  }
}

// 初始加载配置
onMounted(() => {
  loadConfig()
  // 监听别名状态变化事件
  eventBus.on('aliasStatusChanged', () => {
    loadConfig()
  })
  // 监听主题变化事件
  eventBus.on('updateTheme', (theme) => {
    currentTheme.value = theme
  })
})

// 移除事件监听
onBeforeUnmount(() => {
  eventBus.off('aliasStatusChanged')
  eventBus.off('updateTheme')
})

// 监听配置变化
watch(
  () => userConfig.value.aliasStatus,
  () => {
    // 当 aliasStatus 变化时，重新加载配置
    loadConfig()
  }
)

const list = computed(() => {
  return [
    {
      name: 'Alias',
      description: t('extensions.aliasDescription'),
      icon: 'alias.svg',
      tabName: 'aliasConfig',
      show: userConfig.value.aliasStatus === 1
    }
  ]
})

const filteredList = computed(() => {
  if (!searchValue.value) {
    return list.value.filter((item) => item.show)
  }
  const query = searchValue.value.toLowerCase().trim()
  return list.value.filter((item) => item.name.toLowerCase().includes(query) && item.show)
})
</script>

<style lang="less" scoped>
.extension_list {
  padding: 10px;
  background-color: var(--bg-color);
  color: var(--text-color);
}

/* 鼠标悬停时变色 */
.menu_list {
  background: var(--bg-color);
  margin-top: 10px;

  .menu_list_item_name {
    line-height: 24px;
    font-weight: bold;
    font-size: 14px;
    color: var(--text-color);
  }

  .menu_list_item_description {
    line-height: 24px;
    font-size: 14px;
    color: var(--text-color-secondary);
  }

  :deep(.ant-menu-item-selected) {
    border-radius: 0;
    border: 1px solid #398bff;
    background-color: var(--hover-bg-color);
  }

  :deep(.ant-menu-item) {
    height: 60px;
    background-color: var(--bg-color);
    color: var(--text-color);

    &:hover {
      background-color: var(--hover-bg-color);
    }
  }

  :deep(.ant-menu-item-icon) {
    align-self: center;
    flex: 0 0 auto;
    min-width: 28px;
    max-width: 32px;
    filter: var(--icon-filter);
  }
}

:deep(.ant-input-affix-wrapper) {
  background-color: var(--bg-color);
  border-color: var(--border-color);
  box-shadow: none;
  &:hover {
    border-color: #1890ff;
  }
}

.transparent-Input {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;

  :deep(.ant-input) {
    background-color: var(--bg-color-secondary) !important;
    color: var(--text-color) !important;
    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }
  }

  :deep(.ant-input-suffix) {
    color: var(--text-color-tertiary) !important;
  }
}
</style>
