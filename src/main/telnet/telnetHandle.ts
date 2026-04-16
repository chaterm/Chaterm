import net from 'net'
import type { WebContents } from 'electron'
import { TelnetParser } from './telnetParser'

const logger = createLogger('telnet')

// Active telnet connections: sessionId -> socket
const telnetConnections = new Map<string, net.Socket>()
// Active telnet parsers: sessionId -> parser
const telnetParsers = new Map<string, TelnetParser>()
// Track manual disconnects
const manualDisconnectSessions = new Set<string>()

// Marker-based command tracking (same pattern as SSH markedCommands)
interface MarkedCommand {
  marker: string
  output: string
  rawChunks: Uint8Array[]
  rawBytes: number
  completed: boolean
  lastActivity: number
  idleTimer: NodeJS.Timeout | null
}
const telnetMarkedCommands = new Map<string, MarkedCommand>()
// Store WebContents reference per session for marker flush
const sessionSenders = new Map<string, WebContents>()

// Buffer flush config (same strategy as sshHandle.ts)
const FLUSH_CONFIG = {
  INSTANT_SIZE: 16,
  INSTANT_DELAY: 0,
  SMALL_SIZE: 256,
  SMALL_DELAY: 10,
  LARGE_SIZE: 1024,
  LARGE_DELAY: 30,
  BULK_DELAY: 50
}
const MAX_BUFFER_SIZE = 64 * 1024

function getDelayByBufferSize(size: number): number {
  if (size < FLUSH_CONFIG.INSTANT_SIZE) return FLUSH_CONFIG.INSTANT_DELAY
  if (size < FLUSH_CONFIG.SMALL_SIZE) return FLUSH_CONFIG.SMALL_DELAY
  if (size < FLUSH_CONFIG.LARGE_SIZE) return FLUSH_CONFIG.LARGE_DELAY
  return FLUSH_CONFIG.BULK_DELAY
}

// Network error detection
const NETWORK_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'EPIPE',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ECONNREFUSED'
])

function isNetworkError(err: any): boolean {
  const code = String(err?.code || '').toUpperCase()
  return NETWORK_ERROR_CODES.has(code)
}

export interface TelnetConnectionInfo {
  id: string
  host: string
  port: number
  username?: string
  password?: string
  terminalType?: string
  cols?: number
  rows?: number
  connectTimeout?: number
}

/**
 * Connect to a Telnet server.
 * Reuses the same IPC channels as SSH (ssh:shell:data / ssh:shell:close) so
 * the renderer does not need protocol-specific handling.
 */
