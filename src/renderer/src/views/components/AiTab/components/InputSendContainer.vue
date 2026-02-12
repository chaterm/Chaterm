<template>
  <div
    class="input-send-container"
    :class="{ 'is-edit-mode': mode === 'edit' }"
  >
    <div
      class="ai-tab-test-hook"
      data-testid="ai-tab"
      style="display: none"
    ></div>
    <!-- Context Select Popup Component -->
    <ContextSelectPopup :mode="mode" />
    <!-- Command Select Popup Component -->
    <CommandSelectPopup />
    <div
      v-if="hasAvailableModels"
      class="input-container"
    >
      <div class="context-display-container">
        <!-- Trigger button -->
        <span
          v-if="chatHistory.length === 0"
          class="context-trigger-tag"
          @click.stop="(e) => handleAddContextClick(e.currentTarget as HTMLElement)"
        >
          {{ hasAnyContext ? '@' : `@ ${$t('ai.addContext')}` }}
        </span>

        <!-- Host Tags -->
        <a-tag
          v-for="item in hosts"
          :key="item.uuid"
          color="blue"
          class="context-tag"
        >
          <template #icon>
            <LaptopOutlined />
          </template>
          {{ item.host }}
          <CloseOutlined
            v-if="chatTypeValue === 'agent' && chatHistory.length === 0"
            class="tag-delete-btn"
            @click.stop="removeHost(item)"
          />
        </a-tag>

        <span
          v-if="currentTab?.session.responseLoading"
          class="processing-indicator"
        >
          <span class="processing-spinner"></span>
          <span class="processing-text">{{ $t('ai.processing') }}</span>
        </span>
      </div>
      <div class="chat-editable-wrapper">
        <div
          ref="editableRef"
          class="chat-editable"
          :class="{ 'is-empty': isEditableEmpty }"
          :data-placeholder="inputPlaceholder"
          data-testid="ai-message-input"
          contenteditable="true"
          spellcheck="false"
          role="textbox"
          @drop="handleEditableDrop"
          @input="handleEditableInput"
          @keydown="(e: KeyboardEvent) => handleEditableKeyDown(e, mode)"
          @keyup="saveSelection"
          @mouseup="saveSelection"
          @click="handleEditableClick"
          @paste="handlePaste"
        ></div>
      </div>
      <div class="input-controls">
        <a-tooltip
          :title="$t('ai.switchAiModeHint')"
          placement="top"
          :get-popup-container="(triggerNode) => triggerNode.parentElement"
          :mouse-enter-delay="0.3"
          :open="aiModeTooltipVisible && !aiModeSelectOpen"
          overlay-class-name="ai-mode-tooltip"
          @open-change="
            (open: boolean) => {
              aiModeTooltipVisible = open
            }
          "
        >
          <a-select
            v-model:value="chatTypeValue"
            v-model:open="aiModeSelectOpen"
            size="small"
            style="width: 95px"
            :options="AiTypeOptions"
            data-testid="ai-mode-select"
            popup-class-name="input-controls-select-dropdown"
            @dropdown-visible-change="handleAiModeSelectOpenChange"
            @keydown.esc.stop
          ></a-select>
        </a-tooltip>
        <a-select
          v-model:value="chatAiModelValue"
          v-model:open="modelSelectOpen"
          size="small"
          class="model-select-responsive"
          style="width: 140px"
          show-search
          popup-class-name="input-controls-select-dropdown"
          @dropdown-visible-change="modelSelectOpen = $event"
          @change="handleChatAiModelChange"
          @keydown.esc.stop
        >
          <a-select-option
            v-for="model in AgentAiModelsOptions"
            :key="model.value"
            :value="model.value"
          >
            <span class="model-label">
              <img
                v-if="model.label.endsWith('-Thinking')"
                src="@/assets/icons/thinking.svg"
                alt="Thinking"
                class="thinking-icon"
              />
              {{ model.label.replace(/-Thinking$/, '') }}
            </span>
          </a-select-option>
        </a-select>
        <div class="action-buttons-container">
          <a-tooltip :title="$t('ai.uploadImage')">
            <a-button
              :disabled="responseLoading"
              size="small"
              class="custom-round-button compact-button"
              @click="handleImageUpload"
            >
              <img
                :src="imageIcon"
                alt="image"
                class="action-icon"
                style="width: 14px; height: 14px"
              />
            </a-button>
          </a-tooltip>
          <a-tooltip :title="$t('ai.uploadFile')">
            <a-button
              :disabled="responseLoading"
              size="small"
              class="custom-round-button compact-button"
              @click="handleFileUpload"
            >
              <img
                :src="uploadIcon"
                alt="upload"
                class="action-icon"
                style="width: 14px; height: 14px"
              />
            </a-button>
          </a-tooltip>
          <a-tooltip :title="$t('ai.startVoiceInput')">
            <VoiceInput
              :disabled="responseLoading"
              :auto-send-after-voice="autoSendAfterVoice"
              @transcription-complete="handleTranscriptionComplete"
              @transcription-error="handleTranscriptionError"
            />
          </a-tooltip>
          <a-tooltip :title="responseLoading ? $t('ai.interruptTask') : ''">
            <a-button
              size="small"
              class="custom-round-button compact-button"
              data-testid="send-message-btn"
              @click="handleSendClick('send')"
            >
              <img
                v-if="responseLoading"
                :src="stopIcon"
                alt="stop"
                class="interrupt-icon"
                style="width: 18px; height: 18px"
              />
              <img
                v-else
                :src="sendIcon"
                alt="send"
                style="width: 18px; height: 18px"
              />
            </a-button>
          </a-tooltip>
        </div>
      </div>
    </div>
  </div>
  <input
    ref="fileInputRef"
    type="file"
    accept=".txt,.md,.js,.ts,.py,.java,.cpp,.c,.html,.css,.json,.xml,.yaml,.yml,.sql,.sh,.bat,.ps1,.log,.csv,.tsv"
    style="display: none"
    @change="handleFileSelected"
  />
  <input
    ref="imageInputRef"
    type="file"
    accept="image/jpeg,image/png,image/gif,image/webp"
    multiple
    style="display: none"
    @change="handleImageSelected"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch, provide, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { notification } from 'ant-design-vue'
