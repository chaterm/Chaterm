<template>
  <div
    v-if="downloadList.length || uploadList.length || r2rList.length"
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
          :key="task.taskKey"
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
                :status="task.progress === 100 ? 'success' : 'active'"
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
          :key="task.taskKey"
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
                :status="task.progress === 100 ? 'success' : 'active'"
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
        v-if="Object.keys(r2rGroups).length"
        class="group"
      >
        <div class="label">{{ $t('files.dragTransfer') }}：</div>

        <div
          v-for="(tasks, g) in r2rGroups"
          :key="g"
          class="subgroup"
        >
          <div class="subgroup-title">{{ parseTaskTitle(g) }}</div>

          <div
            v-for="task in tasks"
            :key="task.taskKey"
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
                  :status="task.progress === 100 ? 'success' : 'active'"
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
  </div>
</template>

<script setup lang="ts">
import { downloadList, uploadList, r2rList, transferTasks, r2rGroups } from './fileTransfer'
import { CloseOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

const api = (window as any).api
const cancel = (taskKey: string) => {
  api.cancelFileTask({ taskKey })
  delete transferTasks.value[taskKey]
}

const parseTaskTitle = (g: string) => {
  const parts = g.split('→').map((s) => s.trim())
  if (parts.length !== 2) return g

  const leftIp = extractIp(parts[0])
  const rightIp = extractIp(parts[1])

  if (leftIp && rightIp) return `${leftIp} -> ${rightIp}`
  return g
}

const extractIp = (s: string) => {
  const m = s.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
  if (m) return m[1]

  const first = s.split(':')[0].trim()
  const at = first.lastIndexOf('@')
  return at >= 0 ? first.slice(at + 1) : first
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
  background: linear-gradient(0deg, var(--hover-bg-color), var(--hover-bg-color)), var(--bg-color);
  z-index: 100;
}

.header {
  padding: 2px;
  font-weight: 500;
  font-size: 17px;
  border-bottom: 1px solid var(--text-color-tertiary);
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

.file-progress:not(.ant-progress-status-success) :deep(.ant-progress-text) {
  color: var(--text-color) !important;
}

.file-progress.ant-progress-status-success :deep(.ant-progress-text),
.file-progress.ant-progress-status-success :deep(.ant-progress-text .anticon),
.file-progress.ant-progress-status-success :deep(.anticon) {
  color: #52c41a !important;
}
.subgroup {
  margin-bottom: 10px;
}
.subgroup-title {
  font-size: 12px;
  color: var(--text-color);
  opacity: 0.85;
  margin: 6px 0;
}

.file-progress :deep(.ant-progress:not(.ant-progress-status-success) .ant-progress-bg) {
  background-color: var(--button-bg-color) !important;
}

.file-progress :deep(.ant-progress-status-success .ant-progress-bg) {
  background-color: #52c41a !important;
}

.file-progress :deep(.ant-progress-status-success .ant-progress-text) {
  color: #52c41a !important;
}
.file-progress :deep(.ant-progress-status-success .anticon) {
  color: #52c41a !important;
}
</style>
