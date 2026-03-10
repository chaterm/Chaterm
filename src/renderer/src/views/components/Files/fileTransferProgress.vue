<template>
  <div
    v-if="downloadGroups.length || uploadGroups.length || r2rTaskGroups.length"
    class="transfer-panel"
  >
    <div class="header">{{ $t('files.taskList') }}</div>

    <div class="transferBody">
      <div
        v-if="downloadGroups.length"
        class="group"
      >
        <div class="label">{{ $t('files.download') }}：</div>

        <div
          v-for="group in downloadGroups"
          :key="group.parent.taskKey"
          class="dir-group"
        >
          <div class="parent-item">
            <div class="meta-row">
              <span
                class="file-name"
                :title="group.parent.destPath || group.parent.remotePath"
              >
                {{ group.parent.name }}
              </span>

              <span class="speed">
                <template v-if="group.parent.stage === 'scanning'"> {{ $t('files.scanning') }}... </template>
                <template v-else>
                  {{ formatSummary(group.parent) }}
                </template>
              </span>
            </div>

            <div class="progress-row">
              <div
                v-if="showExpand(group)"
                class="left-actions"
              >
                <a-button
                  type="text"
                  class="expand-btn"
                  @click.stop="toggleExpand(group.parent.taskKey)"
                >
                  <template #icon>
                    <DownOutlined v-if="isExpanded(group.parent.taskKey)" />
                    <RightOutlined v-else />
                  </template>
                </a-button>
              </div>

              <div class="progress-container parent-progress-container">
                <a-progress
                  :percent="group.parent.progress"
                  size="small"
                  class="file-progress"
                  :status="mapAntdStatus(group.parent.status, group.parent.progress)"
                />
              </div>

              <a-button
                type="link"
                danger
                class="cancel-btn"
                @click="cancel(group.parent.taskKey)"
              >
                <template #icon>
                  <CloseOutlined />
                </template>
              </a-button>
            </div>
          </div>

          <div
            v-if="showExpand(group) && isExpanded(group.parent.taskKey)"
            class="children"
          >
            <div class="children-scroll">
              <div
                v-for="task in group.children"
                :key="task.taskKey"
                class="child-item"
              >
                <div class="meta-row">
                  <span
                    class="file-name"
                    :title="task.destPath || task.remotePath"
                  >
                    {{ task.name }}
                  </span>

                  <span class="speed">
                    <template v-if="task.stage === 'scanning'"> {{ $t('files.scanning') }}... </template>
                    <template v-else-if="task.stage === 'pending' || task.stage === 'init'"> {{ $t('files.waiting') }}... </template>
                    <template v-else>
                      {{ task.speed }}
                    </template>
                  </span>
                </div>

                <div class="progress-row child-progress-row">
                  <div class="progress-container">
                    <a-progress
                      :percent="task.progress"
                      size="small"
                      class="file-progress"
                      :status="mapAntdStatus(task.status, task.progress)"
                    />
                  </div>

                  <a-button
                    type="link"
                    danger
                    class="cancel-btn"
                    @click="cancel(task.taskKey)"
                  >
                    <template #icon>
                      <CloseOutlined />
                    </template>
                  </a-button>
                </div>

                <div
                  v-if="task.message"
                  class="message-row"
                >
                  {{ task.message }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="uploadGroups.length"
        class="group"
      >
        <div class="label">{{ $t('files.upload') }}：</div>

        <div
          v-for="group in uploadGroups"
          :key="group.parent.taskKey"
          class="dir-group"
        >
          <div class="parent-item">
            <div class="meta-row">
              <span
                class="file-name"
                :title="group.parent.destPath || group.parent.remotePath"
              >
                {{ group.parent.name }}
              </span>

              <span class="speed">
                <template v-if="group.parent.stage === 'scanning'"> {{ $t('files.scanning') }}... </template>
                <template v-else>
                  {{ formatSummary(group.parent) }}
                </template>
              </span>
            </div>

            <div class="progress-row">
              <div
                v-if="showExpand(group)"
                class="left-actions"
              >
                <a-button
                  type="text"
                  class="expand-btn"
                  @click.stop="toggleExpand(group.parent.taskKey)"
                >
                  <template #icon>
                    <DownOutlined v-if="isExpanded(group.parent.taskKey)" />
                    <RightOutlined v-else />
                  </template>
                </a-button>
              </div>

              <div class="progress-container parent-progress-container">
                <a-progress
                  :percent="group.parent.progress"
                  size="small"
                  class="file-progress"
                  :status="mapAntdStatus(group.parent.status, group.parent.progress)"
                />
              </div>

              <a-button
                type="link"
                danger
                class="cancel-btn"
                @click="cancel(group.parent.taskKey)"
              >
                <template #icon>
                  <CloseOutlined />
                </template>
              </a-button>
            </div>
          </div>

          <div
            v-if="showExpand(group) && isExpanded(group.parent.taskKey)"
            class="children"
          >
            <div class="children-scroll">
              <div
                v-for="task in group.children"
                :key="task.taskKey"
                class="child-item"
              >
                <div class="meta-row">
                  <span
                    class="file-name"
                    :title="task.destPath || task.remotePath"
                  >
                    {{ task.name }}
                  </span>

                  <span class="speed">
                    <template v-if="task.stage === 'scanning'"> {{ $t('files.scanning') }}... </template>
                    <template v-else-if="task.stage === 'pending' || task.stage === 'init'"> {{ $t('files.waiting') }}... </template>
                    <template v-else>
                      {{ task.speed }}
                    </template>
                  </span>
                </div>

                <div class="progress-row child-progress-row">
                  <div class="progress-container">
                    <a-progress
                      :percent="task.progress"
                      size="small"
                      class="file-progress"
                      :status="mapAntdStatus(task.status, task.progress)"
                    />
                  </div>

                  <a-button
                    type="link"
                    danger
                    class="cancel-btn"
                    @click="cancel(task.taskKey)"
                  >
                    <template #icon>
                      <CloseOutlined />
                    </template>
                  </a-button>
                </div>

                <div
                  v-if="task.message"
                  class="message-row"
                >
                  {{ task.message }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Transfer -->
      <div
        v-if="r2rTaskGroups.length"
        class="group"
      >
        <div class="label">{{ $t('files.dragTransfer') }}：</div>

        <div
          v-for="group in r2rTaskGroups"
          :key="group.parent.taskKey"
          class="dir-group"
        >
          <div class="subgroup-title">
            {{ parseGroupTitle(group.parent) }}
          </div>

          <div class="parent-item">
            <div class="meta-row">
              <span
                class="file-name"
                :title="group.parent.destPath || group.parent.remotePath"
              >
                {{ group.parent.name }}
              </span>

              <span class="speed">
                <template v-if="group.parent.stage === 'scanning'"> {{ $t('files.scanning') }}... </template>
                <template v-else>
                  {{ formatSummary(group.parent) }}
                </template>
              </span>
            </div>

            <div class="progress-row">
              <div
                v-if="showExpand(group)"
                class="left-actions"
              >
                <a-button
                  type="text"
                  class="expand-btn"
                  @click.stop="toggleExpand(group.parent.taskKey)"
                >
                  <template #icon>
                    <DownOutlined v-if="isExpanded(group.parent.taskKey)" />
                    <RightOutlined v-else />
                  </template>
                </a-button>
              </div>

              <div class="progress-container parent-progress-container">
                <a-progress
                  :percent="group.parent.progress"
                  size="small"
                  class="file-progress"
                  :status="mapAntdStatus(group.parent.status, group.parent.progress)"
                />
              </div>

              <a-button
                type="link"
                danger
                class="cancel-btn"
                @click="cancel(group.parent.taskKey)"
              >
                <template #icon>
                  <CloseOutlined />
                </template>
              </a-button>
            </div>
          </div>

          <div
            v-if="showExpand(group) && isExpanded(group.parent.taskKey)"
            class="children"
          >
            <div class="children-scroll">
              <div
                v-for="task in group.children"
                :key="task.taskKey"
                class="child-item"
              >
                <div class="meta-row">
                  <span
                    class="file-name"
                    :title="task.destPath || task.remotePath"
                  >
                    {{ task.name }}
                  </span>

                  <span class="speed">
                    <template v-if="task.stage === 'scanning'"> {{ $t('files.scanning') }}... </template>
                    <template v-else-if="task.stage === 'pending' || task.stage === 'init'">{{ $t('files.waiting') }}... </template>
                    <template v-else>
                      {{ task.speed }}
                    </template>
                  </span>
                </div>

                <div class="progress-row child-progress-row">
                  <div class="progress-container">
                    <a-progress
                      :percent="task.progress"
                      size="small"
                      class="file-progress"
                      :status="mapAntdStatus(task.status, task.progress)"
                    />
                  </div>

                  <a-button
                    type="link"
                    danger
                    class="cancel-btn"
                    @click="cancel(task.taskKey)"
                  >
                    <template #icon>
                      <CloseOutlined />
                    </template>
                  </a-button>
                </div>

                <div
                  v-if="task.message"
                  class="message-row"
                >
                  {{ task.message }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { downloadGroups, uploadGroups, r2rTaskGroups, transferTasks, type Task, type TaskStatus } from './fileTransfer'
import { CloseOutlined, DownOutlined, RightOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'

const { t: $t } = useI18n()
const api = (window as any).api

const expandedMap = ref<Record<string, boolean>>({})

const toggleExpand = (taskKey: string) => {
  const next = !expandedMap.value[taskKey]
  expandedMap.value = {}
  if (next) expandedMap.value[taskKey] = true
}

const isExpanded = (taskKey: string) => !!expandedMap.value[taskKey]

const cancel = (taskKey: string) => {
  api.cancelFileTask({ taskKey })
  if (transferTasks.value[taskKey]) {
    transferTasks.value[taskKey].status = 'failed'
    setTimeout(() => delete transferTasks.value[taskKey], 800)
  }
}

const mapAntdStatus = (s: TaskStatus, progress: number) => {
  if (s === 'error') return 'exception'
  if (s === 'failed') return 'normal'
  if (s === 'success' || progress === 100) return 'success'
  return 'active'
}

const isDirectoryGroupTask = (task: Task) => {
  return !!task.isGroup && task.groupKind === 'directory'
}

const formatSummary = (task: Task) => {
  if (task.stage === 'scanning') return `${$t('files.scanning')}...`
  if (task.stage === 'pending' || task.stage === 'init') return `${$t('files.waiting')}...`

  // Folder task: Display completed/total
  if (isDirectoryGroupTask(task)) {
    return `${task.finishedFiles || 0}/${task.totalFiles || 0}`
  }

  // Single-file task: Display speed
  return task.speed || '0 KB/s'
}

const showExpand = (group: { parent: Task; children: Task[] }) => {
  return isDirectoryGroupTask(group.parent) && group.children.length > 0
}

const parseGroupTitle = (task: Task) => {
  const left = task.fromHost ?? task.fromId ?? 'unknown'
  const right = task.toHost ?? task.toId ?? 'unknown'
  return `${extractIp(left)} -> ${extractIp(right)}`
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

  --sb-size: 10px;
  --sb-track: rgba(0, 0, 0, 0.06);
  --sb-thumb: #bfbfbf;
  --sb-thumb-hover: #a8a8a8;
}

.header {
  padding: 2px;
  font-weight: 500;
  font-size: 17px;
  border-bottom: 1px solid var(--text-color-tertiary);
  color: var(--text-color);
}

.transferBody {
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 3px 6px 3px 3px;
  display: block;
}

.group {
  margin-bottom: 10px;
}

.label {
  font-size: 12px;
  color: var(--text-color);
  margin-bottom: 10px;
}

.dir-group {
  margin-bottom: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.subgroup-title {
  font-size: 11px;
  color: var(--text-color);
  opacity: 0.85;
  margin: 6px 0;
}

.parent-item {
  padding: 2px 0 4px;
  background: transparent;
}

.children {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--text-color-tertiary);
}

.children-scroll {
  max-height: 180px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.child-item {
  padding-left: 16px;
  margin-bottom: 8px;
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
  color: var(--text-color);
}

.speed {
  font-size: 12px;
  color: var(--button-bg-color) !important;
  font-family: tabular-nums, monospace;
  flex-shrink: 0;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.child-progress-row {
  padding-left: 0;
}

.left-actions {
  width: 14px;
  min-width: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.progress-container {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.parent-progress-container {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.progress-container :deep(.ant-progress) {
  margin-bottom: 0 !important;
  line-height: 1;
}

.expand-btn {
  padding: 0 !important;
  width: 14px;
  height: 14px;
  min-width: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  border: none;
  background: transparent;
  box-shadow: none;
  transition: none !important;
}

.cancel-btn {
  padding: 0 !important;
  width: 18px;
  height: 18px;
  min-width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  border: none;
  background: transparent;
  transition: none !important;
}

.expand-btn:hover,
.cancel-btn:hover {
  color: var(--button-bg-color);
  background: transparent;
  transition: none !important;
}

.expand-btn :deep(.anticon) {
  font-size: 10px;
  transition: none !important;
}

.cancel-btn :deep(.anticon) {
  font-size: 12px;
  transition: none !important;
}

.message-row {
  font-size: 12px;
  color: #ff4d4f;
  margin-top: 2px;
}

/* Progress */
.file-progress:not(.ant-progress-status-success) :deep(.ant-progress-text) {
  color: var(--text-color) !important;
}

.file-progress.ant-progress-status-success :deep(.ant-progress-text),
.file-progress.ant-progress-status-success :deep(.ant-progress-text .anticon),
.file-progress.ant-progress-status-success :deep(.anticon) {
  color: #52c41a !important;
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

.transferBody::-webkit-scrollbar {
  display: block;
  width: var(--sb-size);
}

.transferBody::-webkit-scrollbar-track {
  display: block;
  width: var(--sb-size);
}

.transferBody::-webkit-scrollbar-thumb {
  background-color: var(--sb-thumb);
  border-radius: 10px;
  background-clip: content-box;
}

.transferBody::-webkit-scrollbar-thumb:hover {
  background-color: var(--sb-thumb-hover, #555) !important;
}

.children-scroll::-webkit-scrollbar {
  display: block;
  width: var(--sb-size);
}

.children-scroll::-webkit-scrollbar-track {
  display: block;
  width: var(--sb-size);
}

.children-scroll::-webkit-scrollbar-thumb {
  background-color: var(--sb-thumb) !important;
  border-radius: 10px;
  background-clip: content-box;
}

.children-scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--sb-thumb-hover, #555) !important;
}
</style>
