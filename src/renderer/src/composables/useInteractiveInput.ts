/**
 * useInteractiveInput composable
 *
 * Manages the state and handlers for interactive command execution.
 * Provides reactive state for interaction requests and handles IPC communication.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import type { InteractionRequest, InteractionResponse, InteractionType, InteractionSubmitResult } from '../../../preload/index.d'

const logger = createRendererLogger('composable.interactiveInput')

/**
 * State for a single interaction
 */
export interface InteractionState {
  visible: boolean
  commandId: string
  /** Tab/task identifier from main process */
  taskId?: string
  interactionType: InteractionType
  promptHint: string
  options: string[]
  optionValues: string[]
  confirmValues?: {
    yes: string
    no: string
    default?: string
  }
  /** Exit key/command for the interactive program (e.g., 'q', 'quit', 'exit') */
  exitKey?: string
  /** Whether to append newline when sending exit key (default: true) */
  exitAppendNewline?: boolean
  isSuppressed: boolean
  tuiDetected: boolean
  tuiMessage: string
  /** Error state for submission failures */
  errorMessage: string
  /** Whether submission is in progress */
  isSubmitting: boolean
}

/**
 * Create initial interaction state
 */
function createInitialState(): InteractionState {
  return {
    visible: false,
    commandId: '',
    taskId: undefined,
    interactionType: 'freeform',
    promptHint: '',
    options: [],
    optionValues: [],
    confirmValues: undefined,
    exitKey: undefined,
    exitAppendNewline: undefined,
    isSuppressed: false,
    tuiDetected: false,
    tuiMessage: '',
    errorMessage: '',
    isSubmitting: false
  }
}

/**
 * useInteractiveInput composable
 */
