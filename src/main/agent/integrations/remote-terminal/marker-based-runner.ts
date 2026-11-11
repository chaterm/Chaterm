/**
 * Shared marker-based command runner for JumpServer and Bastion connections.
 *
 * This module extracts common logic for executing commands with start/end markers,
 * including line buffering, half-line timeout handling, and interaction detection integration.
 */

import type { EventEmitter } from 'events'
const logger = createLogger('remote-terminal')

/**
 * Stream interface for marker-based command execution
 */
export interface MarkerStream extends EventEmitter {
  write(data: string): boolean
  writable?: boolean
  removeListener(event: string, listener: (...args: any[]) => void): this
}

/**
 * Configuration for marker-based command runner
 */
export interface MarkerRunnerConfig {
  /** The stream to read from and write to */
  stream: MarkerStream
  /** The wrapped command to execute (with markers) */
  wrappedCommand: string
  /** Start marker for command output */
  startMarker: string
  /** End marker for command output */
  endMarker: string
  /** Log prefix for debugging */
  logPrefix: string
  /** Command execution timeout in ms */
  timeoutMs: number
  /** Half-line release timeout in ms (default: 500) */
  halfLineTimeoutMs?: number
  /** Check if we should emit output */
  isListening: () => boolean
  /** Strip ANSI and other codes for marker detection */
  stripForDetect: (line: string) => string
  /** Process line for display (e.g., convert ANSI to HTML) */
  renderForDisplay: (line: string) => string
  /** Check if a line is a command echo that should be filtered */
  shouldFilterEcho: (line: string) => boolean
  /** Emit a line of output */
  onLine: (line: string) => void
  /** Feed output to interaction detector (optional) */
  onDetectorOutput?: (chunk: string) => void
  /** Called when command completes */
  onCompleted: () => void
  /** Called to resolve the command promise */
  onContinue: () => void
  /** Called with exit code when available */
  onExitCode?: (code: number) => void
  /** Clean up interaction detector */
  cleanupInteractionDetector: () => void
  /** Called on timeout (optional, for custom timeout handling) */
  onTimeout?: () => void
  /** How long to wait for the end marker after sending Ctrl+C on timeout (default: 10000) */
  interruptGraceMs?: number
  /** Called when the command did not stop after Ctrl+C, before completion callbacks */
  onInterruptFailed?: () => void
  /** Stops tracking silently; the caller is responsible for completion events */
  signal?: AbortSignal
}

/**
 * State returned after runner completes
 */
export interface MarkerRunnerResult {
  completed: boolean
  exitCode: number
  timedOut: boolean
}

/**
 * Run a command with marker-based output tracking.
 *
 * This function handles:
 * - Line buffering for proper line-by-line processing
 * - Half-line timeout for releasing buffered data without newlines
 * - Command echo filtering
 * - Start/end marker detection
 * - Exit code extraction
 * - Timeout handling (Ctrl+C, then wait for the end marker)
 * - Stream close and abort handling
 * - Interaction detector integration
 */
