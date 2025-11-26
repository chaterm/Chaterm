<template>
  <div
    class="extension_panel"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <div class="panel_header">
      <span class="panel_title">{{ t('extensions.extensions') }}</span>
    </div>

    <div class="search_box">
      <a-input
        v-model:value="searchValue"
        class="transparent-Input"
        :placeholder="$t('extensions.fuzzySearch')"
        allow-clear
      >
        <template #suffix>
          <search-outlined />
        </template>
      </a-input>
    </div>

    <div
      class="list_container"
      @dragover.prevent
    >
      <a-menu
        v-model:selected-keys="selectedKeys"
        v-model:open-keys="openKeys"
        class="custom_extension_menu"
        mode="inline"
        :theme="currentTheme === 'light' ? 'light' : 'dark'"
        @select="handleSelect"
      >
        <template
          v-for="item in filteredList"
          :key="item.tabName"
        >
          <a-menu-item class="extension_item">
            <div class="item_wrapper">
              <div class="item_icon">
                <img
                  v-if="getIconSrc(item)"
                  :src="getIconSrc(item)"
                  alt="icon"
                />
                <div
                  v-else
                  class="icon_placeholder"
                >
                  {{ item.name ? item.name[0].toUpperCase() : '?' }}
                </div>
              </div>

              <div class="item_info">
                <div
                  class="item_name"
                  :title="item.name"
                >
                  {{ item.name }}
                </div>
                <div
                  class="item_desc"
                  :title="item.description"
                >
                  {{ item.description || $t('extensions.noDescription') }}
                </div>
              </div>
            </div>
          </a-menu-item>
        </template>
      </a-menu>

      <div class="drag_placeholder"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SearchOutlined, LoadingOutlined } from '@ant-design/icons-vue'
import { computed, ref, watch, onMounted, onBeforeUnmount, h } from 'vue'
import { notification } from 'ant-design-vue'
import i18n from '@/locales'
import iconAlias from '@/assets/img/alias.svg'
import { userConfigStore } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'

const api = (window as any).api
const { t } = i18n.global

const emit = defineEmits(['open-user-tab'])
const searchValue = ref('')
const userConfig = ref({
  aliasStatus: 2
})
const currentTheme = ref('dark')

const isInstalling = ref(false)

// 内置图标映射
const iconMap: Record<string, string> = {
  'alias.svg': iconAlias
}

const handleSelect = (item) => {
  const key = item.key
  if (item.key != 'aliasConfig') {
    emit('open-user-tab', 'plugins:' + key)
  } else {
    emit('open-user-tab', key)
  }
}

const selectedKeys = ref<string[]>([])
const openKeys = ref<string[]>([])

const handleExplorerActive = (tabId: string) => {
  const index = selectedKeys.value.findIndex((item) => item === tabId)
  if (index !== -1) {
    selectedKeys.value.splice(index, 1)
  }
}

defineExpose({
  handleExplorerActive
})

// 插件列表
interface PluginUiItem {
  id: string
  name: string
  description: string
  iconUrl: string | null
  tabName: string
  enabled: boolean
}

const pluginItems = ref<PluginUiItem[]>([])

// 通知
const showNotification = (type: 'success' | 'error' | 'info' | 'open' | 'warning', message: string, description?: string) => {
  notification[type]({
    message,
    description,
    placement: 'bottomRight',
    duration: type === 'error' ? 4.5 : 3
  })
}

// 拖拽安装插件
const onDrop = async (e: DragEvent) => {
  const fileList = e.dataTransfer?.files
  if (!fileList || fileList.length === 0) {
    return
  }

  const file = fileList[0] as any
  const filePath = file.path as string | undefined

  if (!filePath) {
    showNotification('error', t('extensions.installFailed'), t('extensions.unableToGetFilePath'))
    return
  }

  if (!filePath.endsWith('.chaterm')) {
    showNotification('warning', t('extensions.formatError'), t('extensions.onDropTip'))
    return
  }

  isInstalling.value = true

  const notificationKey = 'installing_plugin'
  notification.open({
    key: notificationKey,
    message: t('extensions.installing'),
    description: t('extensions.waitForInstall'),
    icon: () => h(LoadingOutlined, { style: 'color: #1890ff' }),
    placement: 'bottomRight',
    duration: 0
  })

  try {
    await api.installPlugin(filePath)

    // 更新通知
    notification.success({
      key: notificationKey,
      message: t('extensions.installSuccess'),
      description: t('extensions.initSuccess'),
      placement: 'bottomRight',
      duration: 3
    })

    await loadPlugins()
  } catch (err: any) {
    notification.error({
      key: notificationKey,
      message: t('extensions.installFailed'),
      description: err?.message ?? String(err),
      placement: 'bottomRight'
    })
  } finally {
    isInstalling.value = false
  }
}

