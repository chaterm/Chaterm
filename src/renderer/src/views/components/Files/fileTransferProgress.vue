<template>
  <div
    v-if="downloadList.length || uploadList.length"
    class="transfer-panel"
  >
    <div class="header">{{ $t('files.taskList') }}</div>
    <div class="body">
      <div
        v-if="downloadList.length"
        class="group"
      >
        <div class="label">{{ $t('files.download') }}：</div>
        <div
          v-for="task in downloadList"
          :key="task.remotePath"
          class="item"
        >
          <div class="meta-row">
            <span
              class="file-name"
              :title="task.name"
              >{{ task.name }}</span
            >
            <span class="speed">{{ task.speed }}</span>
          </div>
          <div class="progress-row">
            <div class="progress-container">
              <a-progress
                :percent="task.progress"
                size="small"
                class="file-progress"
              />
            </div>
            <a-button
              type="link"
              danger
              class="cancel-btn"
              @click="cancel(task.taskKey)"
            >
              <template #icon><CloseOutlined /></template>
            </a-button>
          </div>
        </div>
      </div>

      <div
        v-if="uploadList.length"
        class="group"
      >
        <div class="label">{{ $t('files.upload') }}：</div>
        <div
          v-for="task in uploadList"
          :key="task.remotePath"
          class="item"
        >
          <div class="meta-row">
            <span
              class="file-name"
              :title="task.name"
              >{{ task.name }}</span
            >
            <span class="speed">{{ task.speed }}</span>
          </div>
          <div class="progress-row">
            <div class="progress-container">
              <a-progress
                :percent="task.progress"
                size="small"
                class="file-progress"
              />
            </div>
            <a-button
              type="link"
              danger
              class="cancel-btn"
              @click="cancel(task.taskKey)"
            >
              <template #icon><CloseOutlined /></template>
            </a-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { downloadList, uploadList, transferTasks } from './fileTransfer'
import { CloseOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
const { t: $t } = useI18n()

const api = (window as any).api
const cancel = (taskKey: string) => {
  api.cancelFileTask({ taskKey: taskKey })
  delete transferTasks.value[taskKey]
}
</script>

<style scoped>
.transfer-panel {
  position: fixed;
  right: 20px;
  width: 320px;
  bottom: 20px;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 10px var(--select-border);
  background: var(--bg-color);
}
.header {
  padding: 2px;
  font-weight: 500;
  font-size: 17px;
  border-bottom: 1px solid #f0f0f0;
  color: var(--text-color);
}
.body {
  max-height: 300px;
  overflow-y: auto;
  padding: 3px;
  display: block;
}

.label {
  font-size: 12px;
  color: var(--text-color);
  margin-bottom: 10px;
}

.item {
  margin-bottom: 5px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.file-name {
  font-size: 13px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px;
}

.speed {
  font-size: 12px;
  color: var(--button-bg-color) !important;
  font-family: tabular-nums, monospace;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-container {
  flex: 1;
  display: flex;
  align-items: center;
}

.progress-container :deep(.ant-progress) {
  margin-bottom: 0 !important;
  line-height: 1;
}

.cancel-btn {
  padding: 0;
  width: 20px;
  height: 20px;
  min-width: 0px;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  border: none;
  transition: none !important;
}

.cancel-btn:hover {
  color: var(--button-bg-color);
  background: transparent;
  transition: none !important;
}

.cancel-btn :deep(.anticon) {
  font-size: 12px;
  transition: none !important;
}

.file-progress :deep(.ant-progress-bg) {
  background-color: var(--button-bg-color) !important;
}
.file-progress :deep(.ant-progress-text) {
  color: var(--text-color) !important;
}
</style>