import VoiceInput from '../components/voice/voiceInput.vue'
import ContextSelectPopup from '../components/ContextSelectPopup.vue'
import CommandSelectPopup from '../components/CommandSelectPopup.vue'
import { useSessionState } from '../composables/useSessionState'
import { useContext, contextInjectionKey } from '../composables/useContext'
import { useCommandSelect, commandSelectInjectionKey } from '../composables/useCommandSelect'
import { useModelConfiguration } from '../composables/useModelConfiguration'
import { useUserInteractions } from '../composables/useUserInteractions'
import { parseContextDragPayload, useEditableContent } from '../composables/useEditableContent'
import { AiTypeOptions } from '../composables/useEventBusListeners'
import { getImageMediaType } from '../utils'
import type { ContentPart, ContextDocRef, ContextPastChatRef, ContextCommandRef } from '@shared/WebviewMessage'
import type { HistoryItem } from '../types'
import { CloseOutlined, LaptopOutlined } from '@ant-design/icons-vue'
import uploadIcon from '@/assets/icons/upload.svg'
import imageIcon from '@/assets/icons/image.svg'
import sendIcon from '@/assets/icons/send.svg'
import stopIcon from '@/assets/icons/stop.svg'

interface Props {
  isActiveTab: boolean
  sendMessage?: (sendType: string) => Promise<unknown>
  handleInterrupt?: () => void
  interruptAndSendIfBusy?: (sendType: string) => Promise<void> | void
  interactionActive?: boolean
  // New properties for edit mode
  mode?: 'create' | 'edit'
  initialContentParts?: ContentPart[]
  onConfirmEdit?: (contentParts: ContentPart[]) => void
  openHistoryTab?: (history: HistoryItem, options?: { forceNewTab?: boolean }) => Promise<void>
}

const props = withDefaults(defineProps<Props>(), {
  sendMessage: async () => {},
  handleInterrupt: () => {},
  interruptAndSendIfBusy: undefined,
  interactionActive: false,
  mode: 'create',
  initialContentParts: () => [],
  onConfirmEdit: () => {}
})

const { t } = useI18n()

const {
  chatTextareaRef,
  currentTab,
  chatTypeValue,
  chatAiModelValue,
  chatContainerScrollSignal,
  hosts,
  chatInputParts,
  responseLoading,
  chatHistory
} = useSessionState()

const editableRef = ref<HTMLDivElement | null>(null)

// Local draft parts for edit mode to avoid polluting the global draft (chatInputParts).
const localDraftParts = ref<ContentPart[]>([])