const refreshPlugins = () => {
  loadPlugins()
}

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

// 加载已安装插件列表
const loadPlugins = async () => {
  try {
    if (!api?.listPlugins) return
    const list = await api.listPlugins()
    pluginItems.value = (list || [])
      .filter((p: any) => p.enabled)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        iconUrl: p.iconUrl || null,
        tabName: p.tabName || p.id,
        enabled: p.enabled
      }))
  } catch (e) {
    console.error('loadPlugins error', e)
  }
}

// 初始加载
onMounted(() => {
  loadConfig()
  loadPlugins()

  eventBus.on('aliasStatusChanged', () => {
    loadConfig()
  })
  eventBus.on('updateTheme', (theme) => {
    currentTheme.value = theme
  })
  eventBus.on('reloadPlugins', refreshPlugins)
})

onBeforeUnmount(() => {
  eventBus.off('aliasStatusChanged')
  eventBus.off('updateTheme')
  eventBus.off('reloadPlugins', refreshPlugins)
})

// 配置变更时重载
watch(
  () => userConfig.value.aliasStatus,
  () => {
    // 当 aliasStatus 变化时，重新加载配置
    loadConfig()
  }
)

// 合并内置扩展 + 插件
const list = computed(() => {
  const base = [
    {
      name: 'Alias',
      description: t('extensions.aliasDescription'),
      iconKey: 'alias.svg',
      iconUrl: '',
      tabName: 'aliasConfig',
      show: userConfig.value.aliasStatus === 1,
      isPlugin: false,
      pluginId: ''
    }
  ]
  const plugins = pluginItems.value.map((p) => ({
    name: p.name,
    description: p.description,
    iconKey: '',
    iconUrl: p.iconUrl || '',
    tabName: p.name,
    show: true,
    isPlugin: true,
    pluginId: p.id
  }))

  return [...base, ...plugins]
})

// 搜索过滤
const filteredList = computed(() => {
  const all = list.value.filter((item) => item.show)
  if (!searchValue.value) return all
  const query = searchValue.value.toLowerCase().trim()
  return all.filter((item) => item.name.toLowerCase().includes(query))
})

const convertFileSrc = (path: string | null): string => {
  if (!path || path.startsWith('http') || path.startsWith('data:')) {
    return path || ''
  }

  let cleanPath = path
  if (path.startsWith('file:///')) {
    cleanPath = path.slice(8)
  } else if (path.startsWith('file://')) {
    cleanPath = path.slice(7)
  }

  return `local-resource://${cleanPath}`
}

// 获取图标
const getIconSrc = (item: { iconKey: string; iconUrl: string; isPlugin: boolean }) => {
  if (item.isPlugin && item.iconUrl) {
    return convertFileSrc(item.iconUrl)
  }
  if (!item.isPlugin && item.iconKey) {
    return iconMap[item.iconKey] || ''
  }
  return ''
}
</script>
<style scoped lang="less">
:deep(.extension_full_height) {
  height: 100% !important;
  width: 100% !important;
  display: block;
}

:deep(.ant-spin-container) {
  height: 100% !important;
  display: flex;
  flex-direction: column;
}

.extension_panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel_header {
  padding: 16px 16px 8px 16px;
  flex-shrink: 0;
}
.panel_title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ant-text-color);
}

.search_box {
  padding: 0 12px 10px 12px;
  flex-shrink: 0;
}

.list_container {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
}

.drag_placeholder {
  flex: 1;
  min-height: 20px;
}

.custom_extension_menu {
  background: transparent !important;
  border: none !important;
  width: 100%;
}

:deep(.ant-menu-item) {
  height: auto !important;
  line-height: 1.5 !important;
  padding: 8px !important;
  margin-bottom: 4px !important;
  border-radius: 6px;
  display: block;
}

.item_wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  position: relative;
}

.item_icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  margin-right: 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.item_icon img {
  width: 100%;
  height: 100%;
}

.item_info {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.item_name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  margin-bottom: 2px;
}

.item_desc {
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
}

.item_action {
  margin-left: 8px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  z-index: 10;
}
</style>
