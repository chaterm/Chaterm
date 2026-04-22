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
            v-if="chatTypeValue === 'agent'"
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
            class="ai-mode-select"
            :style="{ width: `${modeSelectWidthPx}px` }"
            :options="AiTypeOptions"
            data-testid="ai-mode-select"
            :dropdown-match-select-width="false"
            :dropdown-style="modeDropdownStyle"
            popup-class-name="input-controls-select-dropdown input-controls-mode-dropdown"
            @dropdown-visible-change="handleAiModeSelectOpenChange"
            @keydown.esc.stop
          ></a-select>
        </a-tooltip>
        <a-select
          v-model:value="chatAiModelValue"
          v-model:open="modelSelectOpen"
          size="small"
          class="model-select-responsive"
          :style="{ width: `${modelSelectWidthPx}px` }"
          show-search
          :dropdown-match-select-width="false"
          :dropdown-style="modelDropdownStyle"
          popup-class-name="input-controls-select-dropdown input-controls-model-dropdown"
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
          <a-select-option
            v-for="name in lockedModels"
            :key="'locked-' + name"
            :value="name"
            disabled
            class="locked-model-option"
          >
            <a-tooltip
              :title="lockedModelTooltip"
              placement="left"
              overlay-class-name="locked-model-tooltip"
            >
              <span class="model-label locked-label">
                <LockOutlined class="locked-model-icon" />
                {{ name }}
                <span
                  v-if="showLockedModelUpgradeTag"
                  class="locked-vip-tag"
                  >VIP</span
                >
              </span>
            </a-tooltip>
          </a-select-option>
        </a-select>
        <div class="action-buttons-container">
          <a-tooltip
            v-if="contextUsage.contextWindow > 0"
            :title="contextUsageTooltip"
            placement="top"
          >
            <div class="context-usage-ring">
              <svg
                width="14"
                height="14"
                viewBox="0 0 22 22"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="9"
                  fill="none"
                  :stroke="contextUsageTrackColor"
                  stroke-width="2.5"
                />
                <circle
                  cx="11"
                  cy="11"
                  r="9"
                  fill="none"
                  :stroke="contextUsageColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  :stroke-dasharray="`${contextUsage.percent * 0.5655} 56.55`"
                  transform="rotate(-90 11 11)"
                />
              </svg>
            </div>
          </a-tooltip>
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
          <a-tooltip
            v-if="showVoiceInput"
            :title="$t('ai.startVoiceInput')"
          >
            <VoiceInput
              :disabled="responseLoading"
              :auto-send-after-voice="autoSendAfterVoice"
              @transcription-complete="handleTranscriptionComplete"
              @transcription-error="handleTranscriptionError"
            />
          </a-tooltip>

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
        </div>
      </div>
    </div>
  </div>
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
import type { CSSProperties } from 'vue'
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
import type { ChatermApiReqInfo, ChatermMessage as StateChatermMessage } from '@shared/ExtensionMessage'
import type { ContentPart, ContextDocRef, ContextPastChatRef, ContextCommandRef, ContextSkillRef } from '@shared/WebviewMessage'
import type { HistoryItem, Host } from '../types'
import { CloseOutlined, LaptopOutlined, LockOutlined } from '@ant-design/icons-vue'
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
  onConfirmEdit?: (contentParts: ContentPart[], hosts: Host[]) => void
  openHistoryTab?: (history: HistoryItem, options?: { forceNewTab?: boolean }) => Promise<void>
  messageHosts?: Host[]
}
const logger = createRendererLogger('ai.inputSend')

const props = withDefaults(defineProps<Props>(), {
  sendMessage: async () => {},
  handleInterrupt: () => {},
  interruptAndSendIfBusy: undefined,
  interactionActive: false,
  mode: 'create',
  initialContentParts: () => [],
  onConfirmEdit: () => {},
  messageHosts: () => []
})

const { t } = useI18n()

const parseDeployStatus = (raw: unknown): number => {
  if (typeof raw !== 'string') return 0
  const normalized = raw.trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}
const deployStatus = parseDeployStatus(import.meta.env.RENDERER_DEPLOY_STATUS)
const showVoiceInput = deployStatus === 0

const {
  chatTextareaRef,
  currentTab,
  currentChatId,
  chatTypeValue,
  chatAiModelValue,
  chatContainerScrollSignal,
  hosts: sessionHosts,
  chatInputParts,
  responseLoading
} = useSessionState()