export function telnetConnect(event: { sender: WebContents }, info: TelnetConnectionInfo): Promise<{ status: string; message?: string }> {
  const { id, host, port, username, password, terminalType, cols, rows, connectTimeout } = info

  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const timeout = connectTimeout || 15000

    const parser = new TelnetParser({
      terminalType: terminalType || 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24
    })

    // Auto-login state machine
    const autoLogin = {
      enabled: !!(username || password),
      sentUsername: false,
      sentPassword: false,
      completed: false,
      buffer: ''
    }

    const LOGIN_PROMPTS = /(?:login|username|user name|account)\s*[:\uff1a]\s*$/i
    const PASSWORD_PROMPTS = /(?:password|passwd)\s*[:\uff1a]\s*$/i

    const tryAutoLogin = (text: string) => {
      if (!autoLogin.enabled || autoLogin.completed) return
      autoLogin.buffer += text

      if (!autoLogin.sentUsername && LOGIN_PROMPTS.test(autoLogin.buffer)) {
        if (username && socket.writable) {
          socket.write(username + '\r\n')
          autoLogin.sentUsername = true
          autoLogin.buffer = ''
          logger.info('Telnet auto-login: username sent', {
            event: 'telnet.autologin.username',
            connectionId: id
          })
        }
      } else if (!autoLogin.sentPassword && PASSWORD_PROMPTS.test(autoLogin.buffer)) {
        if (password && socket.writable) {
          socket.write(password + '\r\n')
          autoLogin.sentPassword = true
          autoLogin.completed = true
          autoLogin.buffer = ''
          logger.info('Telnet auto-login: password sent', {
            event: 'telnet.autologin.password',
            connectionId: id
          })
        }
      }

      // Prevent buffer from growing indefinitely
      if (autoLogin.buffer.length > 1024) {
        autoLogin.buffer = autoLogin.buffer.slice(-512)
      }
    }

    // Connection timeout
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Connection timed out'))
    }, timeout)

    socket.connect(port, host, () => {
      clearTimeout(timer)
      telnetConnections.set(id, socket)
      telnetParsers.set(id, parser)
      sessionSenders.set(id, event.sender)

      logger.info('Telnet connection established', {
        event: 'telnet.connect.success',
        connectionId: id,
        port
      })

      resolve({ status: 'connected' })
    })

    // Data buffering (same pattern as sshHandle.ts)
    let bufferChunks: string[] = []
    let bufferLength = 0
    let rawChunks: Buffer[] = []
    let rawBytes = 0
    let flushTimer: NodeJS.Timeout | null = null

    const flushBuffer = () => {
      if (!bufferLength && rawBytes === 0) return
      const data = bufferChunks.join('')
      const raw = rawBytes ? Buffer.concat(rawChunks, rawBytes) : undefined
      bufferChunks = []
      bufferLength = 0
      rawChunks = []
      rawBytes = 0
      flushTimer = null
      event.sender.send(`ssh:shell:data:${id}`, { data, raw, marker: '' })
    }

    const scheduleFlush = () => {
      // Force immediate flush when buffer exceeds max size to prevent unbounded growth
      if (bufferLength >= MAX_BUFFER_SIZE) {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        flushBuffer()
        return
      }

      // Only start a new timer if one is not already pending (prevents timer starvation)
      if (!flushTimer) {
        const delay = getDelayByBufferSize(bufferLength)
        if (delay === 0) {
          flushBuffer()
        } else {
          flushTimer = setTimeout(flushBuffer, delay)
        }
      }
    }

    socket.on('data', (rawData: Buffer) => {
      try {
        const { cleanData, responses } = parser.parse(rawData)

        // Send negotiation responses back to server
        for (const resp of responses) {
          if (socket.writable) socket.write(resp)
        }

        if (cleanData.length === 0) return

        const textData = cleanData.toString('utf-8')

        // Try auto-login when credentials are provided
        tryAutoLogin(textData)

        // Check for marker-based command tracking
        const markedCmd = telnetMarkedCommands.get(id)
        if (markedCmd !== undefined) {
          markedCmd.output += textData
          markedCmd.rawChunks.push(cleanData)
          markedCmd.rawBytes += cleanData.length
          markedCmd.lastActivity = Date.now()
          if (markedCmd.idleTimer) clearTimeout(markedCmd.idleTimer)
          markedCmd.idleTimer = setTimeout(() => {
            if (markedCmd && !markedCmd.completed) {
              markedCmd.completed = true
              const markedRaw = markedCmd.rawBytes ? Buffer.concat(markedCmd.rawChunks, markedCmd.rawBytes) : undefined
              event.sender.send(`ssh:shell:data:${id}`, {
                data: markedCmd.output,
                raw: markedRaw,
                marker: markedCmd.marker
              })
              telnetMarkedCommands.delete(id)
            }
          }, 100)
          return
        }

        bufferChunks.push(textData)
        bufferLength += textData.length
        rawChunks.push(cleanData)
        rawBytes += cleanData.length
        scheduleFlush()
      } catch (err) {
        logger.error('Telnet data processing error', {
          event: 'telnet.data.error',
          connectionId: id,
          error: err
        })
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timer)
      logger.error('Telnet connection error', {
        event: 'telnet.error',
        connectionId: id,
        errorCode: (err as any).code,
        isNetwork: isNetworkError(err)
      })

      // If connection was never established, reject the promise
      if (!telnetConnections.has(id)) {
        reject(err)
      }
    })

    socket.on('close', (hadError) => {
      // Flush any remaining buffered data before closing
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      flushBuffer()

      const wasManual = manualDisconnectSessions.has(id)
      manualDisconnectSessions.delete(id)

      event.sender.send(`ssh:shell:close:${id}`, {
        reason: wasManual ? 'manual' : hadError ? 'network' : 'unknown',
        isNetworkDisconnect: hadError && !wasManual,
        errorCode: hadError ? 'CONNECTION_CLOSED' : undefined,
        errorMessage: hadError ? 'Connection closed with error' : undefined
      })

      telnetConnections.delete(id)
      telnetParsers.delete(id)
      sessionSenders.delete(id)
      const markedCmd = telnetMarkedCommands.get(id)
      if (markedCmd?.idleTimer) clearTimeout(markedCmd.idleTimer)
      telnetMarkedCommands.delete(id)

      logger.info('Telnet connection closed', {
        event: 'telnet.close',
        connectionId: id,
        hadError,
        wasManual
      })
    })

    socket.on('timeout', () => {
      logger.warn('Telnet socket idle timeout', {
        event: 'telnet.timeout',
        connectionId: id
      })
      socket.destroy()
    })
  })
}

/**
 * Write data to a Telnet session.
 * Supports optional marker for command output tracking (same as SSH marker mechanism).
 */
export function telnetWrite(id: string, data: string, marker?: string): void {
  const socket = telnetConnections.get(id)
  if (!socket || !socket.writable) {
    logger.warn('Telnet write to closed session', { connectionId: id })
    return
  }

  // Set up marker-based command tracking
  if (marker) {
    // Clear any existing marker for this session
    const existing = telnetMarkedCommands.get(id)
    if (existing?.idleTimer) clearTimeout(existing.idleTimer)
    telnetMarkedCommands.set(id, {
      marker,
      output: '',
      rawChunks: [] as Uint8Array[],
      rawBytes: 0,
      completed: false,
      lastActivity: Date.now(),
      idleTimer: null
    })
  }

  socket.write(data)
}

/**
 * Resize the Telnet terminal (sends NAWS if negotiated).
 */
export function telnetResize(id: string, cols: number, rows: number): void {
  const parser = telnetParsers.get(id)
  const socket = telnetConnections.get(id)
  if (!parser || !socket || !socket.writable) return

  const nawsData = parser.setWindowSize(cols, rows)
  if (nawsData) {
    socket.write(nawsData)
  }
}

/**
 * Disconnect a Telnet session.
 */
export function telnetDisconnect(id: string): void {
  manualDisconnectSessions.add(id)
  const socket = telnetConnections.get(id)
  if (socket) {
    socket.destroy()
  }
  telnetConnections.delete(id)
  telnetParsers.delete(id)
  sessionSenders.delete(id)
  const markedCmd = telnetMarkedCommands.get(id)
  if (markedCmd?.idleTimer) clearTimeout(markedCmd.idleTimer)
  telnetMarkedCommands.delete(id)
}

/**
 * Check if a session is a Telnet connection.
 */
export function isTelnetSession(id: string): boolean {
  return telnetConnections.has(id)
}
