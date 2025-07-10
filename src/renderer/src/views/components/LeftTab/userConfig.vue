<template>
  <div class="user-config">
    <div class="user-config-title"> {{ $t('common.userConfig') }}</div>
    <a-divider style="border-color: var(--border-color); margin: 0 0 0 0" />
    <div class="tabs-container">
      <a-tabs
        default-active-key="0"
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
          key="6"
          :tab="$t('user.terminal')"
          force-render
          type="card"
        >
          <Terminal />
        </a-tab-pane>
        <a-tab-pane
          key="1"
          :tab="$t('user.extensions')"
          type="card"
        >
          <Extensions />
        </a-tab-pane>
        <a-tab-pane
          v-if="!isSkippedLogin"
          key="4"
          :tab="$t('user.models')"
          type="card"
        >
          <Model />
        </a-tab-pane>
        <a-tab-pane
          v-if="!isSkippedLogin"
          key="5"
          :tab="$t('user.billing')"
          type="card"
        >
          <Billing />
        </a-tab-pane>
        <a-tab-pane
          v-if="!isSkippedLogin"
          key="2"
          :tab="$t('user.aiPreferences')"
          type="card"
        >
          <AI />
        </a-tab-pane>
        <a-tab-pane
          key="3"
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
import { ref } from 'vue'
import General from '@/views/components/LeftTab/components/general.vue'
import Terminal from '@/views/components/LeftTab/components/terminal.vue'
import Extensions from '@/views/components/LeftTab/components/extensions.vue'
import AI from '@/views/components/LeftTab/components/ai.vue'
import Billing from '@/views/components/LeftTab/components/billing.vue'
import About from '@/views/components/LeftTab/components/about.vue'
import Model from '@/views/components/LeftTab/components/model.vue'
const isSkippedLogin = ref(localStorage.getItem('login-skipped') === 'true')
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

  // 修改左侧 tab 栏样式
  :deep(.ant-tabs-nav) {
    height: 100%;
    width: 120px;
    background-color: var(--bg-color);

    &::before {
      display: none; // 移除默认的上边框
    }
  }

  // 隐藏内容区域滚动条
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

  // 修改分割线样式
  :deep(.ant-tabs-nav-list) {
    border-right: 1px solid var(--bg-color);
    height: 100%;
  }

  // 缩小 tab 之间的间隔
  :deep(.ant-tabs-tab) {
    padding: 8px 16px !important; // 减小内边距
    margin: 0 !important; // 移除外边距
    // 可以根据需要调整高度
    min-height: 40px; // 设置最小高度
    // 如果需要调整文字大小
    font-size: 14px;
    color: var(--text-color-secondary);
  }

  // 激活状态的 tab 样式
  :deep(.ant-tabs-tab-active) {
    background-color: var(--hover-bg-color); // 可以根据需要调整激活态背景色
    .ant-tabs-tab-btn {
      color: #1890ff !important;
    }
  }

  // 确保内容区域填满剩余空间
  :deep(.ant-tabs-content-holder) {
    height: 100%;
    overflow: auto;
  }

  :deep(.ant-tabs-tabpane) {
    height: 100%;
  }
}
</style>