// A unified input parts ref for both modes:
// - create mode: uses global chatInputParts (normal behavior)
// - edit mode: uses localDraftParts (isolated to the editing message)
const inputParts = computed<ContentPart[]>({
  get: () => (props.mode === 'edit' ? localDraftParts.value : chatInputParts.value),
  set: (parts) => {
    if (props.mode === 'edit') {
      localDraftParts.value = parts
      return
    }
    chatInputParts.value = parts
  }
})

// Create context instance and provide to child components.
// We pass inputParts so chip insertion works in edit mode without touching the global draft.
// Pass mode to avoid duplicate event listeners in edit mode.
const context = useContext({
  chatInputParts: inputParts,
  focusInput: () => {
    editableRef.value?.focus()
    restoreSelection()
  },
  mode: props.mode
})
provide(contextInjectionKey, context)

const { showContextPopup, removeHost, handleAddContextClick, onHostClick, setChipInsertHandler, setImageInsertHandler } = context

// Create command select instance and provide to child components.
const commandSelectContext = useCommandSelect({
  focusInput: () => {
    editableRef.value?.focus()
    restoreSelection()
  }
})
provide(commandSelectInjectionKey, commandSelectContext)

const { showCommandPopup, handleShowCommandPopup, setCommandChipInsertHandler, removeTrailingSlashFromInputParts } = commandSelectContext
const hasSendableContent = () => {
  return (
    inputParts.value.length > 0 &&
    inputParts.value.some((part) => part.type === 'chip' || part.type === 'image' || (part.type === 'text' && part.text.trim().length > 0))
  )
}

// Send click handler supporting both modes (defined before useEditableContent for dependency)
const handleSendClick = async (type: string) => {
  if (responseLoading.value) {
    props.handleInterrupt()
    return
  }

  const isBusy = props.interactionActive
  if (props.mode !== 'edit' && isBusy && props.interruptAndSendIfBusy) {
    const content = extractPlainTextFromParts(inputParts.value).trim()
    if (!content && !hasSendableContent()) {
      notification.warning({
        message: t('ai.sendContentEmpty'),
        duration: 2
      })
      return
    }
    await props.interruptAndSendIfBusy(type)
    return
  }

  if (props.mode === 'edit') {
    const hasParts = hasSendableContent()
    const content = extractPlainTextFromParts(inputParts.value).trim()
    if (!content && !hasParts) {
      notification.warning({
        message: t('ai.sendContentEmpty'),
        duration: 2
      })
      return
    }
    props.onConfirmEdit?.(inputParts.value)
  } else {
    // Create mode: original logic
    props.sendMessage(type)
  }
}

const handleChipClick = async (chipType: 'doc' | 'chat' | 'command', ref: ContextDocRef | ContextPastChatRef | ContextCommandRef) => {
  if (chipType === 'doc') {
    const docRef = ref as ContextDocRef
    if (docRef.type !== 'dir') {
      await context.openKbFile(docRef.absPath, docRef.name)
    }
    return
  }
  if (chipType === 'command') {
    const cmdRef = ref as ContextCommandRef
    await context.openKbFile(cmdRef.path, cmdRef.label)
    return
  }
  const chatRef = ref as ContextPastChatRef
  if (!props.openHistoryTab) return
  await props.openHistoryTab(
    {
      id: chatRef.taskId,
      chatTitle: chatRef.title || 'Untitled Chat',
      chatType: 'agent',
      chatContent: []
    },
    { forceNewTab: true }
  )
}

// Initialize editable content composable
const {
  isEditableEmpty,
  isSyncingFromEditable,
  saveSelection,
  restoreSelection,
  moveCaretToEnd,
  extractPlainTextFromParts,
  renderFromParts,
  insertChipAtCursor,
  insertImageAtCursor,
  insertCommandChipWithPath,
  handleEditableKeyDown,
  handleEditableInput,
  handleEditableClick
} = useEditableContent({
  editableRef,
  chatInputParts: inputParts,
  handleSendClick,
  handleAddContextClick,
  handleShowCommandPopup,
  handleChipClick,
  shouldBlockEnterSend: () => props.interactionActive
})

const resolveKbAbsPath = async (relPath: string): Promise<string> => {
  // Normalize to POSIX-style paths to match KB root format.
  const normalizedRel = relPath.replace(/\\/g, '/')
  const { root } = await window.api.kbGetRoot()
  if (!root) return ''
  const normalizedRoot = root.replace(/\\/g, '/')
  const separator = normalizedRoot.endsWith('/') ? '' : '/'
  return `${normalizedRoot}${separator}${normalizedRel}`
}