const parseApiReqInfo = (value: unknown): ChatermApiReqInfo | null => {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as ChatermApiReqInfo
    } catch {
      return null
    }
  }
  if (typeof value === 'object') {
    return value as ChatermApiReqInfo
  }
  return null
}

const resolveContextUsageFromMessages = (messages: Array<{ say?: string; text?: unknown; content?: unknown }>) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]

    // if (msg.say === 'context_truncated') {
    //   return null
    // }

    if (msg.say !== 'api_req_started') continue
    const info = parseApiReqInfo(msg.text ?? msg.content)
    if (!info || !info.contextWindow) continue
    const hasUsageData =
      info.tokensIn !== undefined || info.tokensOut !== undefined || info.cacheWrites !== undefined || info.cacheReads !== undefined
    if (!hasUsageData) continue
    const used = (info.tokensIn || 0) + (info.tokensOut || 0) + (info.cacheWrites || 0) + (info.cacheReads || 0)
    return {
      used,
      contextWindow: info.contextWindow,
      percent: Math.min(100, Math.round((used / info.contextWindow) * 100))
    }
  }
  return null
}

// Context usage computed from latest api_req_started message.
// Use the cached lastStateChatermMessages which persists across partialMessage updates,
// then try current state, and finally fallback to chatHistory.
const contextUsage = computed(() => {
  // Prefer cached state chatermMessages (stable across partialMessage overwrites)
  const cachedMessages = (currentTab.value?.session.lastStateChatermMessages ?? []) as StateChatermMessage[]
  const cachedUsage = resolveContextUsageFromMessages(cachedMessages)
  if (cachedUsage) return cachedUsage

  // Try current lastStreamMessage state (for initial load before any state is cached)
  const stateMessages = (currentTab.value?.session.lastStreamMessage?.state?.chatermMessages ?? []) as StateChatermMessage[]
  const stateUsage = resolveContextUsageFromMessages(stateMessages)
  if (stateUsage) return stateUsage

  // Fallback to local chat history (restored tabs)
  const history = currentTab.value?.session.chatHistory ?? []
  const historyUsage = resolveContextUsageFromMessages(history)
  if (historyUsage) return historyUsage

  return { used: 0, contextWindow: 0, percent: 0 }
})

const contextUsageColor = computed(() => {
  const p = contextUsage.value.percent
  if (p >= 90) return '#ef4444'
  if (p >= 70) return '#f59e0b'
  return '#3b82f6'
})

const contextUsageTrackColor = computed(() => {
  return 'rgba(128, 128, 128, 0.2)'
})

const contextUsageTooltip = computed(() => {
  const { used, contextWindow, percent } = contextUsage.value
  const formatK = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return `${n}`
  }
  return `${percent}% - ${formatK(used)} / ${formatK(contextWindow)} context used`
})

// Local hosts state for edit mode
const localEditHosts = ref<Host[]>([])

// Initialize localEditHosts when entering edit mode
watch(
  () => [props.mode, props.messageHosts],
  () => {
    if (props.mode === 'edit') {
      localEditHosts.value = props.messageHosts || []
    }
  },
  { immediate: true }
)

// Compute the hosts to display based on mode
// - In edit mode: display the local editable hosts (localEditHosts)
// - In create mode: display the current session hosts (sessionHosts from useSessionState)
// This computed is both readable and writable (like inputParts)
const hosts = computed<Host[]>({
  get: () => (props.mode === 'edit' ? localEditHosts.value : sessionHosts.value),
  set: (newHosts) => {
    if (props.mode === 'edit') {
      localEditHosts.value = newHosts
      return
    }
    sessionHosts.value = newHosts
  }
})

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
// Pass hosts (writable computed) so host operations work correctly in both modes.
const context = useContext({
  chatInputParts: inputParts,
  focusInput: () => {
    editableRef.value?.focus()
    restoreSelection()
  },
  mode: props.mode,
  hosts: hosts
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
    // Pass the complete Host objects (not just host strings) along with contentParts
    props.onConfirmEdit?.(inputParts.value, hosts.value)
  } else {
    // Create mode: original logic
    props.sendMessage(type)
  }
}

