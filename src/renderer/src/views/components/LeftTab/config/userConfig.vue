<template>
  <div class="user-config">
    <div class="user-config-title"> {{ $t('common.userConfig') }}</div>
    <a-divider style="border-color: var(--border-color); margin: 0 0 0 0" />
    <div class="tabs-container">
      <div
        class="settings-side-nav-target"
        data-onboarding-id="settings-side-nav"
      ></div>
      <a-tabs
        v-model:active-key="activeKey"
        tab-position="left"
        class="user-config-tab"
      >
        <a-tab-pane
          key="0"
          force-render
          type="card"
        >
          <template #tab>
            <span
              class="settings-tab-label"
              data-onboarding-id="settings-general-tab"
            >
              <SettingFilled class="settings-tab-icon" />
              <span>{{ $t('user.general') }}</span>
            </span>
          </template>
          <General />
        </a-tab-pane>
        <a-tab-pane
          key="1"
          force-render
          type="card"
        >
          <template #tab>
            <span
              class="settings-tab-label"
              data-onboarding-id="settings-terminal-tab"
            >
              <CodeFilled class="settings-tab-icon" />
              <span>{{ $t('user.terminal') }}</span>
            </span>
          </template>
          <Terminal />
        </a-tab-pane>
        <a-tab-pane
          key="2"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <AppstoreFilled class="settings-tab-icon" />
              <span>{{ $t('user.extensions') }}</span>
            </span>
          </template>
          <Extensions />
        </a-tab-pane>
        <a-tab-pane
          key="3"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <CodeSandboxSquareFilled class="settings-tab-icon" />
              <span>{{ $t('user.models') }}</span>
            </span>
          </template>
          <Model />
        </a-tab-pane>
        <a-tab-pane
          v-if="deployStatus === 0"
          key="4"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <CreditCardFilled class="settings-tab-icon" />
              <span>{{ $t('user.billing') }}</span>
            </span>
          </template>
          <Billing />
        </a-tab-pane>
        <a-tab-pane
          key="5"
          type="card"
        >
          <template #tab>
            <span
              class="settings-tab-label"
              data-onboarding-id="settings-ai-preferences-tab"
            >
              <ControlFilled class="settings-tab-icon" />
              <span>{{ $t('user.aiPreferences') }}</span>
            </span>
          </template>
          <AI />
        </a-tab-pane>
        <a-tab-pane
          key="6"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <ApiFilled class="settings-tab-icon" />
              <span>{{ $t('mcp.title') }}</span>
            </span>
          </template>
          <Mcp />
        </a-tab-pane>
        <a-tab-pane
          key="7"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <ThunderboltFilled class="settings-tab-icon" />
              <span>{{ $t('skills.title') }}</span>
            </span>
          </template>
          <Skills />
        </a-tab-pane>
        <a-tab-pane
          key="8"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <SafetyCertificateFilled class="settings-tab-icon" />
              <span>{{ $t('user.rules') }}</span>
            </span>
          </template>
          <Rules />
        </a-tab-pane>
        <a-tab-pane
          key="9"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <GoldFilled class="settings-tab-icon" />
              <span>{{ $t('user.shortcuts') }}</span>
            </span>
          </template>
          <Shortcuts />
        </a-tab-pane>
        <a-tab-pane
          key="13"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <MobileFilled class="settings-tab-icon" />
              <span>{{ $t('user.trustedDevices') }}</span>
            </span>
          </template>
          <TrustedDevices :is-active="activeKey === '13'" />
        </a-tab-pane>
        <a-tab-pane
          key="10"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <LockFilled class="settings-tab-icon" />
              <span>{{ $t('user.privacy') }}</span>
            </span>
          </template>
          <Privacy />
        </a-tab-pane>
        <a-tab-pane
          key="11"
          type="card"
        >
          <template #tab>
            <span class="settings-tab-label">
              <InfoCircleFilled class="settings-tab-icon" />
              <span>{{ $t('user.about') }}</span>
            </span>
          </template>
          <About />
        </a-tab-pane>
        <a-tab-pane
          key="12"
          type="card"
        >
          <template #tab>
            <span class="documentation-tab-label">
              <BookFilled class="settings-tab-icon" />
              {{ $t('user.documentation') }}
              <ExportOutlined class="export-outlined-icon" />
            </span>
          </template>
          <div></div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import General from '@/views/components/LeftTab/setting/general.vue'
