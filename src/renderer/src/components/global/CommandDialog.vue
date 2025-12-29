<template>
  <div
    v-if="visible"
    ref="dialogRef"
    class="command-input-widget"
    tabindex="-1"
    :style="dialogPositionStyle"
  >
    <div
      class="widget-container"
      :style="{ width: dialogWidth + 'px' }"
    >
      <button
        class="close-button"
        :title="t('common.close')"
        @click="handleClose"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
        >
          <path
            d="M1 1L9 9M1 9L9 1"
            stroke="currentColor"
            stroke-width="1"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <div class="input-section">
        <textarea
          ref="inputRef"
          v-model="inputValue"
          :placeholder="t('commandDialog.placeholder')"
          class="command-textarea"
          rows="1"
          autofocus
          @input="handleInput"
          @keydown.enter.prevent="handleSubmit"
          @keydown="handleTextareaKeydown"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
        />
      </div>

      <div class="footer-section">
        <div
          class="loading-content"
          :class="{ visible: isLoading }"
        >
          <div class="loading-spinner"></div>
          <span class="loading-text">{{ t('commandDialog.generating') }}</span>
        </div>
        <div class="footer-controls">
          <a-select
            v-model:value="selectedCommandModel"
            size="small"
            class="command-model-selector"
            :disabled="isLoading || commandModelOptions.length === 0"
            :dropdown-match-select-width="false"
            :dropdown-style="{ width: 'auto' }"
          >
            <a-select-option
              v-for="model in commandModelOptions"
              :key="model.value"
              :value="model.value"
            >
              {{ model.label }}
            </a-select-option>
          </a-select>
          <div class="footer-hint"> <kbd>Enter</kbd> {{ t('commandDialog.submit') }} · <kbd>Esc</kbd> {{ t('common.close') }} </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import eventBus from '@/utils/eventBus'
import { useModelConfiguration } from '@/views/components/AiTab/composables/useModelConfiguration'

interface Props {
  visible: boolean
  connectionId?: string
  terminalContainer?: HTMLElement | null
}

interface Emits {
  (e: 'update:visible', visible: boolean): void
}

interface CursorPositionInfo {
  absoluteY: number | null
  cellHeight: number
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()

const { AgentAiModelsOptions, initModel } = useModelConfiguration()
const selectedCommandModel = ref<string>('')

// Filter out thinking models for command generation
const commandModelOptions = computed(() => {
  return AgentAiModelsOptions.value.filter((option) => !option.label.endsWith('-Thinking'))
})

const dialogRef = ref<HTMLDivElement>()
const dialogWidth = ref(520)
const dialogPositionStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })

const inputRef = ref<HTMLTextAreaElement>()
const inputValue = ref('')
const isLoading = ref(false)
const generatedCommand = ref('')
const error = ref('')
// Cache last injected command length for terminal deletion before next injection
const lastInjectedLength = ref(0)
// Track IME composition state
const isComposing = ref(false)

// Persist selected model to localStorage
watch(selectedCommandModel, (newValue) => {
  if (newValue) {
    localStorage.setItem('commandDialogSelectedModel', newValue)
  }
})

// Watch visibility to focus input and reposition dialog scoped to active terminal
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      nextTick(() => {
        focusDialog()
        adjustTextareaHeight()
        updateDialogPosition()
        // Reattach ResizeObserver to current terminal container
        teardownContentResizeObserver()
        setupContentResizeObserver()
      })
    } else {
      // Clean up ResizeObserver when dialog closes
      teardownContentResizeObserver()

      // Reset all states when dialog closes
      isLoading.value = false
      error.value = ''
      generatedCommand.value = ''
      inputValue.value = ''
      lastInjectedLength.value = 0
    }
  }
)

// Auto-resize textarea based on content
const adjustTextareaHeight = () => {
  if (!inputRef.value) return

  inputRef.value.style.height = 'auto'
  const scrollHeight = inputRef.value.scrollHeight

  // Set height to content height, allowing it to expand upwards
  inputRef.value.style.height = scrollHeight + 'px'
}

const handleInput = () => {
  adjustTextareaHeight()
  error.value = ''
  nextTick(() => updateDialogPosition())
}

