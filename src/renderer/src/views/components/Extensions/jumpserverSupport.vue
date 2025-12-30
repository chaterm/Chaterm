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
                :src="getJumpIconSrc()"
                alt="Plugin Icon"
              />
            </div>

            <div class="text_group">
              <h1 class="plugin_name">Jumpserver Support</h1>
              <p class="plugin_description">{{ t('extensions.jumpserverSupport.jmsPluginDesc') }}</p>
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
                <div class="rendered_markdown">
                  <h2 style="margin-top: 15px">{{ t('extensions.jumpserverSupport.jmsPluginDoc') }}</h2>
                  <p>{{ t('extensions.jumpserverSupport.jmsPluginHeader') }}</p>

                  <h3>{{ t('extensions.jumpserverSupport.jmsPluginFunc') }}</h3>
                  <ul class="feature_bullets">
                    <li
                      ><b>{{ t('extensions.jumpserverSupport.jmsPluginFuncAsset') }}：</b
                      >{{ t('extensions.jumpserverSupport.jmsPluginFuncAssetDetail') }}</li
                    >
                    <li
                      ><b>{{ t('extensions.jumpserverSupport.jmsPluginFuncCon') }}：</b
                      >{{ t('extensions.jumpserverSupport.jmsPluginFuncConDetail') }}</li
                    >
                    <li
                      ><b>{{ t('extensions.jumpserverSupport.jmsPluginFuncAuth') }}：</b
                      >{{ t('extensions.jumpserverSupport.jmsPluginFuncAuthDetail') }}</li
                    >
                    <li
                      ><b>{{ t('extensions.jumpserverSupport.jmsPluginFuncAgent') }}：</b
                      >{{ t('extensions.jumpserverSupport.jmsPluginFuncAgentDetail') }}</li
                    >
                  </ul>

                  <h3>{{ t('extensions.jumpserverSupport.jmsPluginGuide') }}</h3>
                  <div class="setup_guide">
                    <ul class="guide_list">
                      <li>{{ t('extensions.jumpserverSupport.jmsStep1') }}</li>
                      <li>{{ t('extensions.jumpserverSupport.jmsStep2') }}</li>
                      <li>{{ t('extensions.jumpserverSupport.jmsStep3') }}</li>
                      <li>{{ t('extensions.jumpserverSupport.jmsStep4') }}</li>
                      <li>{{ t('extensions.jumpserverSupport.jmsStep5') }}</li>
                    </ul>
                  </div>

                  <h3>{{ t('extensions.jumpserverSupport.jmsPluginFuncAgentLog') }}</h3>
                  <div class="mock_terminal">
                    <p class="log_line"
                      ><span class="log_time">[10:15:49]</span> <span class="log_info">●</span> {{ t('ssh.jumpserver.connectingToBastionHost') }}</p
                    >
                    <p class="log_line"
                      ><span class="log_time">[10:15:50]</span> <span class="log_success">✓</span> {{ t('ssh.jumpserver.connectedToBastionHost') }}</p
                    >
                    <p class="log_line"
                      ><span class="log_time">[10:15:50]</span> <span class="log_info">●</span> {{ t('ssh.jumpserver.connectingToTarget') }}</p
                    >
                    <p class="log_line"
                      ><span class="log_time">[10:15:51]</span> <span class="log_info">●</span> {{ t('ssh.jumpserver.authenticating') }}</p
                    >
                    <p class="log_line"
                      ><span class="log_time">[10:15:51]</span> <span class="log_success">✓</span> {{ t('ssh.jumpserver.connectedToTarget') }}</p
                    >
                  </div>
                </div>
              </div>
            </a-tab-pane>

            <a-tab-pane
              key="features"
              :tab="t('extensions.pluginFunctions')"
            >
              <div class="feature_list">
                <a-list
                  item-layout="horizontal"
                  :data-source="featureData"
                >
                  <template #renderItem="{ item }">
                    <a-list-item>
                      <a-list-item-meta :description="item.desc">
                        <template #title
                          ><b>{{ item.title }}</b></template
                        >
                      </a-list-item-meta>
                    </a-list-item>
                  </template>
                </a-list>
              </div>
            </a-tab-pane>
          </a-tabs>
        </div>

        <div class="sidebar">
          <div class="sidebar_block insta:llation_block">
            <h3 class="sidebar_title">{{ t('extensions.installation') }}</h3>
            <a-descriptions
              :column="1"
              size="small"
              class="metadata_descriptions"
            >
              <a-descriptions-item :label="t('extensions.pluginIdentifier')">jumpserver-support</a-descriptions-item>
              <a-descriptions-item :label="t('extensions.pluginLastUpdate')">N/A</a-descriptions-item>
            </a-descriptions>
          </div>

          <div class="sidebar_block categories_block">
            <h3 class="sidebar_title">{{ t('extensions.pluginClassification') }}</h3>
            <div class="categories_tags">
              <a-tag color="orange">SSH</a-tag>
              <a-tag color="blue">Tools</a-tag>
            </div>
          </div>
        </div>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import iconJumpserver from '@/assets/img/jumpserver.svg'
const getJumpIconSrc = () => {
  return iconJumpserver
}

import i18n from '@/locales'
const { t } = i18n.global

const loading = ref(false)
const activeTabKey = ref('details')

const featureData = [
  {
    title: t('extensions.jumpserverSupport.jmsPluginFuncAsset'),
    desc: t('extensions.jumpserverSupport.jmsPluginFuncAssetDetail')
  },
  { title: t('extensions.jumpserverSupport.jmsPluginFuncCon'), desc: t('extensions.jumpserverSupport.jmsPluginFuncConDetail') },
  {
    title: t('extensions.jumpserverSupport.jmsPluginFuncAuth'),
    desc: t('extensions.jumpserverSupport.jmsPluginFuncAuthDetail')
  },
  {
    title: t('extensions.jumpserverSupport.jmsPluginFuncAgent'),
    desc: t('extensions.jumpserverSupport.jmsPluginFuncAgentDetail')
  }
]
</script>
<style scoped>
.mock_terminal {
  background: var(--bg-color-quinary);
  padding: 15px;
  border-radius: 6px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  margin-top: 15px;
}

.log_line {
  margin-bottom: 4px;
  color: red;
}
.log_time {
  color: #858585;
  margin-right: 8px;
}
.log_info {
  color: #73d13d;
}
.log_success {
  color: #73d13d;
}

.feature_list {
  padding: 10px 0;
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
.detail_tabs :deep(.ant-tabs-tabpane) .rendered_markdown h2,
.detail_tabs :deep(.ant-tabs-tabpane) .rendered_markdown h3,
.detail_tabs :deep(.ant-tabs-tabpane) .rendered_markdown p {
  color: var(--text-color) !important;
}

.plugin_detail_view {
  :deep(.ant-list-item-meta-title) {
    color: var(--text-color) !important;
    b {
      color: var(--text-color) !important;
    }
  }

  :deep(.ant-list-item-meta-description) {
    color: var(--text-color) !important;
    opacity: 0.9;
  }

  .sidebar {
    .sidebar_title {
      color: var(--text-color) !important;
    }

    :deep(.ant-descriptions-item-label),
    :deep(.ant-descriptions-item-content) {
      color: var(--text-color) !important;
    }
  }

  :deep(.ant-tag) {
  }
}

.rendered_markdown {
  font-size: 14px;
  line-height: 1.6;

  :deep(h1),
  :deep(h2),
  :deep(h3) {
    color: var(--text-color) !important;
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
</style>
