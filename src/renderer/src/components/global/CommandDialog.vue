<template>
  <div
    v-if="visible"
    ref="dialogRef"
    class="command-input-widget"
    tabindex="-1"
    :style="dialogPositionStyle"
    @keydown="handleKeyDown"
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
        <div class="footer-hint"> <kbd>Enter</kbd> {{ t('commandDialog.submit') }} · <kbd>Esc</kbd> {{ t('common.close') }} </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import eventBus from '@/utils/eventBus'

interface Props {
  visible: boolean
  connectionId?: string
}

interface Emits {
  (e: 'update:visible', visible: boolean): void
}

interface CursorPositionInfo {
  logicalX: number
  logicalY: number
  screenX: number
  screenY: number
  pixelX: number
  pixelY: number
  absoluteX: number | null
  absoluteY: number | null
  cellHeight: number
  cellWidth: number
  terminalRect: {
    left: number
    top: number
    width: number
    height: number
  } | null
  currentLineContent: string
  isCrossRow: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()

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

// Store terminal info before dialog opens
let lastActiveTerminalInfo: { element: HTMLElement; container: HTMLElement } | null = null

// Watch visibility to focus input and reposition dialog scoped to active terminal
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      nextTick(() => {
        // Capture current active terminal for positioning
        storeActiveTerminalInfo()
        focusDialog()
        startFocusEnforcer()
        adjustTextareaHeight()
        updateDialogPosition()
        // Reattach ResizeObserver to current terminal container
        teardownContentResizeObserver()
        setupContentResizeObserver()
      })
    } else {
      // Clean up ResizeObserver when dialog closes
      teardownContentResizeObserver()
      stopFocusEnforcer()

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

const handleKeyDown = (e: KeyboardEvent) => {
  // Ignore ESC during IME composition so it only dismisses candidates
  const compositionEvent = e as KeyboardEvent & { isComposing?: boolean }
  if (compositionEvent.isComposing || isComposing.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    handleClose()
  }
}

const handleClose = () => {
  // Reset loading state when closing dialog
  isLoading.value = false
  error.value = ''
  generatedCommand.value = ''
  inputValue.value = ''
  lastInjectedLength.value = 0

  emit('update:visible', false)
  eventBus.emit('focusActiveTerminal')
}

// Focus management functions
const focusDialog = () => {
  nextTick(() => {
    if (inputRef.value) {
      // Ensure focus moves to dialog input on open
      inputRef.value.focus({ preventScroll: true })
      // Ensure the input is selected and ready for input
      inputRef.value.select()
    }
  })
}

// Enforce focus briefly after opening to prevent other components from stealing it
let focusEnforcerTimer: number | null = null
const stopFocusEnforcer = () => {
  if (focusEnforcerTimer !== null) {
    clearTimeout(focusEnforcerTimer)
    focusEnforcerTimer = null
  }
}

const startFocusEnforcer = () => {
  stopFocusEnforcer()
  let attempts = 0
  const enforce = () => {
    if (!props.visible) return stopFocusEnforcer()
    if (!isDialogFocused()) {
      if (inputRef.value) {
        inputRef.value.focus({ preventScroll: true })
        inputRef.value.select()
      }
    }
    attempts += 1
    if (attempts < 10) {
      focusEnforcerTimer = window.setTimeout(enforce, 30)
    } else {
      stopFocusEnforcer()
    }
  }
  enforce()
}

// Focus helpers for toggling between dialog and terminal
const isDialogFocused = () => {
  const activeElement = document.activeElement
  return activeElement === inputRef.value || (dialogRef.value && dialogRef.value.contains(activeElement as Node))
}

const toggleFocus = () => {
  const dialogHasFocus = isDialogFocused()
  if (dialogHasFocus) {
    // Switch to active terminal of current tab
    eventBus.emit('focusActiveTerminal')
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
      context: await getCurrentContext()
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

    // If no connectionId is provided, try to get the currently active terminal container
    if (!sshConnectId) {
      const activeTerminalContainer = getActiveTerminalContainer()
      sshConnectId = activeTerminalContainer?.getAttribute('data-ssh-connect-id') || undefined
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

const getCurrentTerminalContainer = () => {
  try {
    let termContainer: HTMLElement | null = null

    if (lastActiveTerminalInfo) {
      termContainer = lastActiveTerminalInfo.container
    }

    if (!termContainer) {
      const terminalContainers = document.querySelectorAll('.terminal-container')
      for (const container of terminalContainers) {
        const containerEl = container as HTMLElement
        const rect = containerEl.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          termContainer = containerEl
          break
        }
      }
    }

    if (!termContainer) {
      return null
    }

    return termContainer.getBoundingClientRect()
  } catch (error) {
    console.warn('Failed to get terminal container:', error)
    return null
  }
}

const getCursorPosition = (): Promise<CursorPositionInfo | null> => {
  return new Promise((resolve) => {
    try {
      const activeContainer = getActiveTerminalContainer()
      if (activeContainer) {
        // Only emit callback; active instance will decide whether to respond
        eventBus.emit('getCursorPosition', (position: CursorPositionInfo | null) => {
          // console.log('Received cursor position:', position)
          resolve(position)
        })
        return
      }

      console.warn('No active terminal connection found')
      resolve(null)
    } catch (error) {
      console.warn('Failed to get cursor position from terminal:', error)
      resolve(null)
    }
  })
}

/**
 * Get the current active terminal container
 * @returns {HTMLElement|null} Active terminal container element
 */
const getActiveTerminalContainer = (): HTMLElement | null => {
  // Get from stored active terminal info first
  if (lastActiveTerminalInfo?.container) {
    const rect = lastActiveTerminalInfo.container.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return lastActiveTerminalInfo.container
    }
  }

  // Find all visible terminal containers
  const terminalContainers = document.querySelectorAll('.terminal-container[data-ssh-connect-id]')
  for (const container of terminalContainers) {
    const containerEl = container as HTMLElement
    const rect = containerEl.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return containerEl
    }
  }

  return null
}

let contentResizeObserver: ResizeObserver | null = null
const getTerminalContentElement = (): HTMLElement | null => {
  const mainArea = document.querySelector('.main-terminal-area') as HTMLElement | null
  if (mainArea) return mainArea
  const termContent = document.querySelector('.term_content') as HTMLElement | null
  if (termContent) return termContent
  return null
}

const updateDialogPosition = async () => {
  if (!props.visible) return

  const margin = 20
  const maxWidth = 600
  const minWidth = 320
  const preferredWidth = 520

  // Try to get cursor position information
  const cursorInfo = await getCursorPosition()
  const terminalRect = getCurrentTerminalContainer()
  const fallbackRect = getTerminalContentElement()?.getBoundingClientRect() || new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  const containerRect = terminalRect || fallbackRect

  const availableWidth = Math.max(260, containerRect.width - margin * 2)
  const targetWidth = Math.min(maxWidth, Math.min(preferredWidth, availableWidth))
  dialogWidth.value = Math.max(minWidth, Math.floor(targetWidth))

  await nextTick()
  const widgetEl = dialogRef.value?.querySelector('.widget-container') as HTMLElement | undefined
  const dialogHeight = widgetEl?.offsetHeight || 0

  let left: number
  let top: number

  // Horizontal position: always keep centered in terminal container
  left = Math.round(containerRect.left + (containerRect.width - dialogWidth.value) / 2)

  if (cursorInfo && cursorInfo.absoluteY !== null) {
    // console.log('Using cursor position to position dialog:', cursorInfo)

    // Vertical position: below the line where cursor is located
    const cursorY = cursorInfo.absoluteY
    const spaceBelowCursor = containerRect.bottom - (cursorY + cursorInfo.cellHeight)

    if (spaceBelowCursor >= dialogHeight + margin) {
      // Enough space below cursor, display below cursor
      top = cursorY + cursorInfo.cellHeight + margin
    } else {
      // Not enough space below cursor, display at terminal bottom
      top = containerRect.bottom - dialogHeight - margin
    }
  } else {
    // Fall back to original logic: display centered at terminal bottom
    console.log('Using default position to position dialog')
    top = Math.round(containerRect.bottom - dialogHeight - margin)
  }

  const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - dialogWidth.value - margin))
  const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - dialogHeight - margin))

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
  if (lastActiveTerminalInfo?.container) {
    contentResizeObserver.observe(lastActiveTerminalInfo.container)
  }

  // Also monitor main content area as fallback
  const contentEl = getTerminalContentElement()
  if (contentEl) {
    contentResizeObserver.observe(contentEl)
  }
}

