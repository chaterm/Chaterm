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
                v-if="plugin.iconUrl"
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
                <a-button
                  class="uninstall_btn"
                  :disabled="uninstalling"
                  size="small"
                  @click="handleUninstall(pluginName)"
                >
                  {{ uninstalling ? t('extensions.uninstalling') : t('extensions.uninstall') }}
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
              <a-descriptions-item :label="t('extensions.pluginSource')"> MyExt Repository </a-descriptions-item>
              <a-descriptions-item :label="t('extensions.pluginSize')">
                {{ plugin.size || t('extensions.unknown') }}
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
import { ref, onMounted, computed } from 'vue'
import { notification } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import { marked } from 'marked'

const api = (window as any).api

import i18n from '@/locales'
const { t } = i18n.global
const props = defineProps<{
  pluginName: string
  tabId: string
}>()

// 状态
const loading = ref(true)
const uninstalling = ref(false)
const activeTabKey = ref('details')

// 插件数据结构
const plugin = ref({
  id: '',
  name: '加载中...',
  description: '加载中...',
  version: '0.0.0',
  iconUrl: '',
  isPlugin: false,
  readme: '',
  lastUpdated: '',
  size: ''
})

//加载插件详情
const loadPluginDetails = async (pluginName: string) => {
  console.log('loadPluginDetails:', pluginName)
  if (!pluginName) return
  loading.value = true
  try {
    const details = await api.getPluginDetails(pluginName)
    plugin.value = {
      ...details,
      readme: details.readme,
      isPlugin: details.type === 'plugin'
    }
  } catch (error: any) {
    notification.error({ message: t('extensions.loadFailed'), description: error.message || t('extensions.loadDetailFailed') })
  } finally {
    loading.value = false
  }
}

// 卸载插件
const emit = defineEmits<{
  (e: 'uninstall-plugin', tabId: string): void
}>()
const handleUninstall = (pluginName: string) => {
  if (!pluginName || uninstalling.value) return
  uninstalling.value = true
  try {
    api.uninstallPlugin(pluginName)
    notification.success({
      message: t('extensions.uninstallSuccess'),
      description: ` ${t('extensions.plugin')} ${plugin.value.name}  ${t('extensions.uninstallSuccess')}`
    })
    eventBus.emit('reloadPlugins')
    emit('uninstall-plugin', props.tabId)
  } catch (e: any) {
    notification.error({ message: t('extensions.uninstallFailed'), description: e?.message ?? t('extensions.uninstallError') })
  } finally {
    uninstalling.value = false
  }
}

const renderedReadme = computed(() => {
  if (!plugin.value.readme) {
    return `<p>{{ t('extensions.noReadme') }}</p>`
  }
  marked.setOptions({
    gfm: true,
    breaks: true
  })

  return marked.parse(plugin.value.readme)
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
const getIconSrc = (p: typeof plugin.value) => {
  return convertFileSrc(p.iconUrl)
}

onMounted(() => {
  loadPluginDetails(props.pluginName)
})
</script>

<style scoped lang="less">
.plugin_detail_view {
  height: 100%;
  width: 100%;
  padding: 0 40px;
  background-color: var(--bg-color);
  color: var(--text-color);
  overflow-y: auto;
}

// 头部区域 (Header)
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
  gap: 10px;
}
.uninstall_btn {
  background-color: var(--button-bg-color) !important;
  border-color: var(--button-bg-color) !important;
  color: #fff !important;
  &:hover {
    background-color: var(--button-hover-bg) !important;
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

// Ant Design 组件覆盖
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
  // 模拟 Markdown 基础样式
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
