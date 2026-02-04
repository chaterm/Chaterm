/**
 * useInteractiveInput composable
 *
 * Manages the state and handlers for interactive command execution.
 * Provides reactive state for interaction requests and handles IPC communication.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import type { InteractionRequest, InteractionResponse, InteractionType, InteractionSubmitResult } from '../../../preload/index.d'

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
  // Reactive state - single interaction state for backward compatibility
  const interactionState = ref<InteractionState>(createInitialState())

  // Cleanup functions for IPC listeners
  let cleanupFunctions: Array<() => void> = []

  /**
   * Handle interaction needed event from main process
   */
  function handleInteractionNeeded(request: InteractionRequest): void {
    console.log('[useInteractiveInput] Interaction needed:', request)

    interactionState.value = {
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
  }

  /**
   * Handle interaction closed event from main process
   */
  function handleInteractionClosed(data: { commandId: string }): void {
    console.log('[useCommandInteraction] Interaction closed:', data.commandId)

    // Clear if current interaction
    if (interactionState.value.commandId === data.commandId) {
      interactionState.value = createInitialState()
    }
  }

  /**
   * Handle interaction suppressed event from main process
   */
  function handleInteractionSuppressed(data: { commandId: string }): void {
    console.log('[useInteractiveInput] Interaction suppressed:', data.commandId)

    // Update suppressed state - keep visible to show unsuppress button
    if (interactionState.value.commandId === data.commandId) {
      interactionState.value.isSuppressed = true
    }
  }

  /**
   * Common handler for TUI state changes (tui-detected and alternate-screen-entered)
   * @param data Event data containing commandId, taskId, and message
   * @param showVisible Whether to set visible to true (for alternate screen)
   */
  function handleTuiStateChange(data: { commandId: string; taskId?: string; message: string }, showVisible: boolean): void {
    if (interactionState.value.commandId === data.commandId || !interactionState.value.commandId) {
      interactionState.value.tuiDetected = true
      interactionState.value.tuiMessage = data.message
      interactionState.value.commandId = data.commandId
      interactionState.value.taskId = data.taskId
      if (showVisible) {
        interactionState.value.visible = true
      }
    }
  }

  /**
   * Handle TUI detected event from main process
   */
  function handleTuiDetected(data: { commandId: string; taskId?: string; message: string }): void {
    console.log('[useInteractiveInput] TUI detected:', data.commandId)
    handleTuiStateChange(data, false)
  }

  /**
   * Handle alternate screen entered event from main process
   * (For TUI programs like vim, man, git log that use alternate screen buffer)
   */
  function handleAlternateScreenEntered(data: { commandId: string; taskId?: string; message: string }): void {
    console.log('[useInteractiveInput] Alternate screen entered:', data.commandId)
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

    // Clear previous error and set submitting state
    if (interactionState.value.commandId === commandId) {
      interactionState.value.errorMessage = ''
      interactionState.value.isSubmitting = true

      if (shouldCloseImmediately) {
        interactionState.value.visible = false
      }
    }

    try {
      const response: InteractionResponse = {
        commandId,
        input,
        appendNewline,
        interactionType
      }

      const result = await window.api.submitInteraction(response)
      console.log('[useInteractiveInput] Submit result:', result)

      // Update state based on result
      if (interactionState.value.commandId === commandId) {
        interactionState.value.isSubmitting = false

        if (!shouldCloseImmediately) {
          if (result.success) {
            // Hide interaction on success
            // For pager, keep visible for continuous mode unless quit
            if (input === 'q') {
              interactionState.value.visible = false
            }
            interactionState.value.errorMessage = ''
          } else {
            // Set error message for UI display
            interactionState.value.errorMessage = getErrorMessage(result.code, result.error)
          }
        }
      }

      return result
    } catch (error) {
      console.error('[useCommandInteraction] Submit error:', error)

      // Set error state
      if (interactionState.value.commandId === commandId) {
        interactionState.value.isSubmitting = false
        if (!shouldCloseImmediately) {
          interactionState.value.errorMessage = String(error)
        }
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
    if (interactionState.value.commandId === commandId) {
      interactionState.value.errorMessage = ''
    }
  }

  /**
   * Cancel interaction
   */
  async function cancelInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.cancelInteraction(commandId)
      console.log('[useCommandInteraction] Cancel result:', result)

      // Clear interaction on success
      if (result.success) {
        handleInteractionClosed({ commandId })
      }

      return result
    } catch (error) {
      console.error('[useCommandInteraction] Cancel error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Dismiss interaction (close UI but continue detection)
   */
  async function dismissInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.dismissInteraction(commandId)
      console.log('[useCommandInteraction] Dismiss result:', result)

      // Hide interaction but don't clear state completely
      if (result.success && interactionState.value.commandId === commandId) {
        interactionState.value.visible = false
      }

      return result
    } catch (error) {
      console.error('[useCommandInteraction] Dismiss error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Suppress interaction detection
   */
  async function suppressInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.suppressInteraction(commandId)
      console.log('[useCommandInteraction] Suppress result:', result)

      if (result.success) {
        handleInteractionSuppressed({ commandId })
      }

      return result
    } catch (error) {
      console.error('[useCommandInteraction] Suppress error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Resume interaction detection
   */
  async function unsuppressInteraction(commandId: string): Promise<InteractionSubmitResult> {
    try {
      const result = await window.api.unsuppressInteraction(commandId)
      console.log('[useCommandInteraction] Unsuppress result:', result)

      // Update suppressed state
      if (result.success && interactionState.value.commandId === commandId) {
        interactionState.value.isSuppressed = false
      }

      return result
    } catch (error) {
      console.error('[useCommandInteraction] Unsuppress error:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Clear TUI detected state
   */
  function clearTuiDetected(commandId: string): void {
    if (interactionState.value.commandId === commandId) {
      interactionState.value.tuiDetected = false
      interactionState.value.tuiMessage = ''
    }
  }

  /**
   * Get interaction state for a specific tab/task
   */
  function getInteractionStateForTab(tabId: string): InteractionState | undefined {
    if (!tabId) {
      return undefined
    }

    if (interactionState.value.taskId === tabId) {
      return interactionState.value
    }

    return undefined
  }

  /**
   * Check if any interaction is active
   */
  function hasActiveInteraction(): boolean {
    return interactionState.value.visible || interactionState.value.tuiDetected
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

      console.log('[useCommandInteraction] IPC listeners registered')
    }
  })

  // Cleanup on unmount
  onUnmounted(() => {
    cleanupFunctions.forEach((fn) => fn())
    cleanupFunctions = []
    console.log('[useCommandInteraction] IPC listeners cleaned up')
  })

  return {
    // State
    interactionState,

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
