//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { BrownEventEmitter } from './event'
import { remoteSshConnect, remoteSshExecStream, remoteSshDisconnect } from '../../../ssh/agentHandle'
import { handleJumpServerConnection, jumpserverShellStreams } from './jumpserverHandle'
import { capabilityRegistry, BastionErrorCode } from '../../../ssh/capabilityRegistry'
import { runMarkerBasedCommand, type MarkerStream } from './marker-based-runner'

// Static imports for interaction detection (required for Vite bundling)
import {
  InteractionDetector,
  type InteractionDetectorConfig,
  type InteractionResult,
  type InteractionRequest
} from '../../services/interaction-detector'
import type { SendInputResult } from '../../services/interaction-detector/types'
import {
  registerCommandContext,
  unregisterCommandContext,
  broadcastInteractionNeeded,
  broadcastInteractionSuppressed,
  broadcastInteractionClosed,
  broadcastTuiDetected,
  broadcastAlternateScreenEntered,
  generateCommandId
} from '../../services/interaction-detector/ipc-handlers'

const { app } = require('electron')
import { webContents } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import path from 'path'
import fs from 'fs'

const appPath = app.getAppPath()
const packagePath = path.join(appPath, 'package.json')

// Try to read package.json from appPath first, fallback to __dirname if not exists
let packageInfo
try {
  if (fs.existsSync(packagePath)) {
    packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } else {
    const fallbackPath = path.join(__dirname, '../../package.json')
    packageInfo = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'))
  }
} catch (error) {
  console.error('Failed to read package.json:', error)
  // Provide a default packageInfo object if both paths fail
  packageInfo = { name: 'chaterm', version: 'unknown' }
}

export interface RemoteTerminalProcessEvents extends Record<string, any[]> {
  line: [line: string]
  continue: []
  completed: []
  error: [error: Error]
  no_shell_integration: []
  // Interaction detection events
  'interaction-needed': [request: InteractionRequest]
  'interaction-suppressed': [data: { commandId: string }]
  'tui-detected': [data: { commandId: string; taskId?: string; message: string }]
}

export interface ConnectionInfo {
  id?: string
  host?: string
  hostname?: string
  port?: number
  username?: string
  comment?: string
  assetUuid?: string
  /**
   * Password for authentication. If both password and privateKey are provided,
   * privateKey takes precedence over password.
   */
  password?: string
  /**
   * Private key for authentication. Takes precedence over password if both are provided.
   */
  privateKey?: string
  passphrase?: string
  asset_ip?: string
  targetIp?: string
  /**
   TargetHostname for complete target information is provided for use by the bastion host plugin
  */
  targetHostname?: string
  asset_type?: string
  sshType?: string
  needProxy: boolean
  proxyName?: string
  ident?: string
  proxyCommand?: string
}

export interface RemoteTerminalInfo {
  id: number
  sessionId: string
  busy: boolean
  lastCommand: string
  connectionInfo: ConnectionInfo
  terminal: {
    show: () => void
  }
}

// ============================================================================
// Shared utilities for marker-based command execution (JumpServer & Bastion)
// ============================================================================

/**
 * Clean working directory path by removing ANSI sequences and terminal prompts
 */
