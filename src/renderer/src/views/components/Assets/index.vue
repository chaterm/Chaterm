<template>
  <div class="assets_panel">
    <div class="panel_header">
      <span class="panel_title">{{ t('common.management') }}</span>
    </div>

    <div class="search_box">
      <a-input
        v-model:value="searchValue"
        class="transparent-Input"
        :placeholder="$t('common.search')"
        allow-clear
      >
        <template #suffix>
          <search-outlined />
        </template>
      </a-input>
    </div>

    <div class="list_container">
      <a-menu
        v-model:selected-keys="selectedKeys"
        class="custom_assets_menu"
        mode="inline"
        :theme="currentTheme === 'light' ? 'light' : 'dark'"
        @select="handleSelect"
      >
        <a-menu-item
          v-for="item in filteredList"
          :key="item.key"
          class="assets_item"
        >
          <div class="item_wrapper">
            <div class="item_icon">
              <img
                v-if="item.icon"
                :src="item.icon"
                alt="icon"
              />
            </div>

            <div class="item_info">
              <div class="item_name_container">
                <div
                  class="item_name"
                  :title="item.name"
                >
                  {{ item.name }}
                </div>
              </div>

              <div
                class="item_desc"
                :title="item.description"
              >
                {{ item.description || '' }}
              </div>
            </div>
          </div>
        </a-menu-item>
      </a-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import i18n from '@/locales'
import keyIcon from '@/assets/menu/key.svg'
import hostIcon from '@/assets/menu/laptop.svg'
import filesIcon from '@/assets/menu/files.svg'
import { userConfigStore } from '@/store/userConfigStore'
import { getActualTheme, addSystemThemeListener } from '@/utils/themeUtils'

const { t } = i18n.global
const emit = defineEmits(['open-user-tab'])
const searchValue = ref('')
const selectedKeys = ref<string[]>([])
const configStore = userConfigStore()
const updateActualTheme = () => {
  const theme = configStore.getUserConfig.theme
  const actualTheme = getActualTheme(theme)
  currentTheme.value = actualTheme === 'light' ? 'light' : 'dark'
}
const currentTheme = ref<'light' | 'dark'>('dark')

updateActualTheme()

watch(
  () => configStore.getUserConfig.theme,
  (newTheme) => {
    updateActualTheme()
    if (removeSystemThemeListener) {
      removeSystemThemeListener()
      removeSystemThemeListener = undefined
    }
    if (newTheme === 'auto') {
      removeSystemThemeListener = addSystemThemeListener(() => {
        if (configStore.getUserConfig.theme === 'auto') {
          updateActualTheme()
        }
      }) as () => void
    }
  }
)

let removeSystemThemeListener: (() => void) | undefined

interface AssetsMenuItem {
  key: string
  name: string
  description: string
  icon: string
  tabName: string
}

const list = computed<AssetsMenuItem[]>(() => {
  return [
    {
      key: 'assetConfig',
      name: t('common.hostManagement'),
      description: t('common.hostManagementDesc'),
      icon: hostIcon,
      tabName: 'assetConfig'
    },
    {
      key: 'keyManagement',
      name: t('common.keyManagement'),
      description: t('common.keyManagementDesc'),
      icon: keyIcon,
      tabName: 'keyManagement'
    },
    {
      key: 'files',
      name: t('common.fileManagement'),
      description: t('common.fileManagementDesc'),
      icon: filesIcon,
      tabName: 'files'
    }
  ]
})

const filteredList = computed(() => {
  if (!searchValue.value) return list.value
  const query = searchValue.value.toLowerCase().trim()
  return list.value.filter((item) => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
})

const handleSelect = (item: { key: string }) => {
  const menuItem = list.value.find((i) => i.key === item.key)
  if (menuItem) {
    emit('open-user-tab', menuItem.tabName)
  }
}

const handleExplorerActive = (tabId: string) => {
  const index = selectedKeys.value.findIndex((item) => item === tabId)
  if (index !== -1) {
    selectedKeys.value.splice(index, 1)
  }
}

defineExpose({
  handleExplorerActive
})

onMounted(() => {
  if (configStore.getUserConfig.theme === 'auto') {
    removeSystemThemeListener = addSystemThemeListener(() => {
      if (configStore.getUserConfig.theme === 'auto') {
        updateActualTheme()
      }
    }) as () => void
  }
})

onBeforeUnmount(() => {
  if (removeSystemThemeListener) {
    removeSystemThemeListener()
  }
})
</script>

<style lang="less" scoped>
.assets_panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
}

.panel_header {
  padding: 16px 16px 8px 16px;
  flex-shrink: 0;
}

.panel_title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.search_box {
  padding: 0 12px 10px 12px;
  flex-shrink: 0;
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

.list_container {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.custom_assets_menu {
  background-color: transparent;
  border: none;

  :deep(.ant-menu-item) {
    margin: 4px 0;
    padding: 0 !important;
    height: auto;
    line-height: normal;
    border-radius: 8px;
    transition: all 0.2s ease;

    &:hover {
      background-color: var(--hover-bg-color);
    }

    &.ant-menu-item-selected {
      background-color: var(--hover-bg-color);
      color: var(--text-color);

      &::after {
        display: none;
      }
    }
  }
}

.assets_item {
  .item_wrapper {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    gap: 12px;
  }

  .item_icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background-color: var(--bg-color-secondary);

    img {
      width: 20px;
      height: 20px;
      object-fit: contain;
      filter: var(--icon-filter);
    }
  }

  .item_info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .item_name_container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .item_name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item_desc {
    font-size: 12px;
    color: var(--text-color-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