const handleEditableDrop = async (e: DragEvent) => {
  const dragPayload = parseContextDragPayload(e.dataTransfer)
  if (!dragPayload) return

  e.preventDefault()
  editableRef.value?.focus()
  saveSelection()

  if (dragPayload.contextType === 'doc') {
    const absPath = await resolveKbAbsPath(dragPayload.relPath)
    if (!absPath) return
    insertChipAtCursor('doc', { absPath, name: dragPayload.name, type: 'file' }, dragPayload.name)
    return
  }

  if (dragPayload.contextType === 'image') {
    try {
      const res = await window.api.kbReadFile(dragPayload.relPath, 'base64')
      const mediaType = getImageMediaType(dragPayload.relPath)
      insertImageAtCursor({
        type: 'image',
        mediaType,
        data: res.content
      })
    } catch (err) {
      console.error('Failed to read image file:', err)
    }
    return
  }

  if (dragPayload.contextType === 'chat') {
    insertChipAtCursor('chat', { id: dragPayload.id, title: dragPayload.title, ts: Date.now() }, dragPayload.title)
    return
  }

  onHostClick({
    label: dragPayload.label,
    value: dragPayload.uuid,
    key: dragPayload.uuid,
    uuid: dragPayload.uuid,
    connect: dragPayload.connect,
    title: dragPayload.label,
    isLocalHost: dragPayload.isLocalHost,
    type: 'personal',
    selectable: true,
    organizationUuid: dragPayload.organizationUuid,
    assetType: dragPayload.assetType,
    level: 1
  })
}

// Handle paste events for images
const handlePaste = (e: ClipboardEvent) => {
  // Check for images synchronously first to prevent default browser paste behavior
  if (hasClipboardImages(e)) {
    // Prevent default paste behavior immediately before async processing
    e.preventDefault()
    // Process images asynchronously
    handlePasteImage(e)
  }
}

watch(
  () => props.initialContentParts,
  (parts) => {
    if (props.mode !== 'edit') return
    const safeParts: ContentPart[] = parts && parts.length > 0 ? parts : [{ type: 'text', text: '' }]
    localDraftParts.value = safeParts
    renderFromParts(safeParts)
  },
  { immediate: true }
)

watch(
  () => inputParts.value,
  (parts) => {
    if (isSyncingFromEditable.value) return
    if (!editableRef.value) return
    if (!parts || parts.length === 0) {
      editableRef.value.innerHTML = ''
      return
    }
    renderFromParts(parts)
  },
  { deep: true }
)

// Synchronize the current tab's textarea ref to the global state when active
watch(
  [() => props.isActiveTab, editableRef],
  ([isActive, el], [, prevEl]) => {
    // Edit mode should not override the global textarea ref used by the bottom input.
    if (props.mode === 'edit') return
    if (isActive && el) {
      chatTextareaRef.value = el as unknown as HTMLTextAreaElement
      // Auto-focus when textarea first becomes available on active tab.
      // This handles the case where textarea is conditionally rendered via v-if="hasAvailableModels".
      // When models finish loading, hasAvailableModels becomes true and textarea renders,
      // but onMounted has already executed. This watch detects when textareaRef transitions
      // from null to a valid element and triggers focus automatically.
      if (!prevEl) {
        nextTick(() => {
          el?.focus?.()
        })
      }
    }
  },
  { immediate: true }
)

// Check if any context is selected
const hasAnyContext = computed(() => {
  return hosts.value.length > 0 || inputParts.value.some((part) => part.type === 'chip')
})

const { AgentAiModelsOptions, hasAvailableModels, handleChatAiModelChange } = useModelConfiguration()

// Use user interactions composable
const {
  fileInputRef,
  imageInputRef,
  autoSendAfterVoice,
  handleTranscriptionComplete,
  handleTranscriptionError,
  handleFileUpload,
  handleFileSelected,
  handleImageUpload,
  handleImageSelected,
  hasClipboardImages,
  handlePasteImage
} = useUserInteractions({ sendMessage: props.sendMessage, insertChipAtCursor, insertImagePart: insertImageAtCursor })
void fileInputRef
void imageInputRef

const focus = () => {
  if (props.mode === 'edit') {
    moveCaretToEnd()
    return
  }
  editableRef.value?.focus()
}

defineExpose({
  focus
})