export function useInteractiveInput() {
  // Multi-tab state: Map keyed by taskId or cmd:${commandId}
  const interactionStates = ref<Map<string, InteractionState>>(new Map())

  // Reverse index: commandId -> key in interactionStates
  const commandIdToKey = ref<Map<string, string>>(new Map())

  // Backward-compatible single state ref (returns first visible state or initial)
  const interactionState = ref<InteractionState>(createInitialState())

  // Cleanup functions for IPC listeners
  let cleanupFunctions: Array<() => void> = []

  /**
   * Resolve the state key from a request or commandId
   * Priority: taskId > existing commandIdToKey mapping > cmd:${commandId}
   */
  function resolveKey(taskId?: string, commandId?: string): string {
    if (taskId) {
      return taskId
    }
    if (commandId) {
      const existing = commandIdToKey.value.get(commandId)
      if (existing) {
        return existing
      }
      return `cmd:${commandId}`
    }
    return ''
  }

  /**
   * Update the backward-compatible interactionState ref
   * Sets it to the first visible state or initial state
   */
  function syncLegacyState(): void {
    for (const state of interactionStates.value.values()) {
      if (state.visible || state.tuiDetected) {
        interactionState.value = state
        return
      }
    }
    interactionState.value = createInitialState()
  }

  /**
   * Handle interaction needed event from main process
   */
  function handleInteractionNeeded(request: InteractionRequest): void {
    logger.info('Interaction needed', { commandId: request.commandId, type: request.interactionType })

    const key = resolveKey(request.taskId, request.commandId)
    if (!key) {
      logger.warn('Cannot resolve key for request', { commandId: request.commandId })
      return
    }

    const newState: InteractionState = {
      visible: true,
      commandId: request.commandId,
      taskId: request.taskId,
      interactionType: request.interactionType,
      promptHint: request.promptHint,
      options: request.options || [],
      optionValues: request.optionValues || [],
      confirmValues: request.confirmValues,
      exitKey: request.exitKey,
      exitAppendNewline: request.exitAppendNewline,
      isSuppressed: false,
      tuiDetected: false,
      tuiMessage: '',
      errorMessage: '',
      isSubmitting: false
    }

    interactionStates.value.set(key, newState)
    commandIdToKey.value.set(request.commandId, key)
    syncLegacyState()
  }

  /**
   * Handle interaction closed event from main process
   */
  function handleInteractionClosed(data: { commandId: string }): void {
    logger.info('Interaction closed', { commandId: data.commandId })

    const key = commandIdToKey.value.get(data.commandId)
    if (key) {
      interactionStates.value.delete(key)
      commandIdToKey.value.delete(data.commandId)
      syncLegacyState()
    }
  }

  /**
   * Handle interaction suppressed event from main process
   */
  function handleInteractionSuppressed(data: { commandId: string }): void {
    logger.info('Interaction suppressed', { commandId: data.commandId })

    const key = commandIdToKey.value.get(data.commandId)
    if (key) {
      const state = interactionStates.value.get(key)
      if (state) {
        state.isSuppressed = true
        syncLegacyState()
      }
    }
  }

  /**
   * Common handler for TUI state changes (tui-detected and alternate-screen-entered)
   * @param data Event data containing commandId, taskId, and message
   * @param showVisible Whether to set visible to true (for alternate screen)
   */
  function handleTuiStateChange(data: { commandId: string; taskId?: string; message: string }, showVisible: boolean): void {
    const key = resolveKey(data.taskId, data.commandId)
    if (!key) {
      logger.warn('Cannot resolve key for TUI state change', { commandId: data.commandId })
      return
    }

    let state = interactionStates.value.get(key)
    if (!state) {
      // Create a minimal state for TUI detection
      state = createInitialState()
      state.commandId = data.commandId
      state.taskId = data.taskId
      interactionStates.value.set(key, state)
      commandIdToKey.value.set(data.commandId, key)
    }

    state.tuiDetected = true
    state.tuiMessage = data.message
    if (showVisible) {
      state.visible = true
    }
    syncLegacyState()
  }

  /**
   * Handle TUI detected event from main process
   */
  function handleTuiDetected(data: { commandId: string; taskId?: string; message: string }): void {
    logger.info('TUI detected', { commandId: data.commandId })
    handleTuiStateChange(data, false)
  }

  /**
   * Handle alternate screen entered event from main process
   * (For TUI programs like vim, man, git log that use alternate screen buffer)
   */
  function handleAlternateScreenEntered(data: { commandId: string; taskId?: string; message: string }): void {
    logger.info('Alternate screen entered', { commandId: data.commandId })
    handleTuiStateChange(data, true)
  }

  /**
   * Submit interaction response
   */
  async function submitInteraction(
    commandId: string,
    input: string,
    appendNewline: boolean,
    interactionType: InteractionType
  ): Promise<InteractionSubmitResult> {
    const shouldCloseImmediately = interactionType !== 'pager'

    const key = commandIdToKey.value.get(commandId)
    const state = key ? interactionStates.value.get(key) : undefined

    // Clear previous error and set submitting state
    if (state) {
      state.errorMessage = ''
      state.isSubmitting = true

      if (shouldCloseImmediately) {
        state.visible = false
      }
      syncLegacyState()
    }

    try {
      const response: InteractionResponse = {
        commandId,
        input,
        appendNewline,
        interactionType
      }

      const result = await window.api.submitInteraction(response)
      logger.info('Submit result', { success: result.success, code: result.code })

      // Update state based on result
      if (state) {
        state.isSubmitting = false

        if (!shouldCloseImmediately) {
          if (result.success) {
            // Hide interaction on success
            // For pager, keep visible for continuous mode unless quit
            if (input === 'q') {
              state.visible = false
            }
            state.errorMessage = ''
          } else {
            // Set error message for UI display
            state.errorMessage = getErrorMessage(result.code, result.error)
          }
        }
        syncLegacyState()
      }

      return result
    } catch (error) {
      logger.error('Submit error', { error: error })

      // Set error state
      if (state) {
        state.isSubmitting = false
        if (!shouldCloseImmediately) {
          state.errorMessage = String(error)
        }
        syncLegacyState()
      }

      return { success: false, error: String(error) }
    }
  }

  /**
   * Get localized error message based on error code
   */
  function getErrorMessage(code?: string, fallbackError?: string): string {
    switch (code) {
      case 'timeout':
        return 'Connection timeout, please try again'
      case 'closed':
        return 'Connection closed, command may have ended'
      case 'not-writable':
        return 'Cannot send input, connection is not writable'
      case 'write-failed':
        return fallbackError || 'Failed to send input'
      default:
        return fallbackError || 'Unknown error occurred'
    }
  }

  /**
   * Clear error message
   */
  function clearError(commandId: string): void {
    const key = commandIdToKey.value.get(commandId)
    if (key) {
      const state = interactionStates.value.get(key)
      if (state) {
        state.errorMessage = ''
        syncLegacyState()
      }
    }
  }

  /**
   * Cancel interaction
   */
  async function cancelInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.cancelInteraction(commandId)
      logger.info('Cancel result', { success: result.success })

      // Clear interaction on success
      if (result.success) {
        handleInteractionClosed({ commandId })
      }

      return result
    } catch (error) {
      logger.error('Cancel error', { error: error })
      return { success: false, error: String(error) }
    }
  }

  /**
   * Dismiss interaction (close UI but continue detection)
   */
  async function dismissInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.dismissInteraction(commandId)
      logger.info('Dismiss result', { success: result.success })

      // Hide interaction but don't clear state completely
      const key = commandIdToKey.value.get(commandId)
      if (result.success && key) {
        const state = interactionStates.value.get(key)
        if (state) {
          state.visible = false
          syncLegacyState()
        }
      }

      return result
    } catch (error) {
      logger.error('Dismiss error', { error: error })
      return { success: false, error: String(error) }
    }
  }

  /**
   * Suppress interaction detection
   */
  async function suppressInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.suppressInteraction(commandId)
      logger.info('Suppress result', { success: result.success })

      if (result.success) {
        handleInteractionSuppressed({ commandId })
      }

      return result
    } catch (error) {
      logger.error('Suppress error', { error: error })
      return { success: false, error: String(error) }
    }
  }

  /**
   * Resume interaction detection
   */
  async function unsuppressInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.unsuppressInteraction(commandId)
      logger.info('Unsuppress result', { success: result.success })

      // Update suppressed state
      const key = commandIdToKey.value.get(commandId)
      if (result.success && key) {
        const state = interactionStates.value.get(key)
        if (state) {
          state.isSuppressed = false
          syncLegacyState()
        }
      }

      return result
    } catch (error) {
      logger.error('Unsuppress error', { error: error })
      return { success: false, error: String(error) }
    }
  }

  /**
   * Clear TUI detected state
   */
  function clearTuiDetected(commandId: string): void {
    const key = commandIdToKey.value.get(commandId)
    if (key) {
      const state = interactionStates.value.get(key)
      if (state) {
        state.tuiDetected = false
        state.tuiMessage = ''
        syncLegacyState()
      }
    }
  }

  /**
   * Get interaction state for a specific tab/task
   */
  function getInteractionStateForTab(tabId: string): InteractionState | undefined {
    if (!tabId) {
      return undefined
    }
    return interactionStates.value.get(tabId)
  }

  /**
   * Check if any interaction is active
   */
  function hasActiveInteraction(): boolean {
    for (const state of interactionStates.value.values()) {
      if (state.visible || state.tuiDetected) {
        return true
      }
    }
    return false
  }

  // Setup IPC listeners
  onMounted(() => {
    if (window.api) {
      // Listen for interaction needed
      const cleanupNeeded = window.api.onInteractionNeeded(handleInteractionNeeded)
      cleanupFunctions.push(cleanupNeeded)

      // Listen for interaction closed
      const cleanupClosed = window.api.onInteractionClosed(handleInteractionClosed)
      cleanupFunctions.push(cleanupClosed)

      // Listen for interaction suppressed
      const cleanupSuppressed = window.api.onInteractionSuppressed(handleInteractionSuppressed)
      cleanupFunctions.push(cleanupSuppressed)

      // Listen for TUI detected
      const cleanupTui = window.api.onTuiDetected(handleTuiDetected)
      cleanupFunctions.push(cleanupTui)

      // Listen for alternate screen entered (TUI programs like vim, man, git log)
      const cleanupAlternateScreen = window.api.onAlternateScreenEntered(handleAlternateScreenEntered)
      cleanupFunctions.push(cleanupAlternateScreen)

      logger.info('IPC listeners registered')
    }
  })

  // Cleanup on unmount
  onUnmounted(() => {
    cleanupFunctions.forEach((fn) => fn())
    cleanupFunctions = []
    logger.info('IPC listeners cleaned up')
  })

  return {
    // State (legacy single-state for backward compatibility)
    interactionState,
    // Multi-tab state map
    interactionStates,

    // Actions
    submitInteraction,
    cancelInteraction,
    dismissInteraction,
    suppressInteraction,
    unsuppressInteraction,
    clearTuiDetected,
    clearError,

    // Helpers
    getInteractionStateForTab,
    hasActiveInteraction
  }
}