const handleClose = () => {
  // Reset loading state when closing dialog
  isLoading.value = false
  error.value = ''
  generatedCommand.value = ''
  inputValue.value = ''
  lastInjectedLength.value = 0

  emit('update:visible', false)
  eventBus.emit('focusActiveTerminal', props.connectionId)
}

const focusDialog = () => {
  nextTick(() => {
    // Use requestAnimationFrame to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      if (inputRef.value) {
        inputRef.value.focus({ preventScroll: true })
      }
    })
  })
}

// Focus helpers for toggling between dialog and terminal
const isDialogFocused = () => {
  const activeElement = document.activeElement
  return activeElement === inputRef.value || (dialogRef.value && dialogRef.value.contains(activeElement as Node))
}

// Check if focus is in the terminal container associated with this dialog instance
const isFocusInAssociatedTerminal = () => {
  if (!props.terminalContainer) return false
  const activeElement = document.activeElement
  return props.terminalContainer.contains(activeElement as Node)
}

const toggleFocus = () => {
  const dialogHasFocus = isDialogFocused()
  if (dialogHasFocus) {
    // Switch to active terminal of current tab
    eventBus.emit('focusActiveTerminal', props.connectionId)
  } else {
    focusDialog()
  }
}

// Check whether there is a focused and visible active terminal
// Opening is handled by parent component
const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

/**
 * ESC key handler specific for the textarea input.
 * Trigger scenario: When the textarea has focus and ESC is pressed.
 * Uses stopPropagation() to prevent the event from bubbling to handlers outside handleGlobalKeyDown.
 * This handler is invoked after handleGlobalKeyDown (capture phase).
 */
const handleTextareaKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    // During composition, let IME handle ESC and prevent closing by stopping propagation only
    const compositionEvent = e as KeyboardEvent & { isComposing?: boolean }
    if (compositionEvent.isComposing || isComposing.value) {
      e.stopPropagation()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    handleClose()
  }
}

const handleSubmit = async () => {
  if (!inputValue.value.trim() || isLoading.value) return

  // Check if models are configured
  if (commandModelOptions.value.length === 0) {
    error.value = t('commandDialog.noModelsConfigured')
    return
  }

  const instruction = inputValue.value.trim()
  isLoading.value = true
  error.value = ''
  generatedCommand.value = ''
  inputValue.value = ''

  try {
    await window.api.sendToMain({
      type: 'commandGeneration',
      tabId: props.connectionId,
      instruction: instruction,
      context: await getCurrentContext(),
      modelName: selectedCommandModel.value
    })
  } catch (err) {
    console.error('Command generation failed:', err)
    error.value = err instanceof Error ? err.message : t('commandDialog.generationFailed')
    isLoading.value = false
    inputValue.value = instruction
  }
}

const getCurrentContext = async () => {
  try {
    let sshConnectId = props.connectionId

    if (!sshConnectId) {
      sshConnectId = props.terminalContainer?.getAttribute('data-ssh-connect-id') || undefined
    }

    if (!sshConnectId) {
      console.warn('No SSH connection ID found, using fallback context')
      return {
        platform: 'linux',
        shell: 'bash',
        osVersion: 'Unknown',
        hostname: 'localhost',
        username: 'user',
        homeDir: '~',
        sudoPermission: false
      }
    }

    const systemInfoResult = await window.api.getSystemInfo(sshConnectId)

    if (!systemInfoResult.success) {
      throw new Error(systemInfoResult.error || 'Failed to get system info')
    }

    return systemInfoResult.data
  } catch (error) {
    console.warn('Failed to get remote context:', error)
    return {
      platform: 'linux',
      shell: 'bash',
      osVersion: 'Unknown',
      hostname: 'localhost',
      username: 'user',
      homeDir: '~',
      sudoPermission: false
    }
  }
}

const getCursorPosition = (): Promise<CursorPositionInfo | null> => {
  return new Promise((resolve) => {
    let resolved = false
    try {
      eventBus.emit('getCursorPosition', {
        connectionId: props.connectionId,
        callback: (position: CursorPositionInfo | null) => {
          if (!resolved) {
            resolved = true
            resolve(position)
          }
        }
      })
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          resolve(null)
        }
      }, 100)
    } catch (error) {
      console.warn('Failed to get cursor position from terminal:', error)
      if (!resolved) {
        resolved = true
        resolve(null)
      }
    }
  })
}

