<template>
  <div class="user-config">
    <div class="user-config-title"> {{ $t('common.userConfig') }}</div>
    <a-divider style="border-color: var(--border-color); margin: 0 0 0 0" />
    <div class="tabs-container">
      <a-tabs
        v-model:active-key="activeKey"
        tab-position="left"
        class="user-config-tab"
      >
        <a-tab-pane
          key="0"
          :tab="$t('user.general')"
          force-render
          type="card"
        >
          <General />
        </a-tab-pane>
        <a-tab-pane
          key="1"
          :tab="$t('user.terminal')"
          force-render
          type="card"
        >
          <Terminal />
        </a-tab-pane>
        <a-tab-pane
          key="2"
          :tab="$t('user.extensions')"
          type="card"
        >
          <Extensions />
        </a-tab-pane>
        <a-tab-pane
          key="3"
          :tab="$t('user.models')"
          type="card"
        >
          <Model />
        </a-tab-pane>
        <a-tab-pane
          key="4"
          :tab="$t('user.billing')"
          type="card"
        >
          <Billing />
        </a-tab-pane>
        <a-tab-pane
          key="5"
          :tab="$t('user.aiPreferences')"
          type="card"
        >
          <AI />
        </a-tab-pane>
        <a-tab-pane
          key="6"
          :tab="$t('mcp.title')"
          type="card"
        >
          <Mcp />
        </a-tab-pane>
        <a-tab-pane
          key="7"
          :tab="$t('user.rules')"
          type="card"
        >
          <Rules />
        </a-tab-pane>
        <a-tab-pane
          key="8"
          :tab="$t('user.shortcuts')"
          type="card"
        >
          <Shortcuts />
        </a-tab-pane>
        <a-tab-pane
          key="9"
          :tab="$t('user.privacy')"
          type="card"
        >
          <Privacy />
        </a-tab-pane>
        <a-tab-pane
          key="10"
          :tab="$t('user.about')"
          type="card"
        >
          <About />
        </a-tab-pane>
      </a-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import General from '@/views/components/LeftTab/setting/general.vue'
import Terminal from '@/views/components/LeftTab/setting/terminal.vue'
import Extensions from '@/views/components/LeftTab/setting/extensions.vue'
import AI from '@/views/components/LeftTab/setting/ai.vue'
import Billing from '@/views/components/LeftTab/setting/billing.vue'
import Model from '@/views/components/LeftTab/setting/model.vue'
import Shortcuts from '@/views/components/LeftTab/setting/shortcuts.vue'
import Privacy from '@/views/components/LeftTab/setting/privacy.vue'
import Rules from '@/views/components/LeftTab/setting/rules.vue'
import About from '@/views/components/LeftTab/setting/about.vue'
import Mcp from '@/views/components/LeftTab/setting/mcp.vue'
import eventBus from '@/utils/eventBus'

const activeKey = ref('0')

const switchToTerminalTab = () => {
  activeKey.value = '1'
}

const switchToModelSettingsTab = () => {
  activeKey.value = '3'
}

onMounted(() => {
  eventBus.on('switchToTerminalTab', switchToTerminalTab)
  eventBus.on('switchToModelSettingsTab', switchToModelSettingsTab)
})

onBeforeUnmount(() => {
  eventBus.off('switchToTerminalTab', switchToTerminalTab)
  eventBus.off('switchToModelSettingsTab', switchToModelSettingsTab)
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
  overflow: hidden;
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
    padding: 8px 16px !important;
    margin: 0 !important;
    min-height: 40px;
    font-size: 14px;
    color: var(--text-color-secondary);
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
</style>
