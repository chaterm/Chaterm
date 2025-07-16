<template>
  <div class="shortcuts-container">
    <div class="section-header">
      <h3>{{ $t('user.shortcutSettings') }}</h3>
    </div>

    <a-card
      class="shortcuts-section"
      :bordered="false"
    >
      <div class="shortcuts-table">
        <div class="table-header">
          <div class="header-shortcut">{{ $t('user.shortcutKey') }}</div>
          <div class="header-action">{{ $t('user.shortcutAction') }}</div>
        </div>

        <div class="table-body">
          <div
            v-for="action in actions"
            :key="action.id"
            class="table-row"
          >
            <div class="cell-shortcut">
              <div
                class="shortcut-display"
                :class="{ recording: recordingAction === action.id }"
                @click="startRecording(action.id)"
              >
                <span
                  v-if="recordingAction === action.id"
                  class="recording-text"
                >
                  {{ $t('user.shortcutRecording') }}
                </span>
                <span
                  v-else
                  class="shortcut-text"
                >
                  {{ formatShortcut(getCurrentShortcut(action.id)) || $t('user.shortcutClickToModify') }}
                </span>
              </div>
            </div>

            <div class="cell-action">
              <div class="action-description">{{ getActionName(action.id) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="shortcuts-footer">
        <a-button
          class="reset-button"
          size="small"
          :disabled="recordingAction !== null"
          @click="resetAllShortcuts"
        >
          {{ $t('user.shortcutReset') }}{{ $t('common.all') }}
        </a-button>
      </div>
    </a-card>

    <!-- 录制快捷键的模态框 -->
    <a-modal
      v-model:visible="showRecordingModal"
      class="shortcut-modal"
      :footer="null"
      :closable="false"
      :mask-closable="false"
      :centered="true"
      :width="320"
      :style="{ left: '100px' }"
      @cancel="cancelRecording"
    >
      <div class="recording-modal">
        <div class="recording-instruction">
          <p>{{ $t('user.shortcutPressKeys') }}</p>
          <div class="current-shortcut">
            {{ tempShortcut || $t('user.shortcutRecording') }}
          </div>
        </div>

        <div class="recording-actions">
          <a-button @click="cancelRecording">
            {{ $t('user.shortcutCancel') }}
          </a-button>
          <a-button
            type="primary"
            :disabled="!tempShortcut"
            @click="saveRecording"
          >
            {{ $t('user.shortcutSave') }}
          </a-button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { shortcutService } from '@/services/shortcutService'
import type { ShortcutAction } from '@/services/shortcutService'
import type { ShortcutConfig } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'

const { t } = useI18n()

// 响应式数据
const actions = ref<ShortcutAction[]>([])
const currentShortcuts = ref<ShortcutConfig | null>(null)
const recordingAction = ref<string | null>(null)
const showRecordingModal = ref(false)
const tempShortcut = ref('')

// 组件加载时初始化
onMounted(() => {
  loadShortcuts()
  // 监听ESC键取消录制事件
  eventBus.on('shortcut-recording-cancelled', cancelRecording)
})

// 组件卸载时清理
onUnmounted(() => {
  if (recordingAction.value) {
    document.removeEventListener('keydown', handleKeyRecording)
    document.removeEventListener('mousedown', handleOutsideClick)
    // 确保恢复快捷键功能
    shortcutService.setRecording(false)
  }
  // 移除事件监听
  eventBus.off('shortcut-recording-cancelled', cancelRecording)
})

// 加载快捷键数据
const loadShortcuts = async () => {
  try {
    actions.value = shortcutService.getActions()
    currentShortcuts.value = shortcutService.getShortcuts()
  } catch (error) {
    console.error('Failed to load shortcuts:', error)
    message.error(t('user.shortcutSaveFailed'))
  }
}

// 获取当前快捷键
const getCurrentShortcut = (actionId: string): string => {
  return currentShortcuts.value?.[actionId] || ''
}

// 格式化快捷键显示
const formatShortcut = (shortcut: string): string => {
  return shortcutService.formatShortcut(shortcut)
}

// 获取动作名称
const getActionName = (actionId: string): string => {
  const action = actions.value.find((a) => a.id === actionId)
  return action ? t(action.nameKey) : actionId
}

// 开始录制快捷键
const startRecording = (actionId: string) => {
  recordingAction.value = actionId
  showRecordingModal.value = true
  tempShortcut.value = ''

  // 设置录制状态，阻止快捷键触发
  shortcutService.setRecording(true)

  // 添加键盘监听
  document.addEventListener('keydown', handleKeyRecording)

  // 添加全局点击监听，用于检测点击模态框外部
  setTimeout(() => {
    document.addEventListener('mousedown', handleOutsideClick)
  }, 100) // 延迟一点添加监听器，避免当前点击立即触发
}

// 处理键盘录制
const handleKeyRecording = (event: KeyboardEvent) => {
  if (!recordingAction.value) return

  event.preventDefault()
  event.stopPropagation()

  // 忽略 ESC 键，它将由 shortcutService 处理
  if (event.key === 'Escape') {
    return
  }

  // 忽略单独的修饰键
  if (['Control', 'Alt', 'Shift', 'Meta', 'Command'].includes(event.key)) {
    return
  }

  const parts: string[] = []
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  // 添加修饰键
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push(isMac ? 'Option' : 'Alt')
  if (event.metaKey) parts.push('Command')

  // 添加主键 - 使用 event.code 来避免 Option 键造成的特殊字符问题
  let mainKey = event.key

  // 如果按下了 Option 键，使用 event.code 来获取实际的按键名称
  if (event.altKey && isMac) {
    // 处理字母键
    if (event.code.startsWith('Key')) {
      mainKey = event.code.substring(3) // 去掉 "Key" 前缀
    }
    // 处理数字键
    else if (event.code.startsWith('Digit')) {
      mainKey = event.code.substring(5) // 去掉 "Digit" 前缀
    }
    // 处理其他按键
    else {
      const codeMap: { [key: string]: string } = {
        Comma: ',',
        Period: '.',
        Slash: '/',
        Semicolon: ';',
        Quote: "'",
        BracketLeft: '[',
        BracketRight: ']',
        Backslash: '\\',
        Backquote: '`',
        Minus: '-',
        Equal: '=',
        Space: 'Space',
        Enter: 'Return',
        Escape: 'Esc'
      }
      mainKey = codeMap[event.code] || event.code
    }
  } else {
    // 正常情况下的按键处理
    if (mainKey === ' ') mainKey = 'Space'
    if (mainKey === 'Enter') mainKey = 'Return'
    if (mainKey === 'Escape') mainKey = 'Esc'
  }

  // 将字母键转换为大写
  if (mainKey.length === 1 && mainKey.match(/[a-z]/)) {
    mainKey = mainKey.toUpperCase()
  }

  parts.push(mainKey)

  tempShortcut.value = parts.join('+')
}

// 处理点击模态框外部
const handleOutsideClick = (event: MouseEvent) => {
  // 获取模态框元素
  const modalElement = document.querySelector('.shortcut-modal .ant-modal-content')

  // 如果点击的不是模态框内部元素，则取消录制
  if (modalElement && !modalElement.contains(event.target as Node)) {
    cancelRecording()
  }
}

// 保存录制的快捷键
const saveRecording = async () => {
  if (!recordingAction.value || !tempShortcut.value) return

  try {
    // 检查快捷键是否有效
    if (!shortcutService.validateShortcut(tempShortcut.value)) {
      message.error(t('user.shortcutInvalidMessage'))
      return
    }

    // 尝试更新快捷键
    const success = await shortcutService.updateShortcut(recordingAction.value, tempShortcut.value)

    if (success) {
      message.success(t('user.shortcutSaveSuccess'))
      await loadShortcuts()
      cancelRecording()
    } else {
      message.error(t('user.shortcutConflictMessage'))
      // 如果保存失败，也要恢复快捷键功能
      shortcutService.setRecording(false)
    }
  } catch (error) {
    console.error('Failed to save shortcut:', error)
    message.error(t('user.shortcutSaveFailed'))
    // 发生错误时也要恢复快捷键功能
    shortcutService.setRecording(false)
  }
}

// 取消录制
const cancelRecording = () => {
  recordingAction.value = null
  showRecordingModal.value = false
  tempShortcut.value = ''

  // 恢复快捷键功能
  shortcutService.setRecording(false)

  document.removeEventListener('keydown', handleKeyRecording)
  document.removeEventListener('mousedown', handleOutsideClick) // 移除全局点击监听
}

// 重置所有快捷键
const resetAllShortcuts = async () => {
  try {
    await shortcutService.resetShortcuts()
    message.success(t('user.shortcutResetSuccess'))
    await loadShortcuts()
  } catch (error) {
    console.error('Failed to reset all shortcuts:', error)
    message.error(t('user.shortcutSaveFailed'))
  }
}
</script>

<style lang="less" scoped>
.shortcuts-container {
  width: 100%;
  height: 100%;
  padding: 16px; // 减少容器内边距
  background-color: var(--bg-color);
  overflow-y: auto;
}

.section-header {
  margin-bottom: 16px; // 减少标题底部间距

  h3 {
    margin: 0;
    font-size: 16px; // 稍微减小标题字体
    font-weight: 600;
    color: var(--text-color);
  }

  .section-description {
    margin: 6px 0 0 0; // 减少描述间距
    font-size: 14px;
    color: var(--text-color-secondary);
  }
}

.shortcuts-section {
  background-color: var(--bg-color);
  border-radius: 8px;

  :deep(.ant-card-body) {
    padding: 16px; // 减少卡片内边距
  }
}

.shortcuts-table {
  .table-header {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px; // 减少列间距
    padding: 8px 6px; // 减少头部内边距
    background-color: var(--hover-bg-color);
    border-radius: 4px;
    margin-bottom: 6px; // 减少底部间距
    border: 1px solid var(--border-color);

    .header-shortcut,
    .header-action {
      font-size: 13px; // 减小头部字体
      font-weight: 600;
      color: var(--text-color);
    }
  }

  .table-body {
    .table-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 8px; // 减少列间距
      padding: 6px; // 减少行内边距
      border-bottom: 1px solid var(--border-color);
      transition: background-color 0.2s;

      &:hover {
        background-color: var(--hover-bg-color);
      }

      &:last-child {
        border-bottom: none;
      }

      .cell-shortcut {
        display: flex;
        align-items: center;

        .shortcut-display {
          min-width: 100px; // 减小最小宽度
          padding: 6px 10px; // 减少内边距
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background-color: var(--bg-color);
          cursor: pointer;
          transition: all 0.2s;

          &:hover {
            border-color: #1890ff;
            background-color: rgba(24, 144, 255, 0.1);
          }

          &.recording {
            border-color: #1890ff;
            background-color: rgba(24, 144, 255, 0.1);
            animation: recording-pulse 1s infinite;
          }

          .shortcut-text {
            font-family: 'SFMono-Regular', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
            font-size: 13px; // 减小字体
            color: var(--text-color);
          }

          .recording-text {
            font-size: 13px; // 减小字体
            color: #1890ff;
          }
        }
      }

      .cell-action {
        display: flex;
        flex-direction: column;
        justify-content: center;

        .action-name {
          font-size: 14px; // 减小字体
          font-weight: 500;
          color: var(--text-color);
          margin-bottom: 2px; // 减少间距
        }

        .action-description {
          font-size: 13px; // 减小字体
          color: var(--text-color-secondary);
          line-height: 1.3; // 紧凑行高
        }
      }
    }
  }
}

.shortcuts-footer {
  margin-top: 16px; // 减少顶部间距
  padding-top: 16px; // 减少顶部内边距
  border-top: 1px solid var(--border-color);
  text-align: right;

  .reset-button {
    padding: 4px 16px;
    height: 32px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    background-color: var(--bg-color);
    border: 1px solid var(--border-color);
    color: var(--text-color);
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background-color: var(--hover-bg-color);
      border-color: var(--text-color-secondary);
      color: var(--text-color);
    }

    &:active:not(:disabled) {
      background-color: var(--border-color);
      transform: translateY(1px);
    }

    &:disabled {
      background-color: var(--bg-color);
      border-color: var(--border-color);
      color: var(--text-color-disabled);
      opacity: 0.6;
      cursor: not-allowed;
    }

    &:focus {
      outline: none;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
    }
  }
}