let contentResizeObserver: ResizeObserver | null = null

const updateDialogPosition = async () => {
  if (!props.visible || !props.terminalContainer) return

  const margin = 20
  const maxWidth = 600
  const minWidth = 320
  const preferredWidth = 520

  // Use offsetWidth/offsetHeight instead of getBoundingClientRect
  // because we're now positioning absolutely relative to the container
  const containerWidth = props.terminalContainer.offsetWidth
  const containerHeight = props.terminalContainer.offsetHeight

  // Check if container is actually invisible (Tab switched, hidden Tab container has 0 width/height)
  // If invisible, skip position calculation (the dialog will be hidden automatically by container)
  if (containerWidth === 0 || containerHeight === 0) {
    return
  }

  const availableWidth = Math.max(260, containerWidth - margin * 2)
  const targetWidth = Math.min(maxWidth, Math.min(preferredWidth, availableWidth))
  dialogWidth.value = Math.max(minWidth, Math.floor(targetWidth))

  await nextTick()
  const widgetEl = dialogRef.value?.querySelector('.widget-container') as HTMLElement | undefined
  const dialogHeight = widgetEl?.offsetHeight || 0

  // Horizontal position: centered within container
  const left = Math.round((containerWidth - dialogWidth.value) / 2)

  let top: number

  // Try to get cursor position for vertical placement
  const cursorInfo = await getCursorPosition()

  if (cursorInfo && cursorInfo.absoluteY !== null) {
    // Get container's position relative to viewport
    const containerRect = props.terminalContainer.getBoundingClientRect()

    // Calculate cursor position relative to container
    const cursorYRelativeToContainer = cursorInfo.absoluteY - containerRect.top
    const spaceBelowCursor = containerHeight - (cursorYRelativeToContainer + cursorInfo.cellHeight)

    if (spaceBelowCursor >= dialogHeight + margin) {
      // Enough space below cursor, display below cursor
      top = cursorYRelativeToContainer + cursorInfo.cellHeight + margin
    } else {
      // Not enough space below cursor, display at container bottom
      top = containerHeight - dialogHeight - margin
    }
  } else {
    // Fall back: display at container bottom
    top = Math.round(containerHeight - dialogHeight - margin)
  }

  // Clamp within container bounds
  const clampedLeft = Math.max(margin, Math.min(left, containerWidth - dialogWidth.value - margin))
  const clampedTop = Math.max(margin, Math.min(top, containerHeight - dialogHeight - margin))

  dialogPositionStyle.value = { top: clampedTop + 'px', left: clampedLeft + 'px' }
}

const setupContentResizeObserver = () => {
  if (!contentResizeObserver) {
    contentResizeObserver = new ResizeObserver(() => {
      if (props.visible) {
        updateDialogPosition()
      }
    })
  }

  // Monitor terminal container if available
  if (props.terminalContainer) {
    contentResizeObserver.observe(props.terminalContainer)
  }
}

const teardownContentResizeObserver = () => {
  if (contentResizeObserver) {
    try {
      // Unobserve all previously observed elements
      if (props.terminalContainer) {
        contentResizeObserver.unobserve(props.terminalContainer)
      }
    } catch {}
  }
}

// Global keyboard handler: only close on ESC when visible
const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.visible) {
    const compositionEvent = e as KeyboardEvent & { isComposing?: boolean }
    if (compositionEvent.isComposing || isComposing.value) return
    // Only close when focus is in this dialog or its associated terminal
    const isFocusInCurrentScope = isDialogFocused() || isFocusInAssociatedTerminal()
    if (isFocusInCurrentScope) {
      e.preventDefault()
      e.stopPropagation()
      handleClose()
    }
    return
  }

  // Toggle focus with the same shortcut (Cmd/Ctrl+K) when dialog is visible
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isShortcut = isMac ? e.metaKey && e.key === 'k' : e.ctrlKey && e.key === 'k'
  if (props.visible && isShortcut) {
    // Only respond when focus is in this dialog or its associated terminal
    // This allows other split panes to handle the shortcut independently
    const isFocusInCurrentScope = isDialogFocused() || isFocusInAssociatedTerminal()
    if (isFocusInCurrentScope) {
      e.preventDefault()
      e.stopPropagation()
      nextTick(() => toggleFocus())
    }
  }
}