const teardownContentResizeObserver = () => {
  if (contentResizeObserver) {
    try {
      // Unobserve all previously observed elements
      if (lastActiveTerminalInfo?.container) {
        contentResizeObserver.unobserve(lastActiveTerminalInfo.container)
      }
      const contentEl = getTerminalContentElement()
      if (contentEl) {
        contentResizeObserver.unobserve(contentEl)
      }
    } catch {}
  }
}

const storeActiveTerminalInfo = () => {
  try {
    const activeElement = document.activeElement
    let termContainer = activeElement?.closest('.terminal-container') as HTMLElement | null

    if (!termContainer) {
      const terminalContainers = document.querySelectorAll('.terminal-container')
      for (const container of terminalContainers) {
        const containerEl = container as HTMLElement
        const rect = containerEl.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          termContainer = containerEl
          break
        }
      }
    }

    if (termContainer) {
      const activeTerminalEl = termContainer.querySelector('.xterm-screen') as HTMLElement | null
      if (activeTerminalEl) {
        lastActiveTerminalInfo = {
          element: activeTerminalEl,
          container: termContainer
        }
      }
    }
  } catch (error) {
    console.warn('Failed to store terminal info:', error)
  }
}

// Global keyboard handler: only close on ESC when visible
const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.visible) {
    const compositionEvent = e as KeyboardEvent & { isComposing?: boolean }
    if (compositionEvent.isComposing || isComposing.value) return
    e.preventDefault()
    e.stopPropagation()
    handleClose()
    return
  }

  // Toggle focus with the same shortcut (Cmd/Ctrl+K) when dialog is visible
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isShortcut = isMac ? e.metaKey && e.key === 'k' : e.ctrlKey && e.key === 'k'
  if (props.visible && isShortcut) {
    e.preventDefault()
    e.stopPropagation()
    nextTick(() => toggleFocus())
  }
}

onMounted(() => {
  eventBus.on('commandGenerationResponse', handleCommandGenerationResponse)
  window.addEventListener('resize', updateDialogPosition)

  // Add global keyboard event listener
  document.addEventListener('keydown', handleGlobalKeyDown, true)
})

onUnmounted(() => {
  eventBus.off('commandGenerationResponse')
  window.removeEventListener('resize', updateDialogPosition)
  document.removeEventListener('keydown', handleGlobalKeyDown, true)
  teardownContentResizeObserver()
  stopFocusEnforcer()
})

const handleCommandGenerationResponse = (response: { tabId?: string; command?: string; error?: string }) => {
  const currentTabId = props.connectionId
  if (response.tabId && response.tabId !== currentTabId) {
    return
  }

  isLoading.value = false

  if (response.error) {
    error.value = response.error
  } else if (response.command) {
    const delData = String.fromCharCode(127)
    const payload = delData.repeat(lastInjectedLength.value) + response.command
    console.log('Injecting command:', payload)
    eventBus.emit('autoExecuteCode', payload)

    lastInjectedLength.value = response.command.length
    error.value = ''
    generatedCommand.value = ''

    focusDialog()
  }
}
</script>

<style scoped lang="less">
.command-input-widget {
  position: fixed;
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