const aiModeTooltipVisible = ref(false)
const aiModeSelectOpen = ref(false)
const handleAiModeSelectOpenChange = (open: boolean) => {
  aiModeSelectOpen.value = open
  aiModeTooltipVisible.value = false
}

const modelSelectOpen = ref(false)

watch(
  () => chatContainerScrollSignal.value,
  () => {
    aiModeSelectOpen.value = false
    modelSelectOpen.value = false
    showContextPopup.value = false
    showCommandPopup.value = false
    aiModeTooltipVisible.value = false
  }
)

const inputPlaceholder = computed(() => {
  return chatTypeValue.value === 'agent' ? t('ai.agentMessage') : chatTypeValue.value === 'chat' ? t('ai.chatMessage') : t('ai.cmdMessage')
})

// ============================================================================
// Event Handlers
// ============================================================================

onMounted(() => {
  setChipInsertHandler(insertChipAtCursor)
  setImageInsertHandler(insertImageAtCursor)
  // Set command chip insert handler with path support
  setCommandChipInsertHandler((command: string, label: string, path: string) => {
    removeTrailingSlashFromInputParts(inputParts)
    insertCommandChipWithPath(command, label, path)
  })
  if (inputParts.value.length > 0) {
    renderFromParts(inputParts.value)
  }
})

onBeforeUnmount(() => {
  setChipInsertHandler(() => {})
  setImageInsertHandler(() => {})
  setCommandChipInsertHandler(() => {})
})
</script>

<style lang="less" scoped>
.context-display-container {
  position: relative;
  background-color: transparent;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  justify-content: flex-start;
  user-select: text;
  padding: 4px 8px;
  border-radius: 8px 8px 0 0;
  max-height: 100px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) var(--bg-color-secondary);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-color-secondary);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--border-color);
    border-radius: 3px;

    &:hover {
      background-color: var(--border-color-light);
    }
  }

  :deep(.ant-tag) {
    font-size: 10px;
    padding: 0 6px;
    height: 16px;
    line-height: 16px;
    display: flex;
    align-items: center;
    margin-left: 2px;
    margin-bottom: 2px;
    vertical-align: middle;
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color) !important;
    color: var(--text-color) !important;

    .anticon-laptop {
      color: #1890ff !important;
    }

    .anticon-file-text {
      color: #52c41a !important;
    }

    .anticon-message {
      color: #722ed1 !important;
    }
  }

  .context-tag {
    position: relative;
    padding-right: 20px !important;
    height: 20px !important;
    line-height: 20px !important;
    padding-top: 2px !important;
    padding-bottom: 2px !important;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .tag-delete-btn {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 8px;
      color: var(--text-color-tertiary);
      cursor: pointer;
      padding: 1px;
      border-radius: 2px;
      transition: all 0.2s ease;

      &:hover {
        color: #ff4d4f;
        background-color: rgba(255, 77, 79, 0.1);
      }
    }
  }
}

.context-trigger-tag {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s ease;
  height: 20px;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  border: 1px solid #3a3a3a;
  user-select: none;

  &:hover {
    background-color: var(--hover-bg-color) !important;
    border-color: var(--border-color-light) !important;
  }
}

.input-send-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  // Make the input area stand out from the message list while staying theme-friendly.
  background-color: var(--bg-color-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
  width: calc(100% - 16px);
  margin: 4px 8px 8px 8px;

  &.is-edit-mode {
    margin: 0;
    width: 100%;
    box-shadow: none;
    background-color: transparent;
  }

  .theme-dark & {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }

  .theme-light & {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);

    :deep(.mention-chip) {
      background-image: none;
      border-color: var(--border-color-light);
    }
  }

  &:focus-within {
    border-color: rgba(24, 143, 255, 0.75);
  }

  .chat-editable-wrapper {
    position: relative;
    padding: 8px 12px;
  }

  .chat-editable {
    position: relative;
    min-height: 36px;
    max-height: 240px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    outline: none;
    background-color: transparent;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .chat-editable.is-empty::before {
    content: attr(data-placeholder);
    color: var(--text-color-tertiary);
    pointer-events: none;
    position: absolute;
    top: 0;
    left: 0;
  }

  :deep(.mention-chip) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    margin: 0;
    height: 18px;
    line-height: 18px;
    border-radius: 4px;
    background-color: var(--hover-bg-color);
    background-image: linear-gradient(135deg, rgba(59, 130, 246, 0.32), rgba(59, 130, 246, 0.12));
    border: 1px solid transparent;
    color: var(--text-color);
    font-size: 11px;
    user-select: none;
    vertical-align: middle;
    transform: translateY(-1px);
    cursor: pointer;
  }

  :deep(.mention-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--vscode-charts-blue);
  }

  :deep(.mention-chip-doc) .mention-icon {
    color: #52c41a;
  }

  :deep(.mention-chip-chat) .mention-icon {
    color: #52c41a;
  }

  :deep(.mention-label) {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.mention-remove) {
    cursor: pointer;
    font-size: 10px;
    color: var(--text-color-tertiary);
    padding: 0 2px;
  }

  :deep(.mention-remove:hover) {
    color: #ff4d4f;
  }

  // Image preview styles
  :deep(.image-preview-wrapper) {
    display: inline-flex;
    align-items: center;
    position: relative;
    margin: 2px 4px;
    vertical-align: middle;
  }

  :deep(.image-preview-thumbnail) {
    max-width: 120px;
    max-height: 80px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid var(--border-color);
  }

  :deep(.image-remove) {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: var(--bg-color-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-color-tertiary);
    font-size: 12px;
    line-height: 14px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :deep(.image-remove:hover) {
    color: #ff4d4f;
    border-color: #ff4d4f;
    background-color: rgba(255, 77, 79, 0.1);
  }
}

