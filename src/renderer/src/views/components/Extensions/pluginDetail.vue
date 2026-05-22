<template>
  <div class="plugin_detail_view">
    <a-spin
      :spinning="loading"
      :tip="t('extensions.loadPlugin')"
    >
      <header class="detail_header">
        <div class="header_content">
          <div class="title_group">
            <div class="plugin_icon_large">
              <img
                v-if="getIconSrc(plugin)"
                :src="getIconSrc(plugin)"
                alt="Plugin Icon"
              />
              <div
                v-else
                class="icon_placeholder"
                >{{ plugin.name ? plugin.name[0] : '?' }}</div
              >
            </div>
            <div class="text_group">
              <h1 class="plugin_name">{{ plugin.name }}</h1>
              <p class="plugin_description">{{ plugin.description }}</p>
              <div class="action_buttons">
                <template v-if="!isInstalled">
                  <a-button
                    v-if="isInstallable"
                    class="op_btn"
                    :class="{ download_progress_btn: downloadProgressVisible && installing }"
                    :style="downloadProgressButtonStyle"
                    type="primary"
                    size="small"
                    :loading="installing"
                    @click="handleInstall"
                  >
                    {{ installButtonText }}
                  </a-button>
                  <a-button
                    v-else
                    class="op_btn"
                    type="primary"
                    size="small"
                    @click="handleSubscribe"
                  >
                    {{ t('extensions.subscribe') }}
                  </a-button>
                </template>

                <template v-else>
                  <a-button
                    v-if="!isRequiredPlugin"
                    class="op_btn"
                    size="small"
                    danger
                    :loading="uninstalling"
                    @click="handleUninstall"
                  >
                    {{ uninstalling ? t('extensions.uninstalling') : t('extensions.uninstall') }}
                  </a-button>

                  <a-button
                    v-if="needUpdate"
                    class="op_btn"
                    :class="{ download_progress_btn: downloadProgressVisible && updating }"
                    :style="downloadProgressButtonStyle"
                    size="small"
                    :loading="updating"
                    @click="handleUpdate"
                  >
                    {{ updateButtonText }}
                  </a-button>
                </template>
                <a-button
                  v-if="downloadProgressVisible"
                  size="small"
                  class="cancel_download_btn"
                  @click="handleCancelInstall"
                >
                  {{ t('common.cancel') }}
                </a-button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div class="detail_body">
        <div class="main_content">
          <a-tabs
            v-model:active-key="activeTabKey"
            class="detail_tabs"
          >
            <a-tab-pane
              key="details"
              :tab="t('extensions.detail')"
            >
              <div class="markdown_readme_container">
                <div
                  class="rendered_markdown"
                  v-html="renderedReadme"
                ></div>

                <div
                  v-if="!plugin.readme"
                  class="empty_readme"
                  >{{ t('extensions.noReadme') }}</div
                >
              </div>
            </a-tab-pane>
            <a-tab-pane
              key="features"
              :tab="t('extensions.pluginFunctions')"
            >
              <div class="empty_readme">{{ t('extensions.noFunction') }}</div>
            </a-tab-pane>
          </a-tabs>
        </div>

        <div class="sidebar">
          <div class="sidebar_block installation_block">
            <h3 class="sidebar_title">{{ t('extensions.installation') }}</h3>
            <a-descriptions
              :column="1"
              size="small"
              class="metadata_descriptions"
            >
              <a-descriptions-item :label="t('extensions.pluginIdentifier')">
                {{ plugin.id }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('extensions.pluginVersion')">
                {{ plugin.version }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('extensions.pluginLastUpdate')">
                {{ plugin.lastUpdated || 'N/A' }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('extensions.pluginSource')">
                {{ pluginSourceText }}
              </a-descriptions-item>
              <a-descriptions-item :label="t('extensions.pluginSize')">
                {{ formatSize(plugin.size) || t('extensions.unknown') }}
              </a-descriptions-item>
            </a-descriptions>
          </div>

          <div class="sidebar_block categories_block">
            <h3 class="sidebar_title">{{ t('extensions.pluginClassification') }}</h3>
            <div class="categories_tags">
              <!--TODO-->
              <a-tag>Tools</a-tag>
            </div>
          </div>
        </div>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed, watch } from 'vue'
import { notification } from 'ant-design-vue'
import { marked } from 'marked'
import { sanitizeHtml } from '@/utils/sanitize'
import eventBus from '@/utils/eventBus'

import i18n from '@/locales'
import { listPluginVersions, getPluginIconUrl } from '@/api/plugin/plugin'
import { convertFileLocalResourceSrc } from '@/utils/convertFileLocalResourceSrc'
import { usePluginStore } from './usePlugins' //

const api = (window as any).api
const { t } = i18n.global

const logger = createRendererLogger('extensions')

const normalizePluginPlatform = (platform: string): string => {
  if (platform === 'win32') return 'win'
  if (platform === 'darwin') return 'mac'
  if (platform === 'linux') return 'linux'
  return 'all'
}

const props = defineProps({
  pluginInfo: {
    type: Object as () => {
      id: string
      title: string
      props: {
        pluginId: string
        fromLocal?: boolean
      }
    },
    default: () => ({
      id: '',
      title: '',
      props: {
        pluginId: '',
        fromLocal: false
      }
    })
  }
})

const { pluginList, uninstallLocalPlugin, storePlugins } = usePluginStore()

const pluginId = computed(() => props.pluginInfo.props?.pluginId || '')
const pluginName = computed(() => props.pluginInfo.title || '')

const pluginMeta = computed(() => pluginList.value.find((p) => p.pluginId === pluginId.value))

const isInstalled = computed(() => !!pluginMeta.value?.installed)
const needUpdate = computed(() => !!pluginMeta.value?.hasUpdate)
const isStorePlugin = computed(() => storePlugins.value.some((sp) => sp.pluginId === pluginId.value))
const isInstallable = computed(() => pluginMeta.value?.installable !== false)
const isRequiredPlugin = computed(() => pluginMeta.value?.required === true)

const loading = ref(true)
const uninstalling = ref(false)
const installing = ref(false)
const updating = ref(false)
type PluginInstallStage = 'downloading' | 'verifying' | 'installing' | 'done' | 'error' | 'cancelled' | ''
const installStage = ref<PluginInstallStage>('')
const downloadProgressPercent = ref(0)
const activeTabKey = ref('details')

const installStageText = computed(() => {
  switch (installStage.value) {
    case 'downloading':
      return t('extensions.downloading')
    case 'verifying':
      return t('extensions.verifying')
    case 'installing':
      return t('extensions.installing')
    default:
      return ''
  }
})

const installButtonText = computed(() => {
  if (installing.value) {
    return installStageText.value || t('extensions.installing')
  }
  return t('extensions.install')
})

const updateButtonText = computed(() => {
  if (updating.value) {
    return installStageText.value || t('extensions.updating')
  }
  return t('extensions.update')
})

const downloadProgressVisible = computed(() => {
  return (installing.value || updating.value) && installStage.value === 'downloading'
})

const downloadProgressButtonStyle = computed(() => {
  return { '--download-progress': `${downloadProgressPercent.value}%` }
})

const isPluginInstallCancelled = (error: any) => {
  return String(error?.message || error || '')
    .toLowerCase()
    .includes('plugin install cancelled')
}

const getReadableUninstallError = (error: any) => {
  const message = String(error?.message || error || '')
  if (message.includes('PLUGIN_UNINSTALL_DIRECTORY_BUSY') || /EPERM|EACCES|Permission denied/i.test(message)) {
    return t('extensions.uninstallDirectoryBusy')
  }

  return t('extensions.uninstallError')
}

const pluginSourceText = computed(() => {
  const plugin = pluginMeta.value
  if (!plugin) return ''

  const pluginKey = plugin.pluginId

  const inStore = storePlugins.value.some((sp) => {
    const storeKey = sp.pluginId
    return storeKey === pluginKey
  })
  if (plugin.source === 'preinstalled') {
    return 'Preinstalled'
  }
  return inStore ? t('extensions.sourceStore') : t('extensions.sourceLocal')
})

const plugin = ref({
  id: '',
  name: `${t('extensions.loading')}...`,
  description: `${t('extensions.loading')}...`,
  version: '0.0.0',
  iconUrl: '',
  isPlugin: false,
  readme: '',
  lastUpdated: '',
  size: ''
})

const getPluginDetailsFromStore = async () => {
  if (!pluginId.value) return null
  const platform = api?.getPlatform ? normalizePluginPlatform(await api.getPlatform()) : 'all'
  const res: any = await listPluginVersions(pluginId.value, platform)
  return res?.data || res
}

const iconUrl = ref('')

const updateIconSrc = async () => {
  const item = plugin.value

  if (!item.id || !item.version) {
    iconUrl.value = ''
    return
  }

  if (!isInstalled.value) {
    try {
      iconUrl.value = await getPluginIconUrl(item.id, item.version)
    } catch (e) {
      logger.error('Load icon failed', { error: e })
      iconUrl.value = ''
    }
    return
  }

  iconUrl.value = item.iconUrl ? convertFileLocalResourceSrc(item.iconUrl) : ''
}

const loadPluginDetails = async () => {
  const name = pluginName.value
  if (!name) return

  loading.value = true
  try {
    if (!isInstalled.value) {
      const storeDetails = await getPluginDetailsFromStore()

      // Not installed: show store information
      if (storeDetails && storeDetails.versions && storeDetails.versions.length > 0) {
        const latest = storeDetails.versions[0]
        plugin.value = {
          id: pluginId.value,
          name,
          description: latest.description || storeDetails.description || '',
          version: latest.version,
          iconUrl: '',
          isPlugin: true,
          readme: latest.readme || storeDetails.readme || '',
          lastUpdated: latest.lastUpdated || '',
          size: latest.size || ''
        }
      } else {
        plugin.value = {
          id: pluginId.value,
          name,
          description: t('extensions.notFoundInStore'),
          version: '0.0.0',
          iconUrl: '',
          isPlugin: true,
          readme: '',
          lastUpdated: '',
          size: ''
        }
      }
    } else {
      try {
        const details = await api.getPluginDetails(name)
        plugin.value = {
          ...details,
          readme: details.readme,
          isPlugin: details.type === 'plugin'
        }
      } catch (error: any) {
        notification.error({
          message: t('extensions.loadFailed'),
          description: error.message || t('extensions.loadDetailFailed')
        })
      }
    }
  } catch (error: any) {
    notification.error({
      message: t('extensions.loadFailed'),
      description: error?.message || t('extensions.loadDetailFailed')
    })
  } finally {
    await updateIconSrc()
    loading.value = false
  }
}
watch(
  [pluginId, () => pluginMeta.value?.installedVersion],
  ([id, installedVersion]) => {
    logger.debug('Plugin details watch triggered', { id: String(id), installedVersion: String(installedVersion) })
    if (!id) return
    loadPluginDetails()
  },
  { immediate: false }
)

const emit = defineEmits<{
  (e: 'uninstall-plugin', tabId: string): void
}>()

const handleUninstall = async () => {
  const id = pluginId.value
  if (!id || uninstalling.value) return
  if (isRequiredPlugin.value) {
    notification.error({
      message: t('extensions.uninstallFailed'),
      description: 'This plugin is required and cannot be uninstalled'
    })
    return
  }
  uninstalling.value = true
  try {
    await api.uninstallPlugin(id)
    uninstallLocalPlugin(id)
    notification.success({
      message: t('extensions.uninstallSuccess'),
      description: `${t('extensions.plugin')} ${plugin.value.name} ${t('extensions.uninstallSuccess')}`
    })
    eventBus.emit('uninstallPluginEvent', id)
    if (!isStorePlugin.value) {
      emit('uninstall-plugin', props.pluginInfo.id)
    }
  } catch (e: any) {
    logger.error('Plugin uninstall failed in detail view', {
      event: 'plugin.uninstall.detail.error',
      pluginId: id,
      error: e
    })
    notification.error({
      message: t('extensions.uninstallFailed'),
      description: getReadableUninstallError(e)
    })
  } finally {
    uninstalling.value = false
  }
}

const handleInstall = async () => {
  const id = pluginId.value
  if (!id || installing.value) return
  installing.value = true
  try {
    await eventBus.emitAsync('installPluginEvent', id, { timeoutMs: 0 })
  } catch (e: any) {
    if (isPluginInstallCancelled(e)) {
      return
    }
    notification.error({
      message: t('extensions.installFailed'),
      description: e?.message ?? String(e)
    })
  } finally {
    installing.value = false
    installStage.value = ''
    downloadProgressPercent.value = 0
  }
}

const handleUpdate = async () => {
  const id = pluginId.value
  if (!id || updating.value) return
  updating.value = true
  try {
    await eventBus.emitAsync('updatePluginEvent', id, { timeoutMs: 0 })
  } catch (e: any) {
    if (isPluginInstallCancelled(e)) {
      return
    }
    notification.error({
      message: t('extensions.updateFailed'),
      description: e?.message ?? String(e)
    })
  } finally {
    updating.value = false
    installStage.value = ''
    downloadProgressPercent.value = 0
  }
}

const handleSubscribe = () => {
  const pricingUrl = 'https://github.com/chaterm/Chaterm/discussions/1521'
  window.open(pricingUrl, '_blank')
}

const handleCancelInstall = async () => {
  const id = pluginId.value
  if (!id || installStage.value !== 'downloading') return
  await api.cancelPluginInstall(id)
}

const renderedReadme = computed(() => {
  if (!plugin.value.readme) {
    return `<p>${t('extensions.noReadme')}</p>`
  }
  marked.setOptions({
    gfm: true,
    breaks: true
  })
  return sanitizeHtml(marked.parse(plugin.value.readme))
})

const formatSize = (size?: number | string | null) => {
  if (size === null || size === undefined || size === '') {
    return t('extensions.unknown')
  }

  let n = Number(size)
  if (Number.isNaN(n) || n < 0) {
    return t('extensions.unknown')
  }

  if (n === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0

  while (n >= 1024 && unitIndex < units.length - 1) {
    n = n / 1024
    unitIndex++
  }

  const value = n >= 10 ? n.toFixed(0) : n.toFixed(1)
  return `${value} ${units[unitIndex]}`
}

const getIconSrc = (item: typeof plugin.value) => {
  if (item.id === '' || item.version === '') {
    return ''
  }
  if (!isInstalled.value) {
    return iconUrl.value
  }

  return convertFileLocalResourceSrc(item.iconUrl)
}

const handleInstallLoadingChanged = (payload: { pluginId: string; loading: boolean }) => {
  if (payload?.pluginId === pluginId.value) {
    installing.value = payload.loading
    if (payload.loading && !installStage.value) {
      installStage.value = 'installing'
    }
    if (!payload.loading) {
      installStage.value = ''
      downloadProgressPercent.value = 0
    }
  }
}

const handleUpdateLoadingChanged = (payload: { pluginId: string; loading: boolean }) => {
  if (payload?.pluginId === pluginId.value) {
    updating.value = payload.loading
    if (payload.loading && !installStage.value) {
      installStage.value = 'installing'
    }
    if (!payload.loading) {
      installStage.value = ''
      downloadProgressPercent.value = 0
    }
  }
}

const handlePluginInstallProgress = (payload: { pluginId: string; stage: PluginInstallStage; percent?: number }) => {
  if (payload?.pluginId !== pluginId.value) return
  installStage.value = ['done', 'error', 'cancelled'].includes(payload.stage) ? '' : payload.stage
  if (payload.stage === 'downloading') {
    downloadProgressPercent.value = Math.max(0, Math.min(100, Math.round(payload.percent || 0)))
  }
  if (['done', 'error', 'cancelled'].includes(payload.stage)) {
    downloadProgressPercent.value = 0
  }
}

const syncCurrentPluginLoadingState = () => {
  const id = pluginId.value
  if (!id) return
  eventBus.emit('pluginLoadingStateRequest', {
    pluginId: id,
    callback: (state: { installing: boolean; updating: boolean }) => {
      handleInstallLoadingChanged({ pluginId: id, loading: state.installing })
      handleUpdateLoadingChanged({ pluginId: id, loading: state.updating })
    }
  })
}

let stopPluginInstallProgress: (() => void) | undefined

onMounted(() => {
  eventBus.on('pluginInstallLoadingChanged', handleInstallLoadingChanged)
  eventBus.on('pluginUpdateLoadingChanged', handleUpdateLoadingChanged)
  stopPluginInstallProgress = api?.onPluginInstallProgress?.(handlePluginInstallProgress)
  syncCurrentPluginLoadingState()
  loadPluginDetails()
})

onBeforeUnmount(() => {
  eventBus.off('pluginInstallLoadingChanged', handleInstallLoadingChanged)
  eventBus.off('pluginUpdateLoadingChanged', handleUpdateLoadingChanged)
  stopPluginInstallProgress?.()
})
</script>

<style scoped lang="less">
.plugin_detail_view {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  overflow-x: auto;
  padding: 0 40px;
  background-color: var(--bg-color);
  color: var(--text-color);
  scrollbar-width: auto;
  scrollbar-color: var(--border-color-light) transparent;
}

.detail_header {
  padding: 30px 0;
  border-bottom: 1px solid var(--border-color);
}

.header_content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.title_group {
  display: flex;
  align-items: flex-start;
}

.plugin_icon_large {
  width: 90px;
  height: 90px;
  margin-right: 25px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-color);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plugin_icon_large img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.icon_placeholder {
  font-size: 40px;
  color: #fff;
  font-weight: bold;
}

.text_group {
  margin-top: 5px;
}

.plugin_name {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 0 0;
  color: var(--text-color);
}

.plugin_description {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin: 0 0 10px 0;
}

.action_buttons {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.cancel_download_btn {
  flex-shrink: 0;
  &.ant-btn.ant-btn-sm {
    font-size: 13px;
    height: 20px;
    padding: 0 10px 20px 10px;
    border-radius: 4px;
  }
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
    padding: 0 10px 20px 10px;
    border-radius: 4px;
  }

  &.download_progress_btn {
    overflow: hidden;

    background: linear-gradient(
      90deg,
      var(--button-hover-bg) 0 var(--download-progress, 0%),
      var(--button-bg-color) var(--download-progress, 0%) 100%
    ) !important;

    border-color: var(--button-bg-color) !important;
    box-shadow: none !important;
    color: #fff !important;
    min-width: 64px;

    &::before {
      display: none !important;
    }

    :deep(.ant-btn-loading-icon) {
      color: #fff !important;
    }
  }
}

.detail_body {
  display: flex;
  gap: 40px;
  padding-bottom: 50px;
}

.main_content {
  flex: 3;
  min-width: 0;
}

.sidebar {
  flex: 1;
  min-width: 280px;
  max-width: 350px;
  flex-shrink: 0;
}

.sidebar_block {
  margin-bottom: 30px;
}

.sidebar_title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  text-transform: uppercase;
  margin-bottom: 15px;
}

:deep(.ant-tabs-nav) {
  margin-bottom: 0;
}

:deep(.ant-tabs-tab) {
  padding: 12px 0;
  color: var(--text-color-secondary);
}

:deep(.ant-tabs-tab-active) {
  .ant-tabs-tab-btn {
    color: var(--text-color);
    font-weight: 500;
  }
}

:deep(.ant-tabs-ink-bar) {
  background: var(--button-active-bg);
}

.metadata_descriptions {
  :deep(.ant-descriptions-item-label) {
    color: var(--text-color-secondary);
    font-weight: 400;
    width: 130px;
    padding-bottom: 5px;
  }
  :deep(.ant-descriptions-item-content) {
    color: var(--text-color);
    padding-bottom: 5px;
  }
}

.categories_tags .ant-tag {
  background: var(--border-color-light);
  border-color: var(--border-color-light);
  color: var(--text-color);
  margin-right: 8px;
}

.rendered_markdown {
  // Simulate Markdown basic styles
  font-size: 14px;
  line-height: 1.6;

  :deep(h1),
  :deep(h2),
  :deep(h3) {
    color: var(--text-color);
    border-bottom: 1px solid var(--border-color-light);
    padding-bottom: 5px;
    margin-top: 25px;
  }
  :deep(p) {
    color: var(--text-color);
    margin-bottom: 15px;
  }
  :deep(li) {
    color: var(--text-color);
    margin-bottom: 15px;
  }
  :deep(code) {
    background: var(--bg-color-novenary);
    color: var(--text-color);
    padding: 2px 4px;
    border-radius: 3px;
  }
}
.empty_readme {
  color: var(--text-color);
  margin-top: 20px;
}
</style>
