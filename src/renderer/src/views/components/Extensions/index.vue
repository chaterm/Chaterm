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
          :key="item.pluginId"
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

              <div class="item_actions">
                <a-button
                  v-if="item.isPlugin && !item.installed"
                  size="small"
                  type="primary"
                  class="op_btn"
                  :loading="item.pluginId ? !!installLoadingMap[item.pluginId] : false"
                  @click.stop="onInstallClick(item)"
                >
                  {{ $t('extensions.install') }}
                </a-button>

                <a-button
                  v-else-if="item.isPlugin && item.installed && item.hasUpdate"
                  size="small"
                  class="op_btn"
                  type="primary"
                  :loading="item.pluginId ? !!updateLoadingMap[item.pluginId] : false"
                  @click.stop="onUpdateClick(item)"
                >
                  {{ $t('extensions.update') }}
                </a-button>
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
import { LoadingOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { notification } from 'ant-design-vue'
import i18n from '@/locales'
import iconAlias from '@/assets/img/alias.svg'
import { userConfigStore } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'
import { getPluginDownload, getPluginIconUrl } from '@/api/plugin/plugin'
import { type DisplayPluginItem, usePluginStore } from './usePlugins'

const api = (window as any).api
const { t } = i18n.global

const emit = defineEmits(['open-user-tab'])
const searchValue = ref('')
const userConfig = ref({
  aliasStatus: 2
})
const currentTheme = ref('dark')
const isInstalling = ref(false)

const iconMap: Record<string, string> = {
  'alias.svg': iconAlias
}

const { pluginList, loadPlugins, loadStorePlugins, uninstallLocalPlugin } = usePluginStore()

const selectedKeys = ref<string[]>([])
const openKeys = ref<string[]>([])

const createdBlobUrls = new Set<string>()

const preloadedKeys = new Set<string>()
const iconUrls = reactive<Record<string, string>>({})
function getPluginKey(item: DisplayPluginItem) {
  return `${item.pluginId}@${item.latestVersion || item.installedVersion || ''}`
}

async function preloadIcons(list: DisplayPluginItem[]) {
  for (const item of list) {
    if (!item.isPlugin) continue

    const key = getPluginKey(item)
    if (preloadedKeys.has(key)) continue

    preloadedKeys.add(key)

    if (item.installed && item.iconUrl) {
      continue
    }

    if (!item.pluginId) {
      continue
    }

    try {
      iconUrls[item.pluginId] = await getPluginIconUrl(item.pluginId, item.latestVersion)
    } catch (e) {
      console.error('preload icon failed', item.pluginId, e)
    }
  }
}

async function getIcons(item: DisplayPluginItem) {
  if (!item.isPlugin) return

  if (item.installed && item.iconUrl) {
    return
  }

  if (!item.pluginId) {
    return
  }

  try {
    iconUrls[item.pluginId] = await getPluginIconUrl(item.pluginId, item.latestVersion)
  } catch (e) {
    console.error('preload icon failed', item.pluginId, e)
  }
}

const handleSelect = (item) => {
  const key = item.key
  if (key !== 'Alias') {
    const active = filteredList.value.find((i) => i.pluginId === key)
    if (!active) return

    const fromLocal = active.installed
    const pluginId = active.pluginId
    emit('open-user-tab', {
      key: 'plugins:' + active.name,
      fromLocal,
      pluginId
    })
  } else {
    emit('open-user-tab', 'aliasConfig')
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

const showNotification = (type: 'success' | 'error' | 'info' | 'open' | 'warning', message: string, description?: string) => {
  notification[type]({
    message,
    description,
    placement: 'bottomRight',
    duration: type === 'error' ? 4.5 : 3
  })
}

// Drag and drop to install the plugin
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

    notification.success({
      key: notificationKey,
      message: t('extensions.installSuccess'),
      description: t('extensions.initSuccess'),
      placement: 'bottomRight',
      duration: 3
    })

    // Reinstall the local plugin after installation
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

const uninstallPluginEvent = (pluginId: string) => {
  uninstallLocalPlugin(pluginId)
  getIcons(pluginList.value[0])
}

const updatePluginEvent = (pluginId: string) => {
  const active = filteredList.value.find((i) => i.pluginId === pluginId)
  if (!active) return
  const latestVersion = active.latestVersion
  onUpdateClick({ pluginId, latestVersion })
}

const installPluginEvent = (pluginId: string) => {
  const active = filteredList.value.find((i) => i.pluginId === pluginId)
  if (!active) return
  const latestVersion = active.latestVersion
  onInstallClick({ pluginId, latestVersion })
}

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

onMounted(() => {
  loadConfig()
  loadStorePlugins()
  loadPlugins()

  eventBus.on('aliasStatusChanged', () => {
    loadConfig()
  })
  eventBus.on('updateTheme', (theme) => {
    currentTheme.value = theme
  })
  eventBus.on('reloadPlugins', refreshPlugins)
  eventBus.on('uninstallPluginEvent', uninstallPluginEvent)
  eventBus.on('installPluginEvent', installPluginEvent)
  eventBus.on('updatePluginEvent', updatePluginEvent)
})

watch(
  () => userConfig.value.aliasStatus,
  () => {
    loadConfig()
  }
)

// Used for rendering list：Alias + pluginList
const list = computed<DisplayPluginItem[]>(() => {
  const base: DisplayPluginItem[] = [
    {
      name: 'Alias',
      description: t('extensions.aliasDescription'),
      iconKey: 'alias.svg',
      iconUrl: '',
      tabName: 'aliasConfig',
      show: userConfig.value.aliasStatus === 1,
      isPlugin: false,
      pluginId: 'Alias',
      installed: false,
      hasUpdate: false,
      isDraggedOnly: false,
      installedVersion: '',
      latestVersion: ''
    }
  ]

  return [...base, ...pluginList.value]
})

const filteredList = computed(() => {
  const all = list.value.filter((item) => item.show)
  if (!searchValue.value) return all
  const query = searchValue.value.toLowerCase().trim()
  console.log('all', all)
  return all.filter((item) => item.name.toLowerCase().includes(query))
})

watch(
  () => filteredList.value,
  (list) => {
    if (Array.isArray(list)) {
      preloadIcons(list)
    }
  },
  { immediate: false, deep: false }
)

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

const getIconSrc = (item: any) => {
  console.log('getIconSrc:', item)
  if (!item.isPlugin && item.iconKey) {
    return iconMap[item.iconKey] || ''
  }
  if (item.installed && item.iconUrl) {
    return convertFileSrc(item.iconUrl)
  }
  if (!item.pluginId) {
    return ''
  }
  const blobUrl = iconUrls[item.pluginId]
  console.log('blobUrl:', iconUrls, item.pluginId, blobUrl)
  return blobUrl || ''
}

const installOrUpdateFromStore = async (pluginId: string, version: string) => {
  const res: any = await getPluginDownload(pluginId, version)
  const data: ArrayBuffer = res

  const disposition = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition']
  let fileName = ''
  if (disposition) {
    const match = /filename="?([^"]+)"?/.exec(disposition)
    if (match && match[1]) {
      fileName = decodeURIComponent(match[1])
    }
  }
  if (!fileName) {
    fileName = `${pluginId}-${version || 'latest'}.chaterm`
  }

  await api.installPluginFromBuffer({
    pluginId,
    version,
    fileName,
    data
  })
}

const installLoadingMap = ref<Record<string, boolean>>({})
const updateLoadingMap = ref<Record<string, boolean>>({})
const setInstallLoading = (id: string, v: boolean) => {
  if (v) {
    installLoadingMap.value[id] = true
  } else {
    delete installLoadingMap.value[id]
  }
}

const onInstallClick = async (item: any) => {
  const id = item.pluginId as string

  setInstallLoading(id, true)

  try {
    await installOrUpdateFromStore(id, item.latestVersion)

    await loadPlugins()

    const installHint = await api.getInstallHint(id)

    if (!installHint || !installHint.message) {
      showNotification('success', t('extensions.installSuccess'))
    } else {
      showNotification('success', t('extensions.installSuccess'), installHint.message)
    }
  } catch (e: any) {
    showNotification('error', t('extensions.installFailed'), e?.message ?? String(e))
    throw e
  } finally {
    setInstallLoading(id, false)
  }
}
const setUpdateLoading = (id: string, v: boolean) => {
  if (v) {
    updateLoadingMap.value[id] = true
  } else {
    delete updateLoadingMap.value[id]
  }
}

const onUpdateClick = async (item: any) => {
  const id = item.pluginId as string

  setUpdateLoading(id, true)

  try {
    await installOrUpdateFromStore(id, item.latestVersion)
    await loadPlugins()
    showNotification('success', t('extensions.updateSuccess'))
  } catch (e: any) {
    showNotification('error', t('extensions.updateFailed'), e?.message ?? String(e))
    throw e
  } finally {
    setUpdateLoading(id, false)
  }
}
onBeforeUnmount(() => {
  eventBus.off('aliasStatusChanged')
  eventBus.off('reloadPlugins', refreshPlugins)
  eventBus.off('uninstallPluginEvent', uninstallPluginEvent)
  eventBus.off('installPluginEvent', installPluginEvent)
  eventBus.off('updatePluginEvent', updatePluginEvent)
  createdBlobUrls.forEach((url) => URL.revokeObjectURL(url))
  createdBlobUrls.clear()
})
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

.item_actions {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  margin-left: auto;
  align-self: flex-end;
}
.op_btn {
  background-color: var(--button-bg-color) !important;
  border-color: var(--button-bg-color) !important;
  color: #fff !important;
  &:hover {
    background-color: var(--button-hover-bg) !important;
  }

  &.ant-btn.ant-btn-sm {
    font-size: 13px;
    height: 20px;
    padding: 0px 10px 20px 10px;
    border-radius: 4px;
  }
}
</style>