import Terminal from '@/views/components/LeftTab/setting/terminal.vue'
import Extensions from '@/views/components/LeftTab/setting/extensions.vue'
import AI from '@/views/components/LeftTab/setting/ai.vue'
import Billing from '@/views/components/LeftTab/setting/billing.vue'
import Model from '@/views/components/LeftTab/setting/model.vue'
import Shortcuts from '@/views/components/LeftTab/setting/shortcuts.vue'
import Privacy from '@/views/components/LeftTab/setting/privacy.vue'
import TrustedDevices from '@/views/components/LeftTab/setting/trustedDevices.vue'
import Rules from '@/views/components/LeftTab/setting/rules.vue'
import About from '@/views/components/LeftTab/setting/about.vue'
import Mcp from '@/views/components/LeftTab/setting/mcp.vue'
import Skills from '@/views/components/LeftTab/setting/skills.vue'
import {
  ApiFilled,
  AppstoreFilled,
  BookFilled,
  CodeFilled,
  CreditCardFilled,
  CodeSandboxSquareFilled,
  ExportOutlined,
  InfoCircleFilled,
  LockFilled,
  MobileFilled,
  ControlFilled,
  SafetyCertificateFilled,
  SettingFilled,
  ThunderboltFilled,
  GoldFilled
} from '@ant-design/icons-vue'
import eventBus from '@/utils/eventBus'
import { getDocsBaseUrl } from '@/utils/edition'

const activeKey = ref('0')

const parseDeployStatus = (raw: unknown): number => {
  if (typeof raw !== 'string') return 0
  const normalized = raw.trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}
const deployStatus = parseDeployStatus(import.meta.env.RENDERER_DEPLOY_STATUS)

const switchToTerminalTab = () => {
  activeKey.value = '1'
}

const switchToGeneralSettingsTab = () => {
  activeKey.value = '0'
}

const switchToModelSettingsTab = () => {
  activeKey.value = '3'
}

const switchToAiPreferencesTab = () => {
  activeKey.value = '5'
}

// Watch for documentation tab click and redirect
watch(activeKey, (newKey) => {
  if (newKey === '12') {
    const baseUrl = getDocsBaseUrl()
    window.open(`${baseUrl}/`, '_blank')
    // Reset to previous tab or default tab after opening documentation
    activeKey.value = '0'
  }
})

onMounted(() => {
  eventBus.on('switchToGeneralSettingsTab', switchToGeneralSettingsTab)
  eventBus.on('switchToTerminalTab', switchToTerminalTab)
  eventBus.on('switchToModelSettingsTab', switchToModelSettingsTab)
  eventBus.on('switchToAiPreferencesTab', switchToAiPreferencesTab)
})

onBeforeUnmount(() => {
  eventBus.off('switchToGeneralSettingsTab', switchToGeneralSettingsTab)
  eventBus.off('switchToTerminalTab', switchToTerminalTab)
  eventBus.off('switchToModelSettingsTab', switchToModelSettingsTab)
  eventBus.off('switchToAiPreferencesTab', switchToAiPreferencesTab)
})
</script>

<style lang="less" scoped>
.user-config {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
}

.user-config-title {
  line-height: 30px;
  font-size: 16px;
  font-weight: 600;
  margin-left: 10px;
  flex-shrink: 0;
  color: var(--text-color);
}

.tabs-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.settings-side-nav-target {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 120px;
  pointer-events: none;
}

.user-config-tab {
  color: var(--text-color);
  height: 100%;

  :deep(.ant-tabs) {
    height: 100%;
  }

  :deep(.ant-tabs-content) {
    height: 100%;
  }

  :deep(.ant-tabs-nav) {
    height: 100%;
    width: 120px;
    background-color: var(--bg-color);

    &::before {
      display: none;
    }
  }

  :deep(.ant-tabs-content-holder) {
    height: 100%;
    overflow: auto;
    background-color: var(--bg-color);

    &::-webkit-scrollbar {
      display: none;
    }

    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  :deep(.ant-tabs-tabpane) {
    padding-left: 0 !important;
    height: 100%;
    overflow: auto;
    background-color: var(--bg-color);

    &::-webkit-scrollbar {
      display: none;
    }

    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  :deep(.ant-tabs-nav-list) {
    border-right: 1px solid var(--bg-color);
    height: 100%;
  }

  :deep(.ant-tabs-tab) {
    padding: 8px 12px !important;
    margin: 0 !important;
    min-height: 30px;
    font-size: 14px;
    color: var(--text-color-secondary);
    border-radius: 6px;

    &:hover {
      background-color: var(--hover-bg-color);
    }
  }

  :deep(.ant-tabs-tab-active) {
    background-color: var(--hover-bg-color);
    .ant-tabs-tab-btn {
      color: #1890ff !important;
    }
  }

  :deep(.ant-tabs-content-holder) {
    height: 100%;
    overflow: auto;
  }

  :deep(.ant-tabs-tabpane) {
    height: 100%;
  }
}

.documentation-tab-label {
  display: flex;
  align-items: center;
}

.settings-tab-label {
  display: inline-flex;
  align-items: center;
}

.settings-tab-icon {
  font-size: 16px;
  opacity: 0.85;
}

.export-outlined-icon {
  font-size: 12px;
  opacity: 0.4;
  color: var(--text-color-secondary);
}
</style>