export function runMarkerBasedCommand(config: MarkerRunnerConfig): Promise<MarkerRunnerResult> {
  const {
    stream,
    wrappedCommand,
    startMarker,
    endMarker,
    logPrefix,
    timeoutMs,
    halfLineTimeoutMs = 500,
    isListening,
    stripForDetect,
    renderForDisplay,
    shouldFilterEcho,
    onLine,
    onDetectorOutput,
    onCompleted,
    onContinue,
    onExitCode,
    cleanupInteractionDetector,
    onTimeout,
    interruptGraceMs = 10000,
    onInterruptFailed,
    signal
  } = config

  return new Promise((resolve) => {
    let lineBuffer = ''
    let commandStarted = false
    let commandCompleted = false
    let commandEchoFiltered = false
    let exitCode = 0
    let timedOut = false

    if (signal?.aborted) {
      resolve({ completed: false, exitCode, timedOut })
      return
    }

    // Timers
    let halfLineTimer: NodeJS.Timeout | null = null
    let commandTimeout: NodeJS.Timeout | null = null
    let interruptTimer: NodeJS.Timeout | null = null

    const clearHalfLineTimer = () => {
      if (halfLineTimer) {
        clearTimeout(halfLineTimer)
        halfLineTimer = null
      }
    }

    const clearCommandTimeout = () => {
      if (commandTimeout) {
        clearTimeout(commandTimeout)
        commandTimeout = null
      }
    }

    const cleanup = () => {
      clearHalfLineTimer()
      clearCommandTimeout()
      if (interruptTimer) {
        clearTimeout(interruptTimer)
        interruptTimer = null
      }
      stream.removeListener('data', dataHandler)
      stream.removeListener('close', closeHandler)
      signal?.removeEventListener('abort', abortHandler)
    }

    // 'end': end marker received; 'lost': stream closed or Ctrl+C ignored; 'aborted': caller stopped tracking
    const complete = (reason: 'end' | 'lost' | 'aborted') => {
      if (commandCompleted) return
      commandCompleted = true
      cleanup()
      if (reason === 'aborted') {
        resolve({ completed: false, exitCode, timedOut })
        return
      }
      cleanupInteractionDetector()
      // Report the exit code before completion so the caller can still append it to the output
      if (reason === 'end') {
        onExitCode?.(exitCode)
      }
      onCompleted()
      onContinue()
      resolve({ completed: true, exitCode, timedOut })
    }

    const scheduleHalfLineRelease = () => {
      clearHalfLineTimer()
      halfLineTimer = setTimeout(() => {
        if (lineBuffer && commandStarted && !commandCompleted && isListening()) {
          const cleanLine = stripForDetect(lineBuffer).trim()
          // Don't release if it looks like a marker
          if (cleanLine && !cleanLine.includes('===CHATERM_')) {
            onLine(renderForDisplay(lineBuffer))
            onDetectorOutput?.(lineBuffer + '\n')
          }
          lineBuffer = ''
        }
        halfLineTimer = null
      }, halfLineTimeoutMs)
    }

    const processLine = (line: string) => {
      const processedLine = renderForDisplay(line)
      const cleanLine = stripForDetect(processedLine).trim()

      // Filter command echo
      if (!commandStarted && !commandEchoFiltered && shouldFilterEcho(line)) {
        logger.debug('Filtering command echo', { event: 'remote-terminal.marker.echo.filter', logPrefix })
        return
      }

      // Detect command start marker
      if (cleanLine.includes(startMarker)) {
        commandStarted = true
        commandEchoFiltered = true
        logger.debug('Detected command start marker', { event: 'remote-terminal.marker.start', logPrefix })
        return
      }

      // Detect command end marker
      if (cleanLine.includes(endMarker)) {
        if (!commandStarted) {
          logger.debug('Detected end marker before start marker, skipping', { event: 'remote-terminal.marker.end.early', logPrefix })
          return
        }
        logger.debug('Detected command end marker', { event: 'remote-terminal.marker.end', logPrefix })

        // Extract exit code
        const escapedEndMarker = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const match = cleanLine.match(new RegExp(`${escapedEndMarker}:(\\d+)`))
        if (match?.[1]) {
          exitCode = parseInt(match[1], 10)
          logger.debug('Command exit code extracted', { event: 'remote-terminal.marker.exitcode', logPrefix, exitCode })
        }

        // Send remaining buffer content before completing
        if (lineBuffer && isListening()) {
          const cleanBufferLine = stripForDetect(lineBuffer).trim()
          if (cleanBufferLine && !cleanBufferLine.includes(endMarker)) {
            onLine(renderForDisplay(lineBuffer))
          }
        }

        complete('end')
        return
      }

      // Only emit output after start marker and before completion
      if (commandStarted && !commandCompleted) {
        // Allow empty lines but exclude marker lines
        if (!cleanLine.includes(startMarker) && !cleanLine.includes(endMarker) && !cleanLine.includes('===CHATERM_')) {
          onLine(processedLine || '\n')
          onDetectorOutput?.(line + '\n')
        }
      }
    }

    const dataHandler = (data: Buffer) => {
      if (commandCompleted) return

      const chunk = data.toString('utf8')

      if (!isListening()) return

      // Cancel half-line timer on new data
      clearHalfLineTimer()

      // Process data with line buffer
      // lineBuffer accumulates incomplete lines across chunks, ensuring markers
      // split across chunk boundaries are properly detected when complete
      const dataStr = lineBuffer + chunk
      const lines = dataStr.split(/\r?\n/)
      lineBuffer = lines.pop() || ''

      // Process complete lines
      for (const line of lines) {
        processLine(line)
      }

      // Check if line buffer contains markers (handles cases where marker
      // arrives without trailing newline or is split across chunks)
      if (lineBuffer.includes(endMarker)) {
        logger.debug('Detected end marker in buffer', { event: 'remote-terminal.marker.end.buffer', logPrefix })
        processLine(lineBuffer)
        lineBuffer = ''
      } else if (!commandStarted && lineBuffer.includes(startMarker)) {
        logger.debug('Detected start marker in buffer', { event: 'remote-terminal.marker.start.buffer', logPrefix })
        processLine(lineBuffer)
        lineBuffer = ''
      }

      // Schedule half-line release if we have pending data
      if (lineBuffer && commandStarted) {
        scheduleHalfLineRelease()
      }
    }

    const closeHandler = () => {
      logger.warn('Stream closed before end marker', { event: 'remote-terminal.marker.closed', logPrefix })
      onLine('Connection closed before the command finished.')
      complete('lost')
    }

    const abortHandler = () => {
      logger.debug('Marker tracking aborted', { event: 'remote-terminal.marker.aborted', logPrefix })
      complete('aborted')
    }

    // Attach handlers
    stream.on('data', dataHandler)
    stream.on('close', closeHandler)
    signal?.addEventListener('abort', abortHandler, { once: true })

    // Send command
    logger.debug('Sending wrapped command', { event: 'remote-terminal.marker.command.send', logPrefix })
    // Leading space prevents the command from being recorded in shell history
    // (bash HISTCONTROL=ignorespace, zsh HIST_IGNORE_SPACE)
    stream.write(` ${wrappedCommand}\r`)

    // On timeout, interrupt the command and keep waiting for the end marker so the shell is left idle
    commandTimeout = setTimeout(() => {
      if (commandCompleted) return
      timedOut = true
      logger.warn('Command execution timeout, sending Ctrl+C', { event: 'remote-terminal.marker.timeout', logPrefix, timeoutMs })

      if (onTimeout) {
        onTimeout()
      } else {
        const timeoutMinutes = Math.max(1, Math.round(timeoutMs / 60000))
        onLine(`Command execution timed out after ${timeoutMinutes} minute${timeoutMinutes > 1 ? 's' : ''}.`)
        onLine('Chaterm sent Ctrl+C to stop it.')
      }
      stream.write('\x03')

      interruptTimer = setTimeout(() => {
        logger.warn('Command did not stop after Ctrl+C', { event: 'remote-terminal.marker.interrupt.failed', logPrefix, interruptGraceMs })
        onLine('The command did not stop after Ctrl+C and may still be running on the server.')
        onInterruptFailed?.()
        complete('lost')
      }, interruptGraceMs)
    }, timeoutMs)
  })
}
