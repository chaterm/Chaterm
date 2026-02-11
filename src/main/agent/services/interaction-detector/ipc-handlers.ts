/**
 * Interactive Command IPC Handlers
 *
 * This module registers IPC handlers for interactive command execution.
 * It manages the communication between renderer and main process for
 * command interaction detection and response handling.
 *
 * Note: Command context is managed by Task class (Task.activeTasks)
 * This module only handles IPC communication and delegates to Task for context lookup.
 */

import { ipcMain, webContents } from 'electron'
import type { InteractionRequest, InteractionResponse, InteractionSubmitResult } from './types'
import { Task, type CommandContext } from '../../core/task'

import { createLogger } from '@logging'

const logger = createLogger('agent')

// Re-export CommandContext type for other modules
export type { CommandContext }

/**
 * Register a command context for interaction handling
 * Delegates to Task.registerCommandContext
 */
export function registerCommandContext(context: CommandContext): void {
  Task.registerCommandContext(context)
}

/**
 * Unregister a command context
 * Delegates to Task.unregisterCommandContext
 */
export function unregisterCommandContext(commandId: string): void {
  Task.unregisterCommandContext(commandId)
}

/**
 * Get a command context by ID
 * Delegates to Task.getCommandContext
 */
export function getCommandContext(commandId: string): CommandContext | undefined {
  return Task.getCommandContext(commandId)
}

/**
 * Generic broadcast function to send data to all windows
 */
function broadcast<T>(channel: string, data: T): void {
  for (const wc of webContents.getAllWebContents()) {
    wc.send(channel, data)
  }
  logger.info(`[InteractionIpc] Broadcasted ${channel}`, { value: typeof data === 'object' ? JSON.stringify(data).slice(0, 100) : data })
}

/**
 * Broadcast interaction request to all windows
 */
export function broadcastInteractionNeeded(request: InteractionRequest): void {
  broadcast('interaction-needed', request)
}

/**
 * Broadcast interaction closed event
 */
export function broadcastInteractionClosed(commandId: string): void {
  broadcast('interaction-closed', { commandId })
}

/**
 * Broadcast interaction suppressed event
 */
export function broadcastInteractionSuppressed(commandId: string): void {
  broadcast('interaction-suppressed', { commandId })
}

/**
 * Broadcast TUI detected event
 */
export function broadcastTuiDetected(commandId: string, message: string, taskId?: string): void {
  broadcast('tui-detected', { commandId, taskId, message })
}

/**
 * Broadcast alternate screen entered event (for TUI programs like vim, man, git log)
 */
export function broadcastAlternateScreenEntered(commandId: string, message: string, taskId?: string): void {
  broadcast('alternate-screen-entered', { commandId, taskId, message })
}

/**
 * Helper to wrap IPC handlers with command context lookup and error handling
 */
async function withCommandContext(
  commandId: string,
  actionName: string,
  operation: (context: CommandContext) => void | Promise<void>
): Promise<InteractionSubmitResult> {
  const context = Task.getCommandContext(commandId)
  if (!context) {
    return { success: false, error: 'Command context not found' }
  }

  try {
    await operation(context)
    logger.info(`[InteractionIpc] ${actionName} for command: ${commandId}`)
    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error(`[InteractionIpc] Failed to ${actionName.toLowerCase()}: ${errorMsg}`)
    return { success: false, error: errorMsg }
  }
}

/**
 * Setup IPC handlers for interactive command execution
 */
export function setupInteractionIpcHandlers(): void {
  // Submit interaction response
  ipcMain.handle('submit-interaction', async (_event, response: InteractionResponse): Promise<InteractionSubmitResult> => {
    const context = Task.getCommandContext(response.commandId)
    if (!context) {
      logger.warn('[InteractionIpc] No context found for command', { value: response.commandId })
      return { success: false, error: 'Command context not found' }
    }

    const interactionType = response.interactionType || 'freeform'
    const shouldResumeAfterSubmit = interactionType !== 'pager'

    try {
      // Build input string
      let input = response.input
      if (response.appendNewline) {
        input += '\n'
      }

      // For pager type with continuous mode, don't add newline automatically
      if (interactionType === 'pager') {
        input = response.input // Use raw input for pager controls
      }

      const result = await context.sendInput(input)

      if (shouldResumeAfterSubmit && context.onInteractionSubmitted) {
        context.onInteractionSubmitted(interactionType)
      }

      // Password type should not be logged
      if (result.success) {
        if (interactionType !== 'password') {
          logger.info('[InteractionIpc] Sent input for command', { value: response.commandId })
        } else {
          logger.info('[InteractionIpc] Sent password input for command', { value: response.commandId })
        }

        // Handle pager quit command specially
        if (interactionType === 'pager' && response.input === 'q') {
          // Quit pager - resume detection and close UI
          if (context.onResume) {
            context.onResume()
          }
          broadcastInteractionClosed(response.commandId)
        }
      }

      if (shouldResumeAfterSubmit && context.onResume) {
        context.onResume()
      }

      if (result.success) {
        return { success: true }
      }

      // Return detailed error from sendInput
      return { success: false, error: result.error, code: result.code }
    } catch (error) {
      if (shouldResumeAfterSubmit && context.onInteractionSubmitted) {
        context.onInteractionSubmitted(interactionType)
      }

      if (shouldResumeAfterSubmit && context.onResume) {
        context.onResume()
      }

      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error(`[InteractionIpc] Failed to submit interaction: ${errorMsg}`)
      return { success: false, error: errorMsg, code: 'write-failed' }
    }
  })

  // Cancel interaction (send Ctrl+C)
  ipcMain.handle('cancel-interaction', async (_event, commandId: string): Promise<InteractionSubmitResult> => {
    return withCommandContext(commandId, 'Cancelled command', async (context) => {
      if (context.cancel) {
        await context.cancel()
      } else {
        await context.sendInput('\x03')
      }
    })
  })

  // Dismiss interaction (close UI but continue detection)
  ipcMain.handle('dismiss-interaction', async (_event, commandId: string): Promise<InteractionSubmitResult> => {
    return withCommandContext(commandId, 'Dismissed interaction', (context) => {
      context.onDismiss?.()
    })
  })

  // Suppress interaction detection
  ipcMain.handle('suppress-interaction', async (_event, commandId: string): Promise<InteractionSubmitResult> => {
    return withCommandContext(commandId, 'Suppressed interaction', (context) => {
      context.onSuppress?.()
    })
  })

  // Resume interaction detection
  ipcMain.handle('unsuppress-interaction', async (_event, commandId: string): Promise<InteractionSubmitResult> => {
    return withCommandContext(commandId, 'Unsuppressed interaction', (context) => {
      context.onUnsuppress?.()
    })
  })

  logger.info('[InteractionIpc] IPC handlers registered')
}

/**
 * Generate unique command ID
 */
export function generateCommandId(taskId: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `cmd_${taskId}_${timestamp}_${random}`
}