.shortcut-modal {
  :deep(.ant-modal-content) {
    border-radius: 8px;
    background-color: var(--bg-color);
    border: 1px solid var(--border-color);
  }

  :deep(.ant-modal-body) {
    padding: 24px;
  }
}

.recording-modal {
  text-align: center;

  .recording-instruction {
    margin-bottom: 20px;

    p {
      font-size: 14px;
      color: var(--text-color);
      margin-bottom: 12px;
      font-weight: 500;
      line-height: 1.4;
    }

    .current-shortcut {
      padding: 10px 14px;
      background-color: var(--hover-bg-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-family: 'SFMono-Regular', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      font-size: 14px;
      color: var(--text-color);
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

      &:empty::before {
        content: '等待输入...';
        color: var(--text-color-secondary);
        font-style: italic;
      }
    }
  }

  .recording-actions {
    display: flex;
    gap: 10px;
    justify-content: center;

    .ant-btn {
      height: 32px;
      padding: 4px 16px;
      font-size: 13px;
      border-radius: 6px;
      font-weight: 500;
      transition: all 0.2s ease;

      &:not(.ant-btn-primary) {
        background-color: var(--bg-color);
        border-color: var(--border-color);
        color: var(--text-color);

        &:hover {
          background-color: var(--hover-bg-color);
          border-color: var(--text-color-secondary);
        }
      }

      &.ant-btn-primary {
        background-color: #1890ff;
        border-color: #1890ff;

        &:hover:not(:disabled) {
          background-color: #40a9ff;
          border-color: #40a9ff;
        }

        &:disabled {
          background-color: var(--border-color);
          border-color: var(--border-color);
          opacity: 0.6;
        }
      }
    }
  }
}

@keyframes recording-pulse {
  0%,
  100% {
    border-color: #1890ff;
  }
  50% {
    border-color: #40a9ff;
  }
}

// 隐藏滚动条
.shortcuts-container::-webkit-scrollbar {
  display: none;
}

.shortcuts-container {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
