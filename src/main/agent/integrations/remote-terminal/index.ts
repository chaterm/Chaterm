import { BrownEventEmitter } from './event'
import { remoteSshConnect, remoteSshExecStream, remoteSshDisconnect } from '../../../ssh/agentHandle'
import { remoteWsConnect, remoteWsExec, remoteWsDisconnect, RemoteWsConnectionInfo } from './ws'

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
  // For WebSocket connections, these are required.
  type?: 'ssh' | 'websocket'
  wsUrl?: string
  token?: string
  terminalId?: string
  email?: string
  organizationId?: string
  uid?: number | string
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
  private lastRetrievedIndex: number = 0
  isHot: boolean = false

  constructor() {
    super()
  }

  async run(sessionId: string, command: string, cwd?: string): Promise<void> {
    try {
      // Clean ANSI escape sequences from cwd
      const cleanCwd = cwd ? cwd.replace(/\x1B\[[^m]*m/g, '').replace(/\x1B\[[?][0-9]*[hl]/g, '') : undefined
      const commandToExecute = cleanCwd ? `cd ${cleanCwd} && ${command}` : command

      // Used to handle residual lines across chunks
      let lineBuffer = ''

      // Execute remote command via streaming method
      const execResult = await remoteSshExecStream(sessionId, commandToExecute, (chunk: string) => {
        // Accumulate full output
        this.fullOutput += chunk

        if (!this.isListening) return

        // Handle line splitting, keeping incomplete part at the end
        let data = lineBuffer + chunk
        const lines = data.split(/\r?\n/)
        lineBuffer = lines.pop() || '' // Last line might be incomplete, cache it

        for (const line of lines) {
          if (line.trim()) this.emit('line', line)
        }
        // Update retrieval index
        this.lastRetrievedIndex = this.fullOutput.length
      })

      // Handle remaining lines after command ends
      if (lineBuffer && this.isListening) {
        this.emit('line', lineBuffer)
      }

      if (execResult && execResult.success) {
        this.emit('completed')
      } else {
        const error = new Error(execResult?.error || '远程命令执行失败')
        this.emit('error', error)
        throw error
      }

      // Trigger continue for external promise resolution
      this.emit('continue')
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.log('Error event in catch:', err.message)
      console.log('Error stack:', err.stack)
      this.emit('error', err)
      throw err
    }
  }

  continue(): void {
    this.isListening = false
    this.emit('continue')
  }

  getUnretrievedOutput(): string {
    const unretrieved = this.fullOutput.slice(this.lastRetrievedIndex)
    this.lastRetrievedIndex = this.fullOutput.length
    return unretrieved
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
  private wsConnections: Map<string, string> = new Map() // connectionKey -> sessionId
  private nextTerminalId = 1
  private connectionInfo: ConnectionInfo | null = null

  constructor() {
    // Set default connection information
  }

  // Set SSH connection information
  setConnectionInfo(info: ConnectionInfo): void {
    this.connectionInfo = info
  }

  // Create new remote terminal
  async createTerminal(): Promise<RemoteTerminalInfo> {
    if (!this.connectionInfo) {
      throw new Error('Connection information not set, please call setConnectionInfo() first')
    }

    // WebSocket connection logic
    if (this.connectionInfo.type === 'websocket') {
      const { wsUrl, token, terminalId, host, organizationId, uid } = this.connectionInfo
      if (!wsUrl || !terminalId || !host || !organizationId || uid === undefined) {
        throw new Error('WebSocket connection missing wsUrl, terminalId, host, organizationId, or uid')
      }

      // Create unique key using IP, organizationId, and uid
      const connectionKey = `${host}:${organizationId}:${uid}`

      // Check if this connection already exists
      const existingSessionId = this.wsConnections.get(connectionKey)
      if (existingSessionId) {
        const existingTerminal = Array.from(this.terminals.values()).find((t) => t.sessionId === existingSessionId)
        if (existingTerminal) {
          console.log(`Reusing existing WebSocket connection: ${connectionKey}`)
          return existingTerminal
        } else {
          // If there is a record in the connection pool, but not in the terminal list, it means the state is inconsistent, remove the invalid record
          this.wsConnections.delete(connectionKey)
        }
      }

      const wsInfo: RemoteWsConnectionInfo = {
        wsUrl: wsUrl,
        token: token,
        terminalId: terminalId
      }
      const connectResult = await remoteWsConnect(wsInfo)
      if (!('id' in connectResult)) {
        throw new Error('WebSocket connection failed: ' + (connectResult.error || 'Unknown error'))
      }

      const newSessionId = connectResult.id
      this.wsConnections.set(connectionKey, newSessionId) // Store new connection

      const terminalInfo: RemoteTerminalInfo = {
        id: this.nextTerminalId++,
        sessionId: newSessionId,
        busy: false,
        lastCommand: '',
        connectionInfo: this.connectionInfo,
        terminal: { show: () => {} }
      }
      this.terminals.set(terminalInfo.id, terminalInfo)
      return terminalInfo
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
      const connectResult = await remoteSshConnect(this.connectionInfo)
      if (!connectResult || !connectResult.id) {
        throw new Error('SSH connection failed: ' + (connectResult?.error || 'Unknown error'))
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
      if (terminalInfo.connectionInfo.type === 'websocket') {
        remoteWsExec(terminalInfo.sessionId, command)
          .then((execResult) => {
            if (execResult.success) {
              const output = execResult.output || ''
              process['fullOutput'] = output
              if (output) {
                const lines = output.split('\n')
                for (const line of lines) {
                  if (line.trim()) process.emit('line', line)
                }
              }
              console.log('WebSocket command executed successfully')
              process.emit('completed')
              process.emit('continue')
            } else {
              const error = new Error(execResult.error || 'WebSocket command execution failed')
              process.emit('error', error)
              reject(error)
            }
          })
          .catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err))
            process.emit('error', error)
            reject(error)
          })
      } else {
        process.run(terminalInfo.sessionId, command, cwd).catch(reject)
      }
    })
    const result = mergeRemotePromise(process, promise)
    return result
  }

  // Get unretrieved output
  getUnretrievedOutput(terminalId: number): string {
    const process = this.processes.get(terminalId)
    return process ? process.getUnretrievedOutput() : ''
  }

  // Check if process is hot
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
    this.wsConnections.clear() // Clear WebSocket connection pool
    console.log('All remote terminals closed.')
  }

  // Disconnect specified terminal connection
  async disconnectTerminal(terminalId: number): Promise<void> {
    const terminalInfo = this.terminals.get(terminalId)
    if (terminalInfo) {
      this.processes.delete(terminalId)
      this.terminals.delete(terminalId)
      try {
        if (terminalInfo.connectionInfo.type === 'websocket') {
          const { host, organizationId, uid } = terminalInfo.connectionInfo
          if (host && organizationId && uid !== undefined) {
            const connectionKey = `${host}:${organizationId}:${uid}`
            this.wsConnections.delete(connectionKey)
          }
          await remoteWsDisconnect(terminalInfo.sessionId)
          console.log(`WebSocket terminal ${terminalId} (Session: ${terminalInfo.sessionId}) disconnected.`)
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