function cleanWorkingDirectory(cwd: string | undefined, logPrefix: string): string | undefined {
  if (!cwd) return undefined

  const cleanCwd = cwd
    // Remove ANSI escape sequences
    .replace(/\x1B\[[0-9;]*[JKmsu]/g, '')
    .replace(/\x1B\[[?][0-9]*[hl]/g, '')
    .replace(/\x1B\[K/g, '')
    .replace(/\x1B\[[0-9]+[ABCD]/g, '')
    // Remove terminal prompt patterns (like: [user@host dir]$ or user@host:dir$)
    .replace(/\[[^\]]*\]\$.*$/g, '')
    .replace(/[^@]*@[^:]*:[^$]*\$.*$/g, '')
    .replace(/.*\$.*$/g, '')
    // Remove carriage returns, line feeds and other control characters
    .replace(/[\r\n\x00-\x1F\x7F]/g, '')
    .trim()

  // Validate if path is valid (should be absolute path or relative path)
  if (cleanCwd && !cleanCwd.match(/^[\/~]|^[a-zA-Z0-9_\-\.\/]+$/)) {
    console.log(`[${logPrefix}] Invalid working directory path, ignoring: "${cleanCwd}"`)
    return undefined
  }

  if (cwd && cleanCwd) {
    console.log(`[${logPrefix}] Original path: "${cwd}" -> Cleaned: "${cleanCwd}"`)
  } else if (cwd && !cleanCwd) {
    console.log(`[${logPrefix}] Path cleaning failed, original: "${cwd}"`)
  }

  return cleanCwd || undefined
}

/**
 * Strip ANSI codes from text (simplified version for marker detection)
 */
function stripAnsiSimple(text: string): string {
  return text
    .replace(/\x1B\[[0-9;]*[JKmsu]/g, '')
    .replace(/\x1B\[[?][0-9]*[hl]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r/g, '')
}

// ANSI color name lookup
const ANSI_COLOR_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

/**
 * Convert ANSI escape sequences to HTML with color styles
 */
function processAnsiCodes(text: string): string {
  if (!text.includes('\u001b[') && !text.includes('\x1B[')) return text

  let result = text
    // Normalize escape sequences
    .replace(/\x1B/g, '\u001b')
    // Remove cursor/screen control sequences
    .replace(/\u001b\[[\d;]*[HfABCDEFGJKSTijklmnpqrsu]/g, '')
    .replace(/\u001b\[\?[0-9;]*[hl]/g, '')
    .replace(/\u001b\([AB01]/g, '')
    .replace(/\u001b[=>NO]/g, '')
    .replace(/\u001b\]0;[^\x07]*\x07/g, '')
    .replace(/\u001b\[[KJ2J]/g, '')
    .replace(/\u001b\[H/g, '')
    .replace(/[\x00\r\x07\x08\x0B\x0C]/g, '')
    // Style codes
    .replace(/\u001b\[0m/g, '</span>')
    .replace(/\u001b\[1m/g, '<span class="ansi-bold">')
    .replace(/\u001b\[3m/g, '<span class="ansi-italic">')
    .replace(/\u001b\[4m/g, '<span class="ansi-underline">')

  // Foreground colors (30-37, 90-97)
  for (let i = 0; i < 8; i++) {
    const color = ANSI_COLOR_NAMES[i]
    result = result
      .replace(new RegExp(`\u001b\\[${30 + i}m`, 'g'), `<span class="ansi-${color}">`)
      .replace(new RegExp(`\u001b\\[${90 + i}m`, 'g'), `<span class="ansi-bright-${color}">`)
      .replace(new RegExp(`\u001b\\[${40 + i}m`, 'g'), `<span class="ansi-bg-${color}">`)
      .replace(new RegExp(`\u001b\\[${100 + i}m`, 'g'), `<span class="ansi-bg-bright-${color}">`)
  }

  // Handle complex sequences (e.g., \u001b[1;31m)
  result = result.replace(/\u001b\[(\d+);(\d+)m/g, (_, p1, p2) => {
    let replacement = ''
    for (const p of [p1, p2]) {
      const num = parseInt(p, 10)
      if (p === '0') replacement += '</span><span>'
      else if (p === '1') replacement += '<span class="ansi-bold">'
      else if (p === '3') replacement += '<span class="ansi-italic">'
      else if (p === '4') replacement += '<span class="ansi-underline">'
      else if (num >= 30 && num <= 37) replacement += `<span class="ansi-${ANSI_COLOR_NAMES[num - 30]}">`
      else if (num >= 40 && num <= 47) replacement += `<span class="ansi-bg-${ANSI_COLOR_NAMES[num - 40]}">`
      else if (num >= 90 && num <= 97) replacement += `<span class="ansi-bright-${ANSI_COLOR_NAMES[num - 90]}">`
      else if (num >= 100 && num <= 107) replacement += `<span class="ansi-bg-bright-${ANSI_COLOR_NAMES[num - 100]}">`
    }
    return replacement
  })

  // Clean up remaining sequences
  result = result.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
  result = result.replace(/\u001b\[\??\d+[hl]/g, '')

  // Balance HTML tags
  const openTags = (result.match(/<span/g) || []).length
  const closeTags = (result.match(/<\/span>/g) || []).length
  if (openTags > closeTags) {
    result += '</span>'.repeat(openTags - closeTags)
  }

  return result
}

// Remote terminal process class, using custom event emitter
export class RemoteTerminalProcess extends BrownEventEmitter<RemoteTerminalProcessEvents> {
  private isListening: boolean = true
  private fullOutput: string = ''
  isHot: boolean = false
  private pendingOutputTimer: NodeJS.Timeout | null = null
  private readonly PENDING_OUTPUT_DELAY = 150 // 150ms delay
  private readonly JUMPSERVER_COMMAND_TIMEOUT = 5 * 60 * 1000 // five-minute safeguard
  private sessionId: string = ''
  private sshType: string = ''

  // Interaction detection
  private interactionDetector: InteractionDetector | null = null
  private commandId: string = ''
  private taskId: string = ''

  constructor() {
    super()
  }

  /**
   * Enable interaction detection for this process
   */
  enableInteractionDetection(
    taskId: string,
    command: string,
    config?: InteractionDetectorConfig,
    llmCaller?: (command: string, output: string, locale: string) => Promise<InteractionResult>
  ): void {
    this.taskId = taskId
    this.commandId = generateCommandId(taskId)

    const detector = new InteractionDetector(command, this.commandId, config, this.taskId)
    this.interactionDetector = detector

    // Set LLM caller if provided
    if (llmCaller) {
      detector.setLlmCaller(llmCaller)
    }

    // Register command context for IPC handling
    registerCommandContext({
      commandId: this.commandId,
      taskId: this.taskId,
      sendInput: (input: string) => this.sendInput(input),
      cancel: async () => {
        await this.sendInput('\x03')
      },
      forceTerminate: () => this.forceTerminate(),
      onDismiss: () => detector.onDismiss(),
      onSuppress: () => detector.suppress(),
      onUnsuppress: () => detector.unsuppress(),
      onResume: () => detector.resume(),
      onInteractionSubmitted: () => detector.onInteractionSubmitted()
    })

    // Set up detector event handlers
    detector.on('interaction-needed', (request: InteractionRequest) => {
      console.log(`[RemoteTerminalProcess] Interaction needed: ${request.interactionType}`)
      broadcastInteractionNeeded(request)
      this.emit('interaction-needed', request)
    })

    detector.on('interaction-suppressed', (data: { commandId: string }) => {
      console.log(`[RemoteTerminalProcess] Interaction suppressed: ${data.commandId}`)
      broadcastInteractionSuppressed(data.commandId)
      this.emit('interaction-suppressed', data)
    })

    detector.on('tui-detected', async (data: { commandId: string; taskId?: string; message: string }) => {
      console.log(`[RemoteTerminalProcess] TUI detected: ${data.commandId}`)
      broadcastTuiDetected(data.commandId, data.message, data.taskId)
      this.emit('tui-detected', data)
      // Send Ctrl+C immediately to cancel TUI program
      try {
        const result = await this.sendInput('\x03')
        if (result.success) {
          console.log(`[RemoteTerminalProcess] Auto-sent Ctrl+C for TUI command: ${data.commandId}`)
        } else {
          console.warn(`[RemoteTerminalProcess] Failed to auto-cancel TUI command: ${data.commandId}, error: ${result.error || 'unknown'}`)
        }
      } catch (error) {
        console.warn(
          `[RemoteTerminalProcess] Failed to auto-cancel TUI command: ${data.commandId}, error: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })

    // Listen for alternate screen (TUI programs like vim, man, git log)
    detector.on('alternate-screen-entered', (data: { commandId: string; taskId?: string; autoCancel: boolean }) => {
      console.log(`[RemoteTerminalProcess] Alternate screen entered: ${data.commandId}, autoCancel: ${data.autoCancel}`)
      const message = data.autoCancel ? this.getLocalizedTuiMessage() : this.getLocalizedTuiNoAutoCancelMessage()
      broadcastAlternateScreenEntered(data.commandId, message, data.taskId)
    })
  }

  /**
   * Get localized TUI message
   */
  private getLocalizedTuiMessage(): string {
    // Basic message - can be enhanced with locale support
    return 'TUI program detected. Please interact directly in the terminal.'
  }

  /**
   * Get localized TUI message for non-auto-cancel cases
   */
  private getLocalizedTuiNoAutoCancelMessage(): string {
    return 'Full-screen program detected. Please interact directly in the terminal.'
  }

  /**
   * Get the command ID for interaction tracking
   */
  getCommandId(): string {
    return this.commandId
  }

  /**
   * Resume interaction detection after user input
   */
  resumeInteractionDetection(): void {
    if (this.interactionDetector) {
      this.interactionDetector.resume()
    }
  }

  /**
   * Clean up interaction detector
   */
  private cleanupInteractionDetector(): void {
    if (this.interactionDetector) {
      unregisterCommandContext(this.commandId)
      broadcastInteractionClosed(this.commandId)
      this.interactionDetector.dispose()
      this.interactionDetector = null
    }
  }

  /**
   * Force terminate the process by emitting continue event
   * This unblocks any code waiting on the process Promise
   */
  forceTerminate(): void {
    console.log(`[RemoteTerminalProcess] forceTerminate called for command: ${this.commandId}`)
    this.cleanupInteractionDetector()
    this.emit('completed')
    this.emit('continue')
  }

  /**
   * Compose a command that first tries to change into the provided directory and falls back to sudo if it fails.
   * Uses line breaks instead of always appending a semicolon so background commands (ending with `&`) stay valid.
   * Special character endings are no longer added. Affect command execution
   */
  private buildCommandWithWorkingDirectory(command: string, cleanCwd?: string): string {
    if (!cleanCwd) return command

    const trimmedCommand = command.trimEnd()
    const cmdBase64 = Buffer.from(trimmedCommand, 'utf-8').toString('base64')
    const evalCmd = `eval "$(echo ${cmdBase64} | base64 -d)"`

    // Build command with working directory change
    const sudoCommand = `cd "${cleanCwd}" && ${evalCmd}`
    const sudoCmdBase64 = Buffer.from(sudoCommand, 'utf-8').toString('base64')

    return [
      `if cd "${cleanCwd}" 2>/dev/null; then`,
      `  ${evalCmd}`,
      'else',
      `  sudo -i bash -c "eval \\"\\\$(echo ${sudoCmdBase64} | base64 -d)\\""`,
      'fi'
    ].join('\n')
  }

  /**
   * Build complete JumpServer command with Base64 encoding and execution markers.
   * Returns the wrapped command ready for stream.write() and the markers for output tracking.
   */
  private buildJumpServerWrappedCommand(command: string, cleanCwd?: string): { wrappedCommand: string; startMarker: string; endMarker: string } {
    // Generate unique markers for output tracking
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 14)
    const startMarker = `===CHATERM_START_${timestamp}_${randomId}===`
    const endMarker = `===CHATERM_END_${timestamp}_${randomId}===`

    // Encode original command in Base64 to protect special characters
    const cmdBase64 = Buffer.from(command, 'utf-8').toString('base64')
    const evalCmd = `eval "$(echo ${cmdBase64} | base64 -d)"`

    // Build command with or without working directory
    let commandToExecute: string
    if (!cleanCwd) {
      commandToExecute = evalCmd
    } else {
      const sudoCommand = `cd "${cleanCwd}" && ${evalCmd}`
      const sudoCmdBase64 = Buffer.from(sudoCommand, 'utf-8').toString('base64')
      commandToExecute = [
        `if cd "${cleanCwd}" 2>/dev/null; then`,
        `  ${evalCmd}`,
        'else',
        `  sudo -i bash -c "eval \\"\\\$(echo ${sudoCmdBase64} | base64 -d)\\""`,
        'fi'
      ].join('\n')
    }

    // Build complete wrapped command with markers
    const wrappedCommand = `bash -l -c 'echo "${startMarker}"; ${commandToExecute}; EXIT_CODE=$?; echo "${endMarker}:$EXIT_CODE"'`

    return {
      wrappedCommand,
      startMarker,
      endMarker
    }
  }

  async run(sessionId: string, command: string, cwd?: string, sshType?: string): Promise<void> {
    this.sessionId = sessionId
    const resolvedType = sshType || 'ssh'
    this.sshType = resolvedType
    try {
      if (resolvedType === 'jumpserver') {
        await this.runJumpServerCommand(sessionId, command, cwd)
      } else if (resolvedType === 'ssh') {
        await this.runSshCommand(sessionId, command, cwd)
      } else {
        // Check if this is a plugin-based bastion type
        const bastionCapability = capabilityRegistry.getBastion(resolvedType)
        if (!bastionCapability) {
          throw new Error(`${BastionErrorCode.CAPABILITY_NOT_FOUND}: ${resolvedType} capability not registered`)
        }
        if (!bastionCapability.getShellStream) {
          throw new Error(`${BastionErrorCode.AGENT_EXEC_UNAVAILABLE}: ${resolvedType} does not support getShellStream`)
        }
        // Route to generalized bastion command execution
        await this.runBastionCommand(resolvedType, sessionId, command, cwd)
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  // Send input to running command with detailed error reporting
  async sendInput(input: string): Promise<SendInputResult> {
    try {
      if (this.sshType === 'jumpserver') {
        const { jumpserverShellStreams } = await import('./jumpserverHandle')
        const stream = jumpserverShellStreams.get(this.sessionId)
        if (!stream) {
          return { success: false, error: 'JumpServer stream not found', code: 'closed' }
        }
        if (!stream.writable) {
          return { success: false, error: 'JumpServer stream is not writable', code: 'not-writable' }
        }

        // Handle backpressure with drain event
        const canWrite = stream.write(input)
        if (!canWrite) {
          // Wait for drain with timeout
          const drainResult = await this.waitForDrain(stream, 3000)
          if (!drainResult.success) {
            return drainResult
          }
        }
        return { success: true }
      } else if (this.sshType === 'ssh') {
        // For SSH, call handler function directly
        const { handleRemoteExecInput } = await import('../../../ssh/agentHandle')
        const result = handleRemoteExecInput(this.sessionId, input)
        if (!result.success) {
          return { success: false, error: result.error || 'SSH write failed', code: 'write-failed' }
        }
        return { success: true }
      } else {
        // Plugin-based bastion: use capability's write method
        const bastionCapability = capabilityRegistry.getBastion(this.sshType || '')
        if (!bastionCapability) {
          return { success: false, error: 'Bastion capability not found', code: 'not-writable' }
        }
        try {
          bastionCapability.write({ id: this.sessionId, data: input })
          return { success: true }
        } catch (writeError) {
          return { success: false, error: String(writeError), code: 'write-failed' }
        }
      }
    } catch (error) {
      console.error('Failed to send input to command:', error)
      return { success: false, error: String(error), code: 'write-failed' }
    }
  }

  // Wait for stream drain event with timeout
  private waitForDrain(stream: NodeJS.WritableStream, timeoutMs: number): Promise<SendInputResult> {
    return new Promise((resolve) => {
      let resolved = false

      const onDrain = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        stream.removeListener('error', onError)
        stream.removeListener('close', onClose)
        resolve({ success: true })
      }

      const onError = (err: Error) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        stream.removeListener('drain', onDrain)
        stream.removeListener('close', onClose)
        resolve({ success: false, error: err.message, code: 'write-failed' })
      }

      const onClose = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        stream.removeListener('drain', onDrain)
        stream.removeListener('error', onError)
        resolve({ success: false, error: 'Stream closed while waiting for drain', code: 'closed' })
      }

      const timer = setTimeout(() => {
        if (resolved) return
        resolved = true
        stream.removeListener('drain', onDrain)
        stream.removeListener('error', onError)
        stream.removeListener('close', onClose)
        resolve({ success: false, error: 'Timeout waiting for stream drain', code: 'timeout' })
      }, timeoutMs)

      stream.once('drain', onDrain)
      stream.once('error', onError)
      stream.once('close', onClose)
    })
  }

  private async runSshCommand(sessionId: string, command: string, cwd?: string): Promise<void> {
    const cleanCwd = cwd ? cwd.replace(/\x1B\[[^m]*m/g, '').replace(/\x1B\[[?][0-9]*[hl]/g, '') : undefined
    // Handle permission issues by using sudo when cd fails
    const commandToExecute = this.buildCommandWithWorkingDirectory(command, cleanCwd)

    let lineBuffer = ''
    let lastDelayedLine: string | null = null

    // Delayed output function - unified handling of all data without newlines
    const scheduleDelayedOutput = (data: string) => {
      // Clear previous timer
      if (this.pendingOutputTimer) {
        clearTimeout(this.pendingOutputTimer)
      }

      // Set new delayed timer
      this.pendingOutputTimer = setTimeout(() => {
        if (data.trim() && this.isListening) {
          this.emit('line', data)
          lastDelayedLine = data
        }
        this.pendingOutputTimer = null
      }, this.PENDING_OUTPUT_DELAY)
    }

    const execResult = await remoteSshExecStream(sessionId, commandToExecute, (chunk: string) => {
      this.fullOutput += chunk

      // Feed data to interaction detector
      if (this.interactionDetector) {
        this.interactionDetector.onOutput(chunk)
      }

      if (!this.isListening) return

      let data = lineBuffer + chunk
      const lines = data.split(/\r?\n/)

      if (lines.length === 1) {
        // Only one line of data (no newlines), use delay mechanism uniformly
        lineBuffer = data
        scheduleDelayedOutput(data)
      } else {
        // When there are multiple lines of data, process complete lines
        if (this.pendingOutputTimer) {
          clearTimeout(this.pendingOutputTimer)
          this.pendingOutputTimer = null
        }

        lineBuffer = lines.pop() || ''

        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i]
          if (i === 0 && lastDelayedLine !== null) {
            if (line === lastDelayedLine) {
              lastDelayedLine = null
              continue
            }
            lastDelayedLine = null
          }
          // Emit all lines including empty ones to preserve file format
          this.emit('line', line)
        }

        // Apply delay mechanism to remaining lineBuffer as well
        if (lineBuffer) {
          scheduleDelayedOutput(lineBuffer)
        }
      }
    })

    // Clean up timer and ensure sending last buffer content
    if (this.pendingOutputTimer) {
      clearTimeout(this.pendingOutputTimer)
      this.pendingOutputTimer = null
    }

    if (lineBuffer && this.isListening) {
      if (lastDelayedLine !== null && lineBuffer === lastDelayedLine) {
        lastDelayedLine = null
      } else {
        this.emit('line', lineBuffer)
      }
    }

    if (execResult && execResult.success) {
      this.cleanupInteractionDetector()
      this.emit('completed')
    } else {
      this.cleanupInteractionDetector()
      const error = new Error(execResult?.error || 'Remote command execution failed')
      this.emit('error', error)
      throw error
    }
    // Trigger continue to resolve external promise
    this.emit('continue')
  }

  private async runJumpServerCommand(sessionId: string, command: string, cwd?: string): Promise<void> {
    const stream = jumpserverShellStreams.get(sessionId)
    if (!stream) {
      throw new Error('JumpServer connection not found')
    }

    const logPrefix = `JumpServer ${sessionId}`
    const cleanCwd = cleanWorkingDirectory(cwd, logPrefix)

    // Build complete JumpServer command with Base64 encoding and markers
    const { wrappedCommand, startMarker, endMarker } = this.buildJumpServerWrappedCommand(command, cleanCwd)

    // Note: Agent mode uses marker-based-runner with direct stream monitoring.
    // The jumpserverMarkedCommands Map (in jumpserverHandle.ts) is only used
    // by sshHandle.ts for non-Agent mode shell data handling.

    // JumpServer-specific command echo detection
    const isCommandEcho = (line: string): boolean => {
      const cleanLine = processAnsiCodes(line)
        .replace(/<[^>]*>/g, '')
        .trim()

      return (
        cleanLine.startsWith('bash -l -c') ||
        (cleanLine.includes(`echo "${startMarker}"`) && cleanLine.length > startMarker.length + 10) ||
        (cleanLine.includes(`echo "${endMarker}:$EXIT_CODE"`) && cleanLine.length > endMarker.length + 20) ||
        cleanLine === wrappedCommand.trim()
      )
    }

    await runMarkerBasedCommand({
      stream: stream as unknown as MarkerStream,
      wrappedCommand,
      startMarker,
      endMarker,
      logPrefix,
      timeoutMs: this.JUMPSERVER_COMMAND_TIMEOUT,
      isListening: () => this.isListening,
      stripForDetect: (v) => processAnsiCodes(v).replace(/<[^>]*>/g, ''),
      renderForDisplay: processAnsiCodes,
      shouldFilterEcho: isCommandEcho,
      onLine: (line) => this.emit('line', line),
      onDetectorOutput: (chunk) => this.interactionDetector?.onOutput(chunk),
      onCompleted: () => this.emit('completed'),
      onContinue: () => this.emit('continue'),
      onExitCode: (code) => this.emit('exitCode', code),
      cleanupInteractionDetector: () => this.cleanupInteractionDetector()
    })
  }

  /**
   * Run command on plugin-based bastion host (e.g., Qizhi, Tencent)
   * Uses stream-based execution via capability registry
   * @param bastionType The bastion type identifier (e.g., 'qizhi', 'tencent')
   * @param sessionId The session ID
   * @param command The command to execute
   * @param cwd Optional working directory
   */
  private async runBastionCommand(bastionType: string, sessionId: string, command: string, cwd?: string): Promise<void> {
    const bastionCapability = capabilityRegistry.getBastion(bastionType)
    if (!bastionCapability || !bastionCapability.getShellStream) {
      throw new Error(`${bastionType} capability shell stream not available`)
    }

    const stream = bastionCapability.getShellStream(sessionId) as unknown as MarkerStream
    if (!stream) {
      throw new Error(`${bastionType} connection not found`)
    }

    const logPrefix = `${bastionType} ${sessionId}`
    const cleanCwd = cleanWorkingDirectory(cwd, logPrefix)

    // Build wrapped command with markers
    const { wrappedCommand, startMarker, endMarker } = this.buildJumpServerWrappedCommand(command, cleanCwd)

    // Bastion-specific command echo detection
    const isBastionCommandEcho = (line: string): boolean => {
      const cleanLine = stripAnsiSimple(line).trim()
      return cleanLine.includes('echo') && cleanLine.includes(startMarker)
    }

    await runMarkerBasedCommand({
      stream,
      wrappedCommand,
      startMarker,
      endMarker,
      logPrefix,
      timeoutMs: this.JUMPSERVER_COMMAND_TIMEOUT,
      isListening: () => this.isListening,
      stripForDetect: stripAnsiSimple,
      renderForDisplay: stripAnsiSimple, // Bastion uses simple strip instead of HTML conversion
      shouldFilterEcho: isBastionCommandEcho,
      onLine: (line) => this.emit('line', line),
      onDetectorOutput: (chunk) => this.interactionDetector?.onOutput(chunk),
      onCompleted: () => this.emit('completed'),
      onContinue: () => this.emit('continue'),
      onExitCode: (code) => this.emit('exitCode', code),
      cleanupInteractionDetector: () => this.cleanupInteractionDetector()
    })
  }
}

// Remote terminal process result Promise type
export type RemoteTerminalProcessResultPromise = RemoteTerminalProcess & Promise<void>

// Merge process and Promise
export function mergeRemotePromise(process: RemoteTerminalProcess, promise: Promise<void>): RemoteTerminalProcessResultPromise {
  const merged = process as RemoteTerminalProcessResultPromise

  // Copy Promise methods
  merged.then = promise.then.bind(promise)
  merged.catch = promise.catch.bind(promise)
  merged.finally = promise.finally.bind(promise)

  return merged
}

// Remote terminal manager class
export class RemoteTerminalManager {
  private terminals: Map<number, RemoteTerminalInfo> = new Map()
  private processes: Map<number, RemoteTerminalProcess> = new Map()
  private nextTerminalId = 1
  private connectionInfo: ConnectionInfo | null = null

  constructor() {
    // Set default connection information
  }

  // Set SSH connection information
  setConnectionInfo(info: ConnectionInfo): void {
    const rawInfo = info as unknown as Record<string, unknown>
    const assetUuid =
      info?.assetUuid ??
      (typeof rawInfo?.organization_uuid === 'string' ? (rawInfo?.organization_uuid as string) : undefined) ??
      (typeof rawInfo?.uuid === 'string' ? (rawInfo?.uuid as string) : undefined)
    this.connectionInfo = {
      ...info,
      assetUuid
    }
  }

  // Create new remote terminal
  async createTerminal(): Promise<RemoteTerminalInfo> {
    if (!this.connectionInfo) {
      throw new Error('Connection information not set, please call setConnectionInfo() first')
    }
    // SSH connection logic
    const existingTerminal = Array.from(this.terminals.values()).find(
      (terminal) =>
        terminal.connectionInfo.host === this.connectionInfo?.host &&
        terminal.connectionInfo.port === this.connectionInfo?.port &&
        terminal.connectionInfo.username === this.connectionInfo?.username
    )

    if (existingTerminal) {
      return existingTerminal
    }

    try {
      let connectResult: { id?: string; status?: string; message?: string; error?: string } | undefined

      // Add connection ident
      let identToken = ''
      const wc = webContents.getFocusedWebContents()
      if (wc) {
        const connIdentToken = await wc.executeJavaScript(`localStorage.getItem('jms-token')`)
        identToken = connIdentToken ? `_t=${connIdentToken}` : ''
      }
      this.connectionInfo.ident = `${packageInfo.name}_${packageInfo.version}` + identToken

      const sshType = this.connectionInfo.sshType || 'ssh'
      // Choose connection method based on sshType
      if (sshType === 'jumpserver') {
        // Use JumpServer connection
        const jumpServerSessionId = `jumpserver_${Date.now()}_${Math.random().toString(36).substring(2, 14)}`
        const assetUuid = this.connectionInfo.assetUuid || this.connectionInfo.id || jumpServerSessionId
        const jumpServerConnectionInfo = {
          id: jumpServerSessionId,
          host: this.connectionInfo.asset_ip!,
          port: this.connectionInfo.port,
          username: this.connectionInfo.username!,
          password: this.connectionInfo.password,
          privateKey: this.connectionInfo.privateKey,
          passphrase: this.connectionInfo.passphrase,
          targetIp: this.connectionInfo.host!,
          needProxy: this.connectionInfo.needProxy || false,
          proxyName: this.connectionInfo.proxyName || '',
          ident: this.connectionInfo.ident,
          assetUuid
        }

        connectResult = await handleJumpServerConnection(jumpServerConnectionInfo)
        if (!connectResult || connectResult.status !== 'connected') {
          throw new Error('JumpServer connection failed: ' + (connectResult?.message || 'Unknown error'))
        }

        // Set ID for JumpServer connection
        connectResult.id = jumpServerConnectionInfo.id
      } else if (sshType !== 'ssh') {
        // Use plugin-based bastion host connection
        const bastionCapability = capabilityRegistry.getBastion(sshType)
        if (!bastionCapability) {
          throw new Error(`${sshType} plugin not installed`)
        }
        const bastionSessionId = `${sshType}_${Date.now()}_${Math.random().toString(36).substring(2, 14)}`
        const bastionHost = this.connectionInfo.asset_ip || this.connectionInfo.host
        if (!bastionHost) {
          throw new Error(`${sshType} bastion host is missing`)
        }
        const targetAsset = this.connectionInfo.comment || this.connectionInfo.host
        const bastionConnectionInfo = {
          id: bastionSessionId,
          host: bastionHost,
          port: this.connectionInfo.port || 22,
          username: this.connectionInfo.username!,
          password: this.connectionInfo.password,
          privateKey: this.connectionInfo.privateKey,
          passphrase: this.connectionInfo.passphrase,
          targetIp: this.connectionInfo.host,
          targetHostname: this.connectionInfo?.hostname || '', // Complete target information is provided for use by the bastion host plugin
          targetAsset,
          needProxy: this.connectionInfo.needProxy || false,
          proxyName: this.connectionInfo.proxyName || '',
          proxyConfig: this.connectionInfo.proxyName ? { name: this.connectionInfo.proxyName } : undefined,
          asset_type: this.connectionInfo.asset_type || `organization-${sshType}`,
          connIdentToken: identToken,
          ident: this.connectionInfo.ident,
          assetUuid: this.connectionInfo.assetUuid
        }

        connectResult = await bastionCapability.connect(bastionConnectionInfo as any, wc ? ({ sender: wc } as IpcMainInvokeEvent) : undefined)
        if (!connectResult || connectResult.status !== 'connected') {
          throw new Error(`${sshType} connection failed: ` + (connectResult?.message || 'Unknown error'))
        }

        // Set ID for bastion connection
        connectResult.id = bastionConnectionInfo.id
      } else {
        // Use standard SSH connection
        connectResult = await remoteSshConnect(this.connectionInfo)
        if (!connectResult || !connectResult.id) {
          throw new Error('SSH connection failed: ' + (connectResult?.error || 'Unknown error'))
        }
      }

      const terminalInfo: RemoteTerminalInfo = {
        id: this.nextTerminalId++,
        sessionId: connectResult.id,
        busy: false,
        lastCommand: '',
        connectionInfo: this.connectionInfo,
        terminal: {
          show: () => {} // The show method of the remote terminal is a no-op
        }
      }

      this.terminals.set(terminalInfo.id, terminalInfo)
      console.log('SSH connection established successfully, terminal created')
      return terminalInfo
    } catch (error) {
      throw new Error('Failed to create remote terminal: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // Run remote command
  runCommand(
    terminalInfo: RemoteTerminalInfo,
    command: string,
    cwd?: string,
    options?: {
      taskId?: string
      enableInteraction?: boolean
      llmCaller?: (command: string, output: string, locale: string) => Promise<InteractionResult>
      userLocale?: string
    }
  ): RemoteTerminalProcessResultPromise {
    terminalInfo.busy = true
    terminalInfo.lastCommand = command
    const process = new RemoteTerminalProcess()
    this.processes.set(terminalInfo.id, process)

    // Enable interaction detection if taskId is provided
    if (options?.taskId && options?.enableInteraction !== false) {
      const config = options?.userLocale ? { userLocale: options.userLocale } : undefined
      process.enableInteractionDetection(options.taskId, command, config, options.llmCaller)
    }

    process.once('error', (error) => {
      terminalInfo.busy = false
      console.error(`Remote terminal ${terminalInfo.id} error:`, error)
    })
    const promise = new Promise<void>((resolve, reject) => {
      process.once('continue', () => {
        resolve()
      })
      process.once('error', (error) => {
        reject(error)
      })
      process.run(terminalInfo.sessionId, command, cwd, terminalInfo.connectionInfo.sshType).catch(reject)
    })
    const result = mergeRemotePromise(process, promise)
    return result
  }

  // Check if process is in hot state
  isProcessHot(terminalId: number): boolean {
    const process = this.processes.get(terminalId)
    return process ? process.isHot : false
  }

  // Get terminal information
  getTerminals(busy: boolean): { id: number; lastCommand: string }[] {
    return Array.from(this.terminals.values())
      .filter((t) => t.busy === busy)
      .map((t) => ({ id: t.id, lastCommand: t.lastCommand }))
  }

  // Check if connected
  isConnected(): boolean {
    return this.terminals.size > 0
  }

  // Get connection status
  getConnectionStatus(): { connected: boolean; terminalCount: number; busyCount: number } {
    const terminals = Array.from(this.terminals.values())
    return {
      connected: terminals.length > 0,
      terminalCount: terminals.length,
      busyCount: terminals.filter((t) => t.busy).length
    }
  }

  // Clean up all connections
  async disposeAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = []
    for (const terminalInfo of this.terminals.values()) {
      disconnectPromises.push(this.disconnectTerminal(terminalInfo.id))
    }
    await Promise.all(disconnectPromises)
    this.terminals.clear()
    this.processes.clear()
    console.log('All remote terminals have been closed.')
  }

  // Disconnect specified terminal connection
  async disconnectTerminal(terminalId: number): Promise<void> {
    const terminalInfo = this.terminals.get(terminalId)
    if (terminalInfo) {
      this.processes.delete(terminalId)
      this.terminals.delete(terminalId)
      try {
        const sshType = terminalInfo.connectionInfo.sshType || 'ssh'
        if (sshType === 'jumpserver') {
          const { jumpServerDisconnect } = await import('./jumpserverHandle')
          await jumpServerDisconnect(terminalInfo.sessionId)
          console.log(`JumpServer terminal ${terminalId} (Session: ${terminalInfo.sessionId}) disconnected.`)
        } else if (sshType !== 'ssh') {
          const bastionCapability = capabilityRegistry.getBastion(sshType)
          if (bastionCapability) {
            await bastionCapability.disconnect({ id: terminalInfo.sessionId })
          } else {
            console.warn(`${sshType} capability not registered, skipping disconnect.`)
          }
          console.log(`${sshType} terminal ${terminalId} (Session: ${terminalInfo.sessionId}) disconnected.`)
        } else {
          await remoteSshDisconnect(terminalInfo.sessionId)
          console.log(`SSH terminal ${terminalId} (Session: ${terminalInfo.sessionId}) disconnected.`)
        }
      } catch (error) {
        console.error(`Error disconnecting terminal ${terminalId}:`, error)
      }
    }
  }
}