// Store unsubscribe function for IPC listener
let unsubscribeCommandGeneration: (() => void) | undefined

onMounted(() => {
  // Initialize model configuration
  initModel().then(() => {
    const savedModel = localStorage.getItem('commandDialogSelectedModel')
    if (savedModel && commandModelOptions.value.some((opt) => opt.value === savedModel)) {
      selectedCommandModel.value = savedModel
    } else if (commandModelOptions.value.length > 0) {
      selectedCommandModel.value = commandModelOptions.value[0].value
    }
  })

  // Directly subscribe to IPC channel instead of using eventBus
  if (window.api && window.api.onCommandGenerationResponse) {
    unsubscribeCommandGeneration = window.api.onCommandGenerationResponse(handleCommandGenerationResponse)
  }
  window.addEventListener('resize', updateDialogPosition)

  // Add global keyboard event listener
  document.addEventListener('keydown', handleGlobalKeyDown, true)
})

onUnmounted(() => {
  // Unsubscribe from IPC channel
  if (unsubscribeCommandGeneration) {
    unsubscribeCommandGeneration()
  }
  window.removeEventListener('resize', updateDialogPosition)
  document.removeEventListener('keydown', handleGlobalKeyDown, true)
  teardownContentResizeObserver()
})

const handleCommandGenerationResponse = (response: { tabId?: string; command?: string; error?: string }) => {
  const currentTabId = props.connectionId
  if (response.tabId && response.tabId !== currentTabId) {
    return
  }

  isLoading.value = false

  if (response.error) {
    error.value = response.error
  } else if (response.command && currentTabId) {
    const delData = String.fromCharCode(127)
    const payload = delData.repeat(lastInjectedLength.value) + response.command
    // console.log('Injecting command:', payload, 'to tab:', currentTabId)
    eventBus.emit('autoExecuteCode', { command: payload, tabId: currentTabId })

    lastInjectedLength.value = response.command.length
    error.value = ''
    generatedCommand.value = ''

    focusDialog()
  }
}
</script>

<style scoped lang="less">
.command-input-widget {
  position: absolute;
  z-index: 1000;
  outline: none;
  animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.widget-container {
  position: relative;
  background: var(--bg-color-secondary);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-color-light);
  border-radius: 12px;
  min-width: 280px;
  max-width: 600px;
  box-shadow: var(--box-shadow);
  color: var(--text-color);
  transition: border-color 0.2s;

  &:focus-within {
    border-color: #007aff;
    box-shadow:
      var(--box-shadow),
      0 0 0 3px rgba(0, 122, 255, 0.2);
  }
}

.close-button {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--text-color-tertiary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  z-index: 1;

  &:hover {
    background: var(--hover-bg-color);
    color: var(--text-color);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 10px;
    height: 10px;
  }
}

.input-section {
  .command-textarea {
    width: 100%;
    background: transparent;
    border: none;
    padding: 6px 40px 6px 16px;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    outline: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 24px;
    max-height: none;
    overflow: hidden;

    &::placeholder {
      color: var(--text-color-quaternary);
    }
  }
}

.footer-section {
  padding: 0 16px 6px 16px;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.footer-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.command-model-selector {
  width: auto;
  flex-shrink: 0;

  :deep(.ant-select-selector) {
    background: var(--hover-bg-color) !important;
    border-color: var(--border-color-light) !important;
    color: var(--text-color) !important;
    font-size: 12px;
    width: auto;
  }
}

.loading-content {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;

  &.visible {
    opacity: 1;
  }

  .loading-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--text-color-quinary);
    border-top-color: #007aff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    font-size: 10px;
    font-weight: normal;
    line-height: 1;
    color: var(--text-color-secondary-light);
  }
}

.footer-hint {
  font-size: 10px;
  font-weight: normal;
  line-height: 1;
  color: var(--text-color-tertiary);

  kbd {
    background: var(--hover-bg-color);
    border: 1px solid var(--border-color-light);
    border-radius: 3px;
    padding: 1px 3px;
    font-family: monospace;
    font-size: 9px;
    margin: 0 1px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