const handleChipClick = async (
  chipType: 'doc' | 'chat' | 'command' | 'skill',
  ref: ContextDocRef | ContextPastChatRef | ContextCommandRef | ContextSkillRef
) => {
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
  if (chipType === 'skill') {
    // No special action for skill chip click
    return
  }
  const chatRef = ref as ContextPastChatRef
  if (!props.openHistoryTab) return
  await props.openHistoryTab(
    {
      id: chatRef.taskId,
      chatTitle: chatRef.title || 'New Chat',
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
  insertSkillChip,
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
      logger.error('Failed to read image file:', { error: err })
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

const insertPlainTextAtCursor = (text: string) => {
  if (!editableRef.value) return

  editableRef.value.focus()
  restoreSelection()

  const selection = window.getSelection()
  if (!selection) return

  let range: Range | null = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  if (!range || !editableRef.value.contains(range.startContainer)) {
    moveCaretToEnd()
    range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  }
  if (!range) return

  const fragment = document.createDocumentFragment()
  const normalizedText = text.replace(/\r\n/g, '\n')
  const lines = normalizedText.split('\n')
  lines.forEach((line, index) => {
    fragment.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) {
      fragment.appendChild(document.createElement('br'))
    }
  })

  const caretMarker = document.createTextNode('')
  fragment.appendChild(caretMarker)

  range.deleteContents()
  range.insertNode(fragment)

  const newRange = document.createRange()
  newRange.setStart(caretMarker, 0)
  newRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(newRange)
  caretMarker.remove()

  saveSelection()
  handleEditableInput()
}

// Handle paste events:
// - Keep image paste in the dedicated image pipeline.
// - Force non-image paste to plain text to strip formatting.
const handlePaste = (e: ClipboardEvent) => {
  if (hasClipboardImages(e)) {
    e.preventDefault()
    handlePasteImage(e)
    return
  }

  // Always prevent default before inserting to block browser rich-text paste.
  e.preventDefault()
  const plainText = e.clipboardData?.getData('text/plain') ?? ''
  insertPlainTextAtCursor(plainText)
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

const { AgentAiModelsOptions, lockedModels, budgetResetAt, showLockedModelUpgradeTag, hasAvailableModels, handleChatAiModelChange } =
  useModelConfiguration()

/** Horizontal padding, arrow, and borders for Ant Design small Select (matches ~12px label). */
const SELECT_CHROME_PX = 48
/** Extra width when the Thinking icon is shown in the selector (icon + margin). */
const THINKING_ICON_SELECT_EXTRA_PX = 22
/** Padding, scrollbars, and option chrome for dropdown list rows (beyond label text). */
const DROPDOWN_ROW_CHROME_PX = 52
/** Lock icon + margin in locked-model dropdown rows. */
const LOCK_ROW_ICON_EXTRA_PX = 22
/** VIP tag width when shown in locked rows. */
const VIP_TAG_ROW_EXTRA_PX = 36

function measureUiTextWidthPx(text: string): number {
  if (!text) return 0
  if (typeof document === 'undefined') return text.length * 7
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length * 7
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
  return ctx.measureText(text).width
}

const modeSelectWidthPx = computed(() => {
  const opt = AiTypeOptions.find((o) => o.value === chatTypeValue.value)
  const label = opt?.label ?? ''
  const w = Math.ceil(measureUiTextWidthPx(label)) + SELECT_CHROME_PX
  return Math.min(Math.max(w, 72), 160)
})

const modelSelectWidthPx = computed(() => {
  const v = chatAiModelValue.value
  const opt = AgentAiModelsOptions.value.find((m) => m.value === v)
  const raw = opt?.label ?? String(v ?? '')
  const display = raw.replace(/-Thinking$/, '')
  const thinkingExtra = raw.endsWith('-Thinking') ? THINKING_ICON_SELECT_EXTRA_PX : 0
  const w = Math.ceil(measureUiTextWidthPx(display)) + SELECT_CHROME_PX + thinkingExtra
  return Math.min(Math.max(w, 88), 360)
})

const modeDropdownListWidthPx = computed(() => {
  let max = 0
  for (const o of AiTypeOptions) {
    const w = Math.ceil(measureUiTextWidthPx(o.label ?? '')) + DROPDOWN_ROW_CHROME_PX
    max = Math.max(max, w)
  }
  return Math.min(Math.max(max, 96), 400)
})

const modelDropdownListWidthPx = computed(() => {
  let max = 0
  for (const model of AgentAiModelsOptions.value) {
    const raw = model.label
    const display = raw.replace(/-Thinking$/, '')
    const thinkingExtra = raw.endsWith('-Thinking') ? THINKING_ICON_SELECT_EXTRA_PX : 0
    const w = Math.ceil(measureUiTextWidthPx(display)) + DROPDOWN_ROW_CHROME_PX + thinkingExtra
    max = Math.max(max, w)
  }
  const vipExtra = showLockedModelUpgradeTag.value ? VIP_TAG_ROW_EXTRA_PX : 0
  for (const name of lockedModels.value) {
    const w = Math.ceil(measureUiTextWidthPx(name)) + DROPDOWN_ROW_CHROME_PX + LOCK_ROW_ICON_EXTRA_PX + vipExtra
    max = Math.max(max, w)
  }
  return Math.min(Math.max(max, 120), 720)
})

const modeDropdownStyle = computed((): CSSProperties => {
  const w = modeDropdownListWidthPx.value
  return {
    minWidth: `${w}px`,
    width: `${w}px`,
    maxWidth: 'min(92vw, 400px)'
  }
})

const modelDropdownStyle = computed((): CSSProperties => {
  const w = modelDropdownListWidthPx.value
  return {
    minWidth: `${w}px`,
    width: `${w}px`,
    maxWidth: 'min(92vw, 720px)'
  }
})

const lockedModelTooltip = computed(() => {
  if (showLockedModelUpgradeTag.value) {
    return t('user.modelLocked', { tier: 'VIP' })
  }
  const date = budgetResetAt.value
  if (date && date.length >= 10) {
    return t('user.modelLockedQuotaResetsAt', { date: date.slice(0, 10) })
  }
  return t('user.modelLockedQuotaExhausted')
})

// Use user interactions composable
const {
  imageInputRef,
  autoSendAfterVoice,
  handleTranscriptionComplete,
  handleTranscriptionError,
  handleFileUpload,
  handleImageUpload,
  handleImageSelected,
  hasClipboardImages,
  handlePasteImage
} = useUserInteractions({
  sendMessage: props.sendMessage,
  insertChipAtCursor,
  insertImagePart: insertImageAtCursor,
  getTaskId: () => currentChatId.value
})
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
  // return chatTypeValue.value === 'agent' ? t('ai.agentMessage') : chatTypeValue.value === 'chat' ? t('ai.chatMessage') : t('ai.cmdMessage')
  return chatTypeValue.value === 'agent' ? t('ai.agentMessage') : t('ai.cmdMessage')
})

// ============================================================================
// Event Handlers
// ============================================================================

onMounted(() => {
  setChipInsertHandler((chipType, ref, label) => {
    if (chipType === 'skill') {
      insertSkillChip(ref as ContextSkillRef, label)
    } else {
      insertChipAtCursor(chipType, ref as any, label)
    }
  })
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

  :deep(.mention-icon-svg) {
    filter: var(--icon-filter);
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
    min-width: 72px;
  }

  .model-select-responsive {
    flex-shrink: 1;
    min-width: 40px;
    max-width: 360px;

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

  .ant-select {
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

  .context-usage-ring {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    opacity: 0.7;
    transition: opacity 0.2s;

    &:hover {
      opacity: 1;
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

.locked-label {
  opacity: 0.7;
}

.locked-model-icon {
  margin-right: 6px;
  font-size: 10px;
  color: var(--text-color-tertiary, #8c8c8c);
}

.locked-vip-tag {
  margin-left: 6px;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background-color: rgba(42, 130, 228, 0.15);
  color: #1890ff;
  font-weight: 600;
  line-height: 16px;
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
    white-space: nowrap !important;
  }

  .ant-select-item-option-content {
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: nowrap !important;
  }
}

// Locked model tooltip - match dropdown dark theme
.locked-model-tooltip {
  .ant-tooltip-inner {
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color) !important;
    color: var(--text-color) !important;
    border-radius: 4px;
    box-shadow: var(--box-shadow);
    white-space: pre-line;
  }
  .ant-tooltip-arrow::before {
    background: var(--bg-color-secondary) !important;
    border-color: var(--border-color) !important;
  }
}
</style>
