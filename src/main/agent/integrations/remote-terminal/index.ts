import { BrownEventEmitter } from './event'
import { remoteSshConnect, remoteSshExecStream, remoteSshDisconnect } from '../../../ssh/agentHandle'
import { handleJumpServerConnection, jumpserverShellStreams, jumpserverMarkedCommands } from './jumpserverHandle'

export interface RemoteTerminalProcessEvents extends Record<string, any[]> {
  line: [line: string]
  continue: []
  completed: []
  error: [error: Error]
  no_shell_integration: []
}

export interface ConnectionInfo {
  id?: string
  host?: string
  port?: number
  username?: string
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
  sshType?: string
  needProxy: boolean
  proxyName?: string
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

// Remote terminal process class, using custom event emitter
export class RemoteTerminalProcess extends BrownEventEmitter<RemoteTerminalProcessEvents> {
  private isListening: boolean = true
  private fullOutput: string = ''
  isHot: boolean = false
  private pendingOutputTimer: NodeJS.Timeout | null = null
  private readonly PENDING_OUTPUT_DELAY = 150 // 150ms delay
  private sessionId: string = ''
  private sshType: string = ''

  constructor() {
    super()
  }

  /**
   * Compose a command that first tries to change into the provided directory and falls back to sudo if it fails.
   * Uses line breaks instead of always appending a semicolon so background commands (ending with `&`) stay valid.
   * Special character endings are no longer added. Affect command execution
   */
  private buildCommandWithWorkingDirectory(command: string, cleanCwd?: string): string {
    if (!cleanCwd) return command

    const trimmedCommand = command.trimEnd()
    const requiresTerminator = trimmedCommand.length > 0 && !/[;&]$/.test(trimmedCommand)
    const commandForThen = `${trimmedCommand}${requiresTerminator ? ';' : ''}`
    const escapedCwdForSudo = cleanCwd.replace(/'/g, "'\\''")
    const commandForSudo = trimmedCommand.replace(/'/g, "'\\''")

    return [
      `if cd "${cleanCwd}" 2>/dev/null; then`,
      `  ${commandForThen}`,
      'else',
      `  sudo sh -c "cd '${escapedCwdForSudo}' && ${commandForSudo}"`,
      'fi'
    ].join('\n')
  }

  async run(sessionId: string, command: string, cwd?: string, sshType?: string): Promise<void> {
    this.sessionId = sessionId
    this.sshType = sshType || 'ssh'
    try {
      if (sshType === 'jumpserver') {
        await this.runJumpServerCommand(sessionId, command, cwd)
      } else if (sshType === 'ssh') {
        await this.runSshCommand(sessionId, command, cwd)
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  // Send input to running command
  async sendInput(input: string): Promise<boolean> {
    try {
      if (this.sshType === 'jumpserver') {
        const { jumpserverShellStreams } = await import('./jumpserverHandle')
        const stream = jumpserverShellStreams.get(this.sessionId)
        if (stream) {
          stream.write(input)
          return true
        }
        return false
      } else {
        // For SSH, call handler function directly
        const { handleRemoteExecInput } = await import('../../../ssh/agentHandle')
        const result = handleRemoteExecInput(this.sessionId, input)
        return result.success
      }
    } catch (error) {
      console.error('Failed to send input to command:', error)
      return false
    }
  }

  private async runSshCommand(sessionId: string, command: string, cwd?: string): Promise<void> {
    const cleanCwd = cwd ? cwd.replace(/\x1B\[[^m]*m/g, '').replace(/\x1B\[[?][0-9]*[hl]/g, '') : undefined
    // Handle permission issues by using sudo when cd fails
    const commandToExecute = this.buildCommandWithWorkingDirectory(command, cleanCwd)

    let lineBuffer = ''

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
        }
        this.pendingOutputTimer = null
      }, this.PENDING_OUTPUT_DELAY)
    }

    const execResult = await remoteSshExecStream(sessionId, commandToExecute, (chunk: string) => {
      this.fullOutput += chunk

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

        for (const line of lines) {
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
      this.emit('line', lineBuffer)
    }

    if (execResult && execResult.success) {
      this.emit('completed')
    } else {
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

    // Improved path cleaning: remove all ANSI sequences, terminal prompts and special characters
    let cleanCwd: string | undefined = undefined
    if (cwd) {
      cleanCwd = cwd
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
        console.log(`[JumpServer ${sessionId}] Invalid working directory path, ignoring: "${cleanCwd}"`)
        cleanCwd = undefined
      }

      if (cwd && cleanCwd) {
        console.log(`[JumpServer ${sessionId}] Original path: "${cwd}" -> Cleaned: "${cleanCwd}"`)
      } else if (cwd && !cleanCwd) {
        console.log(`[JumpServer ${sessionId}] Path cleaning failed, original: "${cwd}"`)
      }
    }

    // For JumpServer, use different command construction method with permission handling
    const commandToExecute = this.buildCommandWithWorkingDirectory(command, cleanCwd)

    // Create unique command marker with more distinctive format
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 14)
    const startMarker = `===CHATERM_START_${timestamp}_${randomId}===`
    const endMarker = `===CHATERM_END_${timestamp}_${randomId}===`

    // Improved command wrapping: use bash for reliability and better error handling
    const wrappedCommand = `bash -l -c 'echo "${startMarker}"; ${commandToExecute}; EXIT_CODE=$?; echo "${endMarker}:$EXIT_CODE"'`

    jumpserverMarkedCommands.set(sessionId, {
      marker: startMarker,
      output: '',
      completed: false,
      lastActivity: Date.now(),
      idleTimer: null
    })

    let lineBuffer = ''
    let commandStarted = false
    let commandCompleted = false
    let exitCode = 0
    let commandEchoFiltered = false

    // Helper function to get color name by index
    const getColorName = (index: number): string => {
      const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
      return colors[index] || 'white'
    }

    // Convert ANSI escape sequences to HTML with color styles
    const processAnsiCodes = (text: string): string => {
      if (!text.includes('\u001b[') && !text.includes('\x1B[')) return text

      let result = text
        // First, normalize escape sequences to use \u001b format
        .replace(/\x1B/g, '\u001b')
        // Remove cursor movement and screen control sequences
        .replace(/\u001b\[[\d;]*[HfABCDEFGJKSTijklmnpqrsu]/g, '')
        .replace(/\u001b\[\?[0-9;]*[hl]/g, '')
        .replace(/\u001b\([AB01]/g, '')
        .replace(/\u001b[=>]/g, '')
        .replace(/\u001b[NO]/g, '')
        .replace(/\u001b\]0;[^\x07]*\x07/g, '')
        .replace(/\u001b\[K/g, '')
        .replace(/\u001b\[J/g, '')
        .replace(/\u001b\[2J/g, '')
        .replace(/\u001b\[H/g, '')
        .replace(/\x00/g, '')
        .replace(/\r/g, '')
        .replace(/\x07/g, '')
        .replace(/\x08/g, '')
        .replace(/\x0B/g, '')
        .replace(/\x0C/g, '')
        // Convert color and style codes to HTML spans
        .replace(/\u001b\[0m/g, '</span>') // Reset
        .replace(/\u001b\[1m/g, '<span class="ansi-bold">') // Bold
        .replace(/\u001b\[3m/g, '<span class="ansi-italic">') // Italic
        .replace(/\u001b\[4m/g, '<span class="ansi-underline">') // Underline
        // Foreground colors
        .replace(/\u001b\[30m/g, '<span class="ansi-black">') // Black
        .replace(/\u001b\[31m/g, '<span class="ansi-red">') // Red
        .replace(/\u001b\[32m/g, '<span class="ansi-green">') // Green
        .replace(/\u001b\[33m/g, '<span class="ansi-yellow">') // Yellow
        .replace(/\u001b\[34m/g, '<span class="ansi-blue">') // Blue
        .replace(/\u001b\[35m/g, '<span class="ansi-magenta">') // Magenta
        .replace(/\u001b\[36m/g, '<span class="ansi-cyan">') // Cyan
        .replace(/\u001b\[37m/g, '<span class="ansi-white">') // White
        // Bright foreground colors
        .replace(/\u001b\[90m/g, '<span class="ansi-bright-black">') // Bright Black
        .replace(/\u001b\[91m/g, '<span class="ansi-bright-red">') // Bright Red
        .replace(/\u001b\[92m/g, '<span class="ansi-bright-green">') // Bright Green
        .replace(/\u001b\[93m/g, '<span class="ansi-bright-yellow">') // Bright Yellow
        .replace(/\u001b\[94m/g, '<span class="ansi-bright-blue">') // Bright Blue
        .replace(/\u001b\[95m/g, '<span class="ansi-bright-magenta">') // Bright Magenta
        .replace(/\u001b\[96m/g, '<span class="ansi-bright-cyan">') // Bright Cyan
        .replace(/\u001b\[97m/g, '<span class="ansi-bright-white">') // Bright White
        // Background colors
        .replace(/\u001b\[40m/g, '<span class="ansi-bg-black">') // Black background
        .replace(/\u001b\[41m/g, '<span class="ansi-bg-red">') // Red background
        .replace(/\u001b\[42m/g, '<span class="ansi-bg-green">') // Green background
        .replace(/\u001b\[43m/g, '<span class="ansi-bg-yellow">') // Yellow background
        .replace(/\u001b\[44m/g, '<span class="ansi-bg-blue">') // Blue background
        .replace(/\u001b\[45m/g, '<span class="ansi-bg-magenta">') // Magenta background
        .replace(/\u001b\[46m/g, '<span class="ansi-bg-cyan">') // Cyan background
        .replace(/\u001b\[47m/g, '<span class="ansi-bg-white">') // White background
        // Bright background colors
        .replace(/\u001b\[100m/g, '<span class="ansi-bg-bright-black">') // Bright Black background
        .replace(/\u001b\[101m/g, '<span class="ansi-bg-bright-red">') // Bright Red background
        .replace(/\u001b\[102m/g, '<span class="ansi-bg-bright-green">') // Bright Green background
        .replace(/\u001b\[103m/g, '<span class="ansi-bg-bright-yellow">') // Bright Yellow background
        .replace(/\u001b\[104m/g, '<span class="ansi-bg-bright-blue">') // Bright Blue background
        .replace(/\u001b\[105m/g, '<span class="ansi-bg-bright-magenta">') // Bright Magenta background
        .replace(/\u001b\[106m/g, '<span class="ansi-bg-bright-cyan">') // Bright Cyan background
        .replace(/\u001b\[107m/g, '<span class="ansi-bg-bright-white">') // Bright White background

      // Handle complex sequences with multiple parameters (e.g., \u001b[1;31m for bold red)
      result = result.replace(/\u001b\[(\d+);(\d+)m/g, (_, p1, p2) => {
        let replacement = ''

        // Process first parameter
        if (p1 === '0') replacement += '</span><span>'
        else if (p1 === '1') replacement += '<span class="ansi-bold">'
        else if (p1 === '3') replacement += '<span class="ansi-italic">'
        else if (p1 === '4') replacement += '<span class="ansi-underline">'
        else if (p1 >= '30' && p1 <= '37') replacement += `<span class="ansi-${getColorName(parseInt(p1, 10) - 30)}">`
        else if (p1 >= '40' && p1 <= '47') replacement += `<span class="ansi-bg-${getColorName(parseInt(p1, 10) - 40)}">`
        else if (p1 >= '90' && p1 <= '97') replacement += `<span class="ansi-bright-${getColorName(parseInt(p1, 10) - 90)}">`
        else if (p1 >= '100' && p1 <= '107') replacement += `<span class="ansi-bg-bright-${getColorName(parseInt(p1, 10) - 100)}">`

        // Process second parameter
        if (p2 === '0') replacement += '</span><span>'
        else if (p2 === '1') replacement += '<span class="ansi-bold">'
        else if (p2 === '3') replacement += '<span class="ansi-italic">'
        else if (p2 === '4') replacement += '<span class="ansi-underline">'
        else if (p2 >= '30' && p2 <= '37') replacement += `<span class="ansi-${getColorName(parseInt(p2, 10) - 30)}">`
        else if (p2 >= '40' && p2 <= '47') replacement += `<span class="ansi-bg-${getColorName(parseInt(p2, 10) - 40)}">`
        else if (p2 >= '90' && p2 <= '97') replacement += `<span class="ansi-bright-${getColorName(parseInt(p2, 10) - 90)}">`
        else if (p2 >= '100' && p2 <= '107') replacement += `<span class="ansi-bg-bright-${getColorName(parseInt(p2, 10) - 100)}">`

        return replacement
      })

      // Clean up remaining unhandled escape sequences
      result = result.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      result = result.replace(/\u001b\[\??\d+[hl]/g, '')
      result = result.replace(/\u001b\[K/g, '')

      // Balance HTML tags
      const openTags = (result.match(/<span/g) || []).length
      const closeTags = (result.match(/<\/span>/g) || []).length

      if (openTags > closeTags) {
        result += '</span>'.repeat(openTags - closeTags)
      }

      return result
    }

    // Detect if it's command echo
    const isCommandEcho = (line: string): boolean => {
      // Strip HTML tags and ANSI codes for echo detection
      const cleanLine = processAnsiCodes(line)
        .replace(/<[^>]*>/g, '')
        .trim()

      // More precise command echo detection to avoid filtering legitimate output
      const isEcho =
        cleanLine.startsWith('bash -l -c') ||
        (cleanLine.includes(`echo "${startMarker}"`) && cleanLine.length > startMarker.length + 10) ||
        (cleanLine.includes(`echo "${endMarker}:$EXIT_CODE"`) && cleanLine.length > endMarker.length + 20) ||
        cleanLine === wrappedCommand.trim() ||
        // Only filter exact command matches that appear at the beginning (command echo)
        (cleanLine === commandToExecute && !commandStarted)

      // Log filtered echo for debugging
      if (isEcho) {
        console.log(`[JumpServer ${sessionId}] Filtering command echo: ${cleanLine.substring(0, 100)}...`)
      }

      return isEcho
    }

    const processLine = (line: string) => {
      const processedLine = processAnsiCodes(line)
      const cleanLine = processedLine.replace(/<[^>]*>/g, '').trim()

      // Enhanced debugging
      console.log(
        `[JumpServer ${sessionId}] Processing line: "${cleanLine.substring(0, 80)}..." (started: ${commandStarted}, completed: ${commandCompleted})`
      )

      // Detect and filter command echo
      if (!commandStarted && !commandEchoFiltered && isCommandEcho(line)) {
        return
      }

      // Detect command start marker
      if (cleanLine.includes(startMarker)) {
        commandStarted = true
        commandEchoFiltered = true
        console.log(`[JumpServer ${sessionId}] Detected command start marker`)
        return
      }

      // Detect command end marker
      if (cleanLine.includes(endMarker)) {
        if (!commandStarted) {
          console.log(`[JumpServer ${sessionId}] Detected end marker before start marker (likely command echo), skipping`)
          return
        }
        console.log(`[JumpServer ${sessionId}] Detected command end marker: ${cleanLine}`)
        const match = cleanLine.match(new RegExp(`${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`))
        if (match && match[1]) {
          exitCode = parseInt(match[1], 10)
          console.log(`[JumpServer ${sessionId}] Command exit code: ${exitCode}`)
        }

        // Complete command immediately
        if (!commandCompleted) {
          commandCompleted = true
          console.log(`[JumpServer ${sessionId}] Command execution completed, sending completed event`)

          // Send remaining buffer content
          if (lineBuffer && this.isListening) {
            const cleanBufferLine = processAnsiCodes(lineBuffer)
              .replace(/<[^>]*>/g, '')
              .trim()
            if (cleanBufferLine && !cleanBufferLine.includes(endMarker)) {
              this.emit('line', processAnsiCodes(lineBuffer))
            }
          }

          this.emit('completed')
          stream.removeListener('data', dataHandler)
          jumpserverMarkedCommands.delete(sessionId)
        }
        this.emit('continue')
        return
      }

      // Only send output lines after command start marker and before completion
      if (commandStarted && !commandCompleted) {
        // Allow empty lines (preserving file format) but exclude marker lines
        if (!cleanLine.includes(startMarker) && !cleanLine.includes(endMarker)) {
          this.emit('line', processedLine || '\n')
        }
      }
    }

    const dataHandler = (data: Buffer) => {
      if (commandCompleted) return

      const chunk = data.toString()
      this.fullOutput += chunk

      if (!this.isListening) return

      // Process data including buffer content
      let dataStr = lineBuffer + chunk
      const lines = dataStr.split(/\r?\n/)
      lineBuffer = lines.pop() || ''

      // Process complete lines
      for (const line of lines) {
        processLine(line)
      }

      // Check if buffer contains end marker (handle same-line case)
      if (lineBuffer.includes(endMarker)) {
        console.log(`[JumpServer ${sessionId}] Detected end marker in buffer: ${lineBuffer}`)
        processLine(lineBuffer)
        lineBuffer = ''
      }

      // Check if buffer contains start marker (handle same-line case)
      if (!commandStarted && lineBuffer.includes(startMarker)) {
        console.log(`[JumpServer ${sessionId}] Detected start marker in buffer: ${lineBuffer}`)
        processLine(lineBuffer)
        lineBuffer = ''
      }
    }

    stream.on('data', dataHandler)

    // Clear possible residual output before sending command
    console.log(`[JumpServer ${sessionId}] Sending wrapped command: ${wrappedCommand}`)
    stream.write(`${wrappedCommand}\r`)

    // Keep timeout mechanism as backup
    setTimeout(() => {
      if (!commandCompleted) {
        console.log(`[JumpServer ${sessionId}] Command execution timeout, forcing completion`)
        commandCompleted = true
        stream.removeListener('data', dataHandler)
        jumpserverMarkedCommands.delete(sessionId)
        this.emit('error', new Error('JumpServer command execution timeout'))
      }
    }, 30000)
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
    const rawInfo = info as Record<string, unknown>
    const assetUuid =
      info.assetUuid ??
      (typeof rawInfo.organization_uuid === 'string' ? (rawInfo.organization_uuid as string) : undefined) ??
      (typeof rawInfo.uuid === 'string' ? (rawInfo.uuid as string) : undefined)
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
      // Choose connection method based on sshType
      if (this.connectionInfo.sshType === 'jumpserver') {
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
          assetUuid
        }

        connectResult = await handleJumpServerConnection(jumpServerConnectionInfo)
        if (!connectResult || connectResult.status !== 'connected') {
          throw new Error('JumpServer connection failed: ' + (connectResult?.message || 'Unknown error'))
        }

        // Set ID for JumpServer connection
        connectResult.id = jumpServerConnectionInfo.id
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
  runCommand(terminalInfo: RemoteTerminalInfo, command: string, cwd?: string): RemoteTerminalProcessResultPromise {
    terminalInfo.busy = true
    terminalInfo.lastCommand = command
    const process = new RemoteTerminalProcess()
    this.processes.set(terminalInfo.id, process)
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
        if (terminalInfo.connectionInfo.sshType === 'jumpserver') {
          const { jumpServerDisconnect } = await import('./jumpserverHandle')
          await jumpServerDisconnect(terminalInfo.sessionId)
          console.log(`JumpServer terminal ${terminalId} (Session: ${terminalInfo.sessionId}) disconnected.`)
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