.input-controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 8px 8px;
  flex-wrap: nowrap;
  min-height: 32px;
  container-type: inline-size;
  container-name: input-controls;

  .action-buttons-container {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ant-select:first-child {
    flex-shrink: 0;
    min-width: 85px;
  }

  .model-select-responsive {
    flex-shrink: 1;
    min-width: 40px;
    max-width: 200px;

    :deep(.ant-select-selector) {
      min-width: 0;
    }

    :deep(.ant-select-selection-item) {
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      padding-right: 24px !important;
    }
  }

  @container input-controls (max-width: 260px) {
    .model-select-responsive {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .model-select-responsive {
      display: none;
    }
  }

  .ant-select {
    width: 95px;

    :deep(.ant-select-selector) {
      background-color: transparent !important;
      border: none !important;
      border-radius: 4px !important;
      color: var(--text-color) !important;
      height: 24px !important;
      line-height: 24px !important;
    }

    :deep(.ant-select-selection-item) {
      pointer-events: none;
      font-size: 12px !important;
      color: var(--text-color) !important;
    }

    :deep(.ant-select-arrow) {
      color: var(--text-color-tertiary) !important;
    }

    &:hover {
      :deep(.ant-select-selector) {
        background-color: var(--hover-bg-color) !important;
      }
    }
  }

  .action-buttons-container {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: auto;

    @media (max-width: 480px) {
      gap: 6px;
    }
  }

  .custom-round-button {
    height: 18px;
    width: 18px;
    padding: 0;
    border-radius: 4px;
    font-size: 10px;
    background-color: transparent;
    border: none;
    color: var(--text-color);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;

    &:hover {
      transform: scale(1.15);
      background-color: var(--hover-bg-color);
    }

    &:active {
      transform: scale(0.95);
      box-shadow: none;
    }

    &[disabled] {
      cursor: not-allowed;
      opacity: 0.2;
      pointer-events: none;

      &:hover {
        transform: none;
      }
    }

    .interrupt-icon {
      .theme-dark & {
        filter: invert(1) brightness(1.5);
      }
      .theme-light & {
        filter: none;
      }
    }

    .action-icon {
      .theme-dark & {
        filter: none;
      }
      .theme-light & {
        filter: brightness(0) saturate(100%);
        opacity: 0.6;
      }
    }
  }
}

.model-label {
  display: inline-flex;
  align-items: center;
}

.thinking-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
  filter: var(--icon-filter);
  transition: filter 0.2s ease;
}

.processing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.processing-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #1890ff;
  border-right-color: #40a9ff;
  border-bottom-color: #69c0ff;
  animation: processing-spin 0.8s linear infinite;
}

@keyframes processing-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.processing-text {
  font-size: 10px;
  background: linear-gradient(90deg, #1890ff, #40a9ff, #69c0ff, #1890ff);
  background-size: 300% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: processing-text-gradient 2s linear infinite;
}

@keyframes processing-text-gradient {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: 300% center;
  }
}
</style>

<style lang="less">
// Global styles for select dropdown menu
// Use specific class name to target only these dropdowns
.input-controls-select-dropdown {
  .ant-select-item,
  .ant-select-item-option {
    font-size: 12px !important;
  }
}
</style>
