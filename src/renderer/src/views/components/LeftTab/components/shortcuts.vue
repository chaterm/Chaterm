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
              <div :class="['shortcut-container', { 'special-shortcut-display': action.id === 'switchToSpecificTab' }]">
                <div
                  :class="[
                    'shortcut-display',
                    {
                      recording: recordingAction === action.id,
                      'modifiable-part': action.id === 'switchToSpecificTab'
                    }
                  ]"
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
                <!-- Only show suffix for switchToSpecificTab -->
                <span
                  v-if="action.id === 'switchToSpecificTab'"
                  class="fixed-part"
                >
                  +[1...9]
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

    <!-- Modal for recording shortcuts -->
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

const actions = ref<ShortcutAction[]>([])
const currentShortcuts = ref<ShortcutConfig | null>(null)
const recordingAction = ref<string | null>(null)
const showRecordingModal = ref(false)
const tempShortcut = ref('')

onMounted(() => {
  loadShortcuts()
  // Listen for ESC key to cancel recording event
  eventBus.on('shortcut-recording-cancelled', cancelRecording)
})

onUnmounted(() => {
  if (recordingAction.value) {
    document.removeEventListener('keydown', handleKeyRecording)
    document.removeEventListener('mousedown', handleOutsideClick)
    // Ensure shortcut functionality is restored
    shortcutService.setRecording(false)
  }
  eventBus.off('shortcut-recording-cancelled', cancelRecording)
})

const loadShortcuts = async () => {
  try {
    actions.value = shortcutService.getActions()
    currentShortcuts.value = shortcutService.getShortcuts()
  } catch (error) {
    console.error('Failed to load shortcuts:', error)
    message.error(t('user.shortcutSaveFailed'))
  }
}

const getCurrentShortcut = (actionId: string): string => {
  return currentShortcuts.value?.[actionId] || ''
}

const formatShortcut = (shortcut: string, actionId?: string): string => {
  return shortcutService.formatShortcut(shortcut, actionId)
}

const getActionName = (actionId: string): string => {
  const action = actions.value.find((a) => a.id === actionId)
  return action ? t(action.nameKey) : actionId
}

const startRecording = (actionId: string) => {
  recordingAction.value = actionId
  showRecordingModal.value = true
  tempShortcut.value = ''

  // Set recording state to prevent shortcut triggers
  shortcutService.setRecording(true)

  document.addEventListener('keydown', handleKeyRecording)

  setTimeout(() => {
    document.addEventListener('mousedown', handleOutsideClick)
  }, 100) // Delay adding listener to avoid immediate trigger from current click
}

const handleKeyRecording = (event: KeyboardEvent) => {
  if (!recordingAction.value) return

  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    return
  }

  const parts: string[] = []
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  if (event.ctrlKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push(isMac ? 'Option' : 'Alt')
  if (event.metaKey) parts.push('Command')

  // For switchToSpecificTab, if only modifier keys are pressed, save the modifier combination directly
  if (['Control', 'Alt', 'Shift', 'Meta', 'Command'].includes(event.key)) {
    if (recordingAction.value === 'switchToSpecificTab' && parts.length > 0) {
      // For switchToSpecificTab, allow shortcuts with only modifier keys
      tempShortcut.value = parts.join('+')
    }
    return
  }

  // For other actions, a main key is required
  // Add main key - use event.code to avoid special character issues caused by Option key
  let mainKey = event.key

  // If Option key is pressed, use event.code to get the actual key name
  if (event.altKey && isMac) {
    if (event.code.startsWith('Key')) {
      mainKey = event.code.substring(3)
    } else if (event.code.startsWith('Digit')) {
      mainKey = event.code.substring(5)
    } else {
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
    if (mainKey === ' ') mainKey = 'Space'
    if (mainKey === 'Enter') mainKey = 'Return'
    if (mainKey === 'Escape') mainKey = 'Esc'
  }

  if (mainKey.length === 1 && mainKey.match(/[a-z]/)) {
    mainKey = mainKey.toUpperCase()
  }

  parts.push(mainKey)

  tempShortcut.value = parts.join('+')
}

// Handle clicks outside the modal
const handleOutsideClick = (event: MouseEvent) => {
  const modalElement = document.querySelector('.shortcut-modal .ant-modal-content')

  if (modalElement && !modalElement.contains(event.target as Node)) {
    cancelRecording()
  }
}

const saveRecording = async () => {
  if (!recordingAction.value || !tempShortcut.value) return

  try {
    if (!shortcutService.validateShortcut(tempShortcut.value)) {
      message.error(t('user.shortcutInvalidMessage'))
      return
    }

    const success = await shortcutService.updateShortcut(recordingAction.value, tempShortcut.value)

    if (success) {
      message.success(t('user.shortcutSaveSuccess'))
      await loadShortcuts()
      cancelRecording()
    } else {
      message.error(t('user.shortcutConflictMessage'))
      shortcutService.setRecording(false)
    }
  } catch (error) {
    console.error('Failed to save shortcut:', error)
    message.error(t('user.shortcutSaveFailed'))
    shortcutService.setRecording(false)
  }
}

const cancelRecording = () => {
  recordingAction.value = null
  showRecordingModal.value = false
  tempShortcut.value = ''

  shortcutService.setRecording(false)

  document.removeEventListener('keydown', handleKeyRecording)
  document.removeEventListener('mousedown', handleOutsideClick) // Remove global click listener
}

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
  padding: 16px;
  background-color: var(--bg-color);
  overflow-y: auto;
}

.section-header {
  margin-bottom: 16px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color);
  }

  .section-description {
    margin: 6px 0 0 0;
    font-size: 14px;
    color: var(--text-color-secondary);
  }
}

.shortcuts-section {
  background-color: var(--bg-color);
  border-radius: 8px;

  :deep(.ant-card-body) {
    padding: 16px;
  }
}

.shortcuts-table {
  .table-header {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
    padding: 8px 6px;
    background-color: var(--hover-bg-color);
    border-radius: 4px;
    margin-bottom: 6px;
    border: 1px solid var(--border-color);

    .header-shortcut,
    .header-action {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-color);
    }
  }

  .table-body {
    .table-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 8px;
      padding: 6px;
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

        .shortcut-container {
          display: flex;
          align-items: center;

          &.special-shortcut-display {
            gap: 4px;

            .modifiable-part {
              min-width: 40px;
            }

            .fixed-part {
              font-family: 'SFMono-Regular', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
              font-size: 13px;
              color: var(--text-color-secondary);
              white-space: nowrap;
              user-select: none;
              pointer-events: none;
            }
          }
        }

        .shortcut-display {
          min-width: 100px;
          padding: 6px 10px;
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
            font-size: 13px;
            color: var(--text-color);
          }

          .recording-text {
            font-size: 13px;
            color: #1890ff;
          }
        }
      }

      .cell-action {
        display: flex;
        flex-direction: column;
        justify-content: center;

        .action-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-color);
          margin-bottom: 2px;
        }

        .action-description {
          font-size: 13px;
          color: var(--text-color-secondary);
          line-height: 1.3;
        }
      }
    }
  }
}

.shortcuts-footer {
  margin-top: 16px;
  padding-top: 16px;
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
        content: 'Waiting for input...';
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

// Hide scrollbar
.shortcuts-container::-webkit-scrollbar {
  display: none;
}

.shortcuts-container {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
