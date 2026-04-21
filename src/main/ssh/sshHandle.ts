import { BrowserWindow, dialog, ipcMain } from 'electron'
import { Client } from 'ssh2'
import { telnetConnect, telnetWrite, telnetResize, telnetDisconnect, isTelnetSession } from '../telnet'
import type { SFTPWrapper } from 'ssh2'
import { spawn } from 'child_process'
import { Duplex } from 'stream'
import type { CommandGenerationContext } from '@shared/WebviewMessage'
const logger = createLogger('ssh')

function safeAppPath(): string {
  try {
    const { app } = require('electron') as { app?: { getAppPath?: () => string } }
    if (app?.getAppPath) return app.getAppPath()
  } catch {}
  return process.cwd()
}

const appPath = safeAppPath()
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
  logger.warn('Failed to read package.json', { event: 'ssh.config', error: error })
  // Provide a default packageInfo object if both paths fail
  packageInfo = { name: 'chaterm', version: 'unknown' }
}
import { createProxySocket } from './proxy'
import { buildErrorResponse } from './jumpserver/errorUtils'

import {
  jumpserverConnections,
  handleJumpServerConnection,
  jumpserverShellStreams,
  jumpserverExecStreams,
  jumpserverMarkedCommands,
  jumpserverConnectionStatus,
  jumpserverLastCommand,
  createJumpServerExecStream,
  executeCommandOnJumpServerExec,
  jumpserverSessionPids
} from './jumpserverHandle'
import path from 'path'
import fs from 'fs'
import { SSHAgentManager } from './ssh-agent/ChatermSSHAgent'
import { getAlgorithmsByAssetType } from './algorithms'
import { connectBastionByType, shellBastionSession, resizeBastionSession, writeBastionSession, disconnectBastionSession } from './bastionPlugin'
import { shouldSkipPostConnectProbe } from './postConnectProbePolicy'
import { sftpConnectionInfoMap } from './sftpTransfer'

// Maximum buffer size before forcing an immediate flush (prevents unbounded growth during bulk output)
const MAX_BUFFER_SIZE = 64 * 1024 // 64KB

// Hybrid buffer strategy configuration
const FLUSH_CONFIG = {
  INSTANT_SIZE: 16, // < 16 bytes: send immediately (user input)
  INSTANT_DELAY: 0, // 0ms
  SMALL_SIZE: 256, // < 256 bytes: short delay
  SMALL_DELAY: 10, // 10ms
  LARGE_SIZE: 1024, // < 1KB: medium delay
  LARGE_DELAY: 30, // 30ms
  BULK_DELAY: 50 // >= 1KB: long delay (bulk output)
}

// Helper function to determine delay based on buffer size
const getDelayByBufferSize = (size: number): number => {
  if (size < FLUSH_CONFIG.INSTANT_SIZE) {
    return FLUSH_CONFIG.INSTANT_DELAY
  } else if (size < FLUSH_CONFIG.SMALL_SIZE) {
    return FLUSH_CONFIG.SMALL_DELAY
  } else if (size < FLUSH_CONFIG.LARGE_SIZE) {
    return FLUSH_CONFIG.LARGE_DELAY
  } else {
    return FLUSH_CONFIG.BULK_DELAY
  }
}

// Store SSH connections
export const sshConnections = new Map()

// SSH connection reuse pool: stores connections that have passed MFA authentication
interface ReusableConnection {
  conn: any // SSH Client
  sessions: Set<string> // Set of session IDs using this connection
  host: string
  port: number
  username: string
  hasMfaAuth: boolean // Flag indicating whether MFA authentication has been completed
}
export const sshConnectionPool = new Map<string, ReusableConnection>()

// Generate unique key for connection pool
export const getConnectionPoolKey = (host: string, port: number, username: string): string => {
  return `${host}:${port}:${username}`
}

interface SftpConnectionInfo {
  isSuccess: boolean
  sftp?: any
  error?: string
}
export const sftpConnections = new Map<string, SftpConnectionInfo>()

// Execute command result
export interface ExecResult {
  stdout: string
  stderr: string
  exitCode?: number
  exitSignal?: string
}

// Store shell session streams
const shellStreams = new Map()
const markedCommands = new Map()

const KeyboardInteractiveAttempts = new Map()
export const connectionStatus = new Map()

export const sshSessionPids = new Map<string, number>()

// Track how a shell session ended so renderer can decide whether to auto reconnect.
type ShellCloseReason = 'manual' | 'network' | 'unknown'

type ShellCloseInfoPayload = {
  reason: ShellCloseReason
  isNetworkDisconnect: boolean
  errorCode?: string
  errorMessage?: string
}

const manualDisconnectSessions = new Set<string>()
// Per-session close metadata consumed once when shell close is emitted to renderer.
const lastConnectionErrorBySession = new Map<string, { errorCode?: string; errorMessage?: string; isNetwork: boolean }>()
const pendingShellCloseInfoBySession = new Map<string, ShellCloseInfoPayload>()

// Known socket/network error codes that indicate network interruption.
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

// Message pattern fallback for errors that do not expose a stable error code.
const NETWORK_ERROR_PATTERNS = [
  /timed out/i,
  /keepalive/i,
  /connection lost/i,
  /connection reset/i,
  /socket hang up/i,
  /network is unreachable/i,
  /not reachable/i,
  /broken pipe/i
]

// Classify whether an SSH/connect error is likely caused by network break.
const isLikelyNetworkDisconnect = (err: any): boolean => {
  const code = String(err?.code || err?.errno || '').toUpperCase()
  const message = String(err?.message || '')

  if (code && NETWORK_ERROR_CODES.has(code)) {
    return true
  }

  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

// Cache close reason so shell close IPC can report a precise disconnect reason.
const setPendingShellCloseInfo = (sessionId: string, info: ShellCloseInfoPayload) => {
  if (!sessionId) return
  pendingShellCloseInfoBySession.set(sessionId, info)
  logger.info('Pending shell close info updated', {
    event: 'ssh.shell.close.pending',
    connectionId: sessionId,
    reason: info.reason,
    isNetworkDisconnect: info.isNetworkDisconnect,
    errorCode: info.errorCode,
    errorMessage: info.errorMessage
  })
}

// Record the latest connection failure for later close/end event classification.
const recordSessionConnectionError = (sessionId: string, err: any) => {
  if (!sessionId) return
  const errorCode = String(err?.code || err?.errno || '').toUpperCase() || undefined
  const errorMessage = String(err?.message || '').trim() || undefined
  const isNetwork = isLikelyNetworkDisconnect(err)

  lastConnectionErrorBySession.set(sessionId, {
    errorCode,
    errorMessage,
    isNetwork
  })

  setPendingShellCloseInfo(sessionId, {
    reason: isNetwork ? 'network' : 'unknown',
    isNetworkDisconnect: isNetwork,
    errorCode,
    errorMessage
  })

  logger.info('Session connection error recorded', {
    event: 'ssh.session.error.recorded',
    connectionId: sessionId,
    errorCode,
    errorMessage,
    isNetworkDisconnect: isNetwork
  })
}

// Clear reconnect-related transient state for a session.
const clearSessionConnectionState = (sessionId: string) => {
  if (!sessionId) return
  manualDisconnectSessions.delete(sessionId)
  lastConnectionErrorBySession.delete(sessionId)
  pendingShellCloseInfoBySession.delete(sessionId)
}

// Consume close metadata once to prevent duplicate reconnect decisions.
const consumeShellCloseInfo = (sessionId: string): ShellCloseInfoPayload => {
  if (!sessionId) {
    return { reason: 'unknown', isNetworkDisconnect: false }
  }

  if (manualDisconnectSessions.has(sessionId)) {
    clearSessionConnectionState(sessionId)
    return {
      reason: 'manual',
      isNetworkDisconnect: false
    }
  }

  const pending = pendingShellCloseInfoBySession.get(sessionId)
  if (pending) {
    pendingShellCloseInfoBySession.delete(sessionId)
    lastConnectionErrorBySession.delete(sessionId)
    return pending
  }

  const lastError = lastConnectionErrorBySession.get(sessionId)
  if (lastError) {
    lastConnectionErrorBySession.delete(sessionId)
    return {
      reason: lastError.isNetwork ? 'network' : 'unknown',
      isNetworkDisconnect: lastError.isNetwork,
      errorCode: lastError.errorCode,
      errorMessage: lastError.errorMessage
    }
  }

  return { reason: 'unknown', isNetworkDisconnect: false }
}

// Set KeyboardInteractive authentication timeout (milliseconds)
export const KeyboardInteractiveTimeout = 300000 // 5 minutes timeout
const MaxKeyboardInteractiveAttempts = 5 // Max KeyboardInteractive attempts

const EventEmitter = require('events')
const connectionEvents = new EventEmitter()

// Cache
export const keyboardInteractiveOpts = new Map<string, string[]>()

export const getReusableSshConnection = (host: string, port: number, username: string) => {
  const poolKey = getConnectionPoolKey(host, port, username)
  const reusableConn = sshConnectionPool.get(poolKey)
  if (!reusableConn || !reusableConn.hasMfaAuth) {
    return null
  }

  const client = reusableConn.conn as Client | undefined
  if (!client || (client as any)?._sock?.destroyed) {
    sshConnectionPool.delete(poolKey)
    return null
  }

  return {
    poolKey,
    conn: client
  }
}

export const registerReusableSshSession = (poolKey: string, sessionId: string) => {
  const reusableConn = sshConnectionPool.get(poolKey)
  if (reusableConn) {
    reusableConn.sessions.add(sessionId)
  }
}

// ============================================================================
// Wakeup Agent Reuse — Pool Entry & Lookup
// ============================================================================
// Technical route (wakeup connection pooling for agent reuse):
//
//   Xshell wakeup -> renderer openTerminalFromXshellWakeup -> currentClickServer(node)
//   -> sshConnect.vue sets wakeupSource on connectionInfo
//   -> handleAttemptConnection conn.on('ready') detects wakeupSource
//   -> saves connection to sshConnectionPool with hasMfaAuth:true
//   -> agent later calls findWakeupConnectionInfoByHost(hostIP) to locate the pooled connection
//
// Why not SSH exec: Wakeup bastion servers intercept exec channels as tunnels;
// command arguments are ignored. Only conn.shell() + marker extraction works.
//
// Key constraint: wakeup connections use password auth (not keyboard-interactive),
// so the pool-save condition checks `connectionInfo.wakeupSource` in addition to
// the original `keyboardInteractiveOpts.has(id)` check.
// ============================================================================

// Find a wakeup (MFA-authed) connection in the pool by host IP.
// Returns { host, port, username } so the agent can build a ConnectionInfo
// when the asset UUID is not in the database (wakeup-created tabs).
export const findWakeupConnectionInfoByHost = (host: string): { host: string; port: number; username: string } | null => {
  for (const [, entry] of sshConnectionPool) {
    if (entry.hasMfaAuth && entry.host === host) {
      const client = entry.conn as Client | undefined
      if (client && !(client as any)?._sock?.destroyed) {
        return { host: entry.host, port: entry.port, username: entry.username }
      }
    }
  }
  return null
}

export const releaseReusableSshSession = (poolKey: string, sessionId: string) => {
  const reusableConn = sshConnectionPool.get(poolKey)
  if (reusableConn) {
    reusableConn.sessions.delete(sessionId)
  }
}

export const handleRequestKeyboardInteractive = (event, id, prompts, finish) => {
  return new Promise((_resolve, reject) => {
    // Get current retry count
    const attemptCount = KeyboardInteractiveAttempts.get(id) || 0

    // Check if maximum retry attempts exceeded
    if (attemptCount >= MaxKeyboardInteractiveAttempts) {
      KeyboardInteractiveAttempts.delete(id)
      // Send final failure event
      event.sender.send('ssh:keyboard-interactive-result', {
        id,
        attempts: attemptCount,
        status: 'failed',
        final: true
      })
      reject(new Error('Maximum authentication attempts reached'))
      return
    }

    // Set retry count
    KeyboardInteractiveAttempts.set(id, attemptCount + 1)

    // Send MFA request to frontend
    event.sender.send('ssh:keyboard-interactive-request', {
      id,
      prompts: prompts.map((p) => p.prompt)
    })

    // Set timeout
    const timeoutId = setTimeout(() => {
      // Remove listener
      ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${id}`)
      ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${id}`)

      // Cancel authentication
      finish([])
      KeyboardInteractiveAttempts.delete(id)
      event.sender.send('ssh:keyboard-interactive-timeout', { id })
      reject(new Error('Authentication timed out, please try connecting again'))
    }, KeyboardInteractiveTimeout)

    // Listen for user response
    ipcMain.once(`ssh:keyboard-interactive-response:${id}`, (_evt, responses) => {
      clearTimeout(timeoutId) // Clear timeout timer
      finish(responses)

      // Listen for connection status changes to determine verification result
      const statusHandler = (status) => {
        if (status.isVerified) {
          // Verification successful
          keyboardInteractiveOpts.set(id, responses)
          KeyboardInteractiveAttempts.delete(id)
          event.sender.send('ssh:keyboard-interactive-result', {
            id,
            status: 'success'
          })
        } else {
          // Verification failed
          const currentAttempts = KeyboardInteractiveAttempts.get(id) || 0
          event.sender.send('ssh:keyboard-interactive-result', {
            id,
            attempts: currentAttempts,
            status: 'failed'
          })
          // SSH connection will automatically retrigger keyboard-interactive event for retry
        }
        connectionEvents.removeListener(`connection-status-changed:${id}`, statusHandler)
      }

      connectionEvents.once(`connection-status-changed:${id}`, statusHandler)
    })

    // Listen for user cancellation
    ipcMain.once(`ssh:keyboard-interactive-cancel:${id}`, () => {
      KeyboardInteractiveAttempts.delete(id)
      clearTimeout(timeoutId)
      finish([])
      reject(new Error('Authentication cancelled'))
    })
  })
}

export const attemptSecondaryConnection = async (event, connectionInfo, existingConn?: Client) => {
  const { id, asset_type } = connectionInfo

  // Check if this is a network device connection (switch or router)
  const isSwitch = asset_type?.startsWith('person-switch-')
  const isRouter = asset_type?.startsWith('person-router-')
  const isNetworkDevice = isSwitch || isRouter
  const switchBrand = isSwitch
    ? asset_type === 'person-switch-cisco'
      ? 'cisco'
      : asset_type === 'person-switch-huawei'
        ? 'huawei'
        : asset_type === 'person-switch-ruijie'
          ? 'ruijie'
          : 'h3c'
    : null
  const routerBrand = isRouter ? (asset_type === 'person-router-ruijie' ? 'ruijie' : null) : null
  const deviceBrand = switchBrand || routerBrand

  // For network devices, skip secondary connection logic and return minimal ready data
  if (isNetworkDevice && deviceBrand) {
    const readyResult = {
      isSwitch: true,
      switchBrand: deviceBrand,
      hasSudo: false,
      commandList: []
    }
    event.sender.send(`ssh:connect:data:${id}`, readyResult)
    if (keyboardInteractiveOpts.has(id)) {
      keyboardInteractiveOpts.delete(id)
    }
    return
  }

  if (shouldSkipPostConnectProbe(connectionInfo)) {
    const readyResult = {
      hasSudo: false,
      commandList: []
    }
    event.sender.send(`ssh:connect:data:${id}`, readyResult)
    if (keyboardInteractiveOpts.has(id)) {
      keyboardInteractiveOpts.delete(id)
    }
    logger.info('Skip post-connect probe for wakeup/direct session', {
      event: 'ssh.connect.probe.skip',
      connectionId: id,
      source: connectionInfo?.wakeupSource || connectionInfo?.source || 'unknown'
    })
    return
  }

  const readyResult: { hasSudo?: boolean; commandList?: string[] } = {}
  if (existingConn) {
    try {
      await initSftpOnConnection(existingConn, id, connectionInfo)
    } catch {
      connectionStatus.set(id, { sftpAvailable: false, sftpError: 'SFTP connection failed' })
    }

    // cmd list
    const cmdCheck = () =>
      new Promise<void>((resolve) => {
        let stdout = ''
        let stderr = ''
        existingConn.exec(
          'sh -c \'if command -v bash >/dev/null 2>&1; then bash -lc "compgen -A builtin; compgen -A command"; bash -ic "compgen -A alias" 2>/dev/null; else IFS=:; for d in $PATH; do [ -d "$d" ] || continue; for f in "$d"/*; do [ -x "$f" ] && printf "%s\\n" "${f##*/}"; done; done; fi\' | sort -u',
          (err, stream) => {
            if (err) {
              readyResult.commandList = []
              resolve()
              return
            }
            stream
              .on('data', (data: Buffer) => (stdout += data.toString('utf8')))
              .stderr.on('data', (data: Buffer) => (stderr += data.toString('utf8')))
            stream.on('close', () => {
              readyResult.commandList = stderr ? [] : stdout.split('\n').filter(Boolean)
              resolve()
            })
          }
        )
      })

    // sudo check
    const sudoCheck = () =>
      new Promise<void>((resolve) => {
        existingConn.exec('sudo -n true 2>/dev/null && echo true || echo false', (err, stream) => {
          if (err) {
            readyResult.hasSudo = false
            resolve()
            return
          }
          stream
            .on('data', (data: Buffer) => {
              readyResult.hasSudo = data.toString('utf8').trim() === 'true'
            })
            .stderr.on('data', () => {
              readyResult.hasSudo = false
            })
          stream.on('close', () => resolve())
        })
      })

    await Promise.allSettled([cmdCheck(), sudoCheck()])
    event.sender.send(`ssh:connect:data:${id}`, readyResult)
    if (keyboardInteractiveOpts.has(id)) {
      keyboardInteractiveOpts.delete(id)
    }
    return
  }
}

function splitCommand(cmd: string): string[] {
  return cmd.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((s) => s.replace(/^"(.*)"$/, '$1')) || []
}

export async function createProxyCommandSocket(commandStr: string, host: string, port: number): Promise<any> {
  const replaced = commandStr.replace(/%h/g, host).replace(/%p/g, String(port))

  // Use shell: true to handle cmd.exe /c command under Windows
  const isWindowsCmd = process.platform === 'win32' && replaced.trim().startsWith('cmd.exe /c')

  let proc
  if (isWindowsCmd) {
    proc = spawn(replaced, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true,
      shell: true
    })
  } else if (replaced.trim().startsWith('sh -c ')) {
    let cmdString = replaced.trim().slice(6).trim()

    if ((cmdString.startsWith('"') && cmdString.endsWith('"')) || (cmdString.startsWith("'") && cmdString.endsWith("'"))) {
      cmdString = cmdString.slice(1, -1)
    }
    proc = spawn('sh', ['-c', cmdString], {
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true
    })
  } else {
    // segmentation parameters
    const [cmd, ...args] = splitCommand(replaced)
    proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true
    })
  }

  // Create bidirectional packaging flow
  const socketProxy = new Duplex({
    read() {
      /* No-op: Data is pushed externally from process stdout */
    },
    write(chunk, encoding, callback) {
      if (proc.stdin && proc.stdin.writable) {
        proc.stdin.write(chunk, encoding, callback)
      } else {
        callback(new Error('ProxyCommand stdin is not writable'))
      }
    }
  })

  // Bridge the stdout data of the child process to the wrapper stream
  proc.stdout.on('data', (chunk) => {
    if (!socketProxy.push(chunk)) {
      proc.stdout.pause()
    }
  })

  // backpressure handling
  socketProxy.on('drain', () => {
    if (proc.stdout.isPaused()) {
      proc.stdout.resume()
    }
  })

  const cleanup = () => {
    if (proc && !proc.killed) proc.kill()
    if (!socketProxy.destroyed) socketProxy.destroy()
  }

  proc.stdout.on('end', () => socketProxy.push(null))
  proc.on('error', (err) => socketProxy.emit('error', err))
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      socketProxy.emit('error', new Error(`Exit code ${code}`))
    }
  })

  socketProxy.on('close', cleanup)
  socketProxy.on('finish', () => {
    if (proc.stdin && proc.stdin.writable) proc.stdin.end()
  })
  ;(socketProxy as any).writable = true
  ;(socketProxy as any).readable = true

  return socketProxy
}
const handleAttemptConnection = async (event, connectionInfo, resolve, reject, retryCount) => {
  const {
    id,
    host,
    port,
    username,
    password,
    privateKey,
    passphrase,
    agentForward,
    needProxy,
    proxyConfig,
    connIdentToken,
    asset_type,
    proxyCommand
  } = connectionInfo
  retryCount++
  clearSessionConnectionState(id)

  logger.info('Starting SSH connection attempt', {
    event: 'ssh.connect.start',
    connectionId: id,
    port: port || 22,
    attempt: retryCount
  })

  connectionStatus.set(id, { isVerified: false }) // Update connection status
  const identToken = connIdentToken ? `_t=${connIdentToken}` : ''
  const ident = `${packageInfo.name}_${packageInfo.version}` + identToken

  // Check connection reuse pool: only attempt reuse when using keyboard-interactive authentication
  const poolKey = getConnectionPoolKey(host, port || 22, username)
  const reusableConn = sshConnectionPool.get(poolKey)

  if (reusableConn && reusableConn.hasMfaAuth) {
    logger.info('Detected reusable MFA connection', { event: 'ssh.reuse', connectionId: id })

    // Use existing connection
    const conn = reusableConn.conn

    // Mark current session as connected
    sshConnections.set(id, conn)
    connectionStatus.set(id, { isVerified: true })
    reusableConn.sessions.add(id)

    // Trigger connection success event
    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: true })

    // Execute secondary connection (sudo check, SFTP, etc.)
    attemptSecondaryConnection(event, connectionInfo, conn)

    logger.info('Successfully reused MFA connection', { event: 'ssh.reuse.success', connectionId: id })
    resolve({ status: 'connected', message: 'Connection successful (reused)' })
    return
  }

  const conn = new Client()

  conn.on('ready', () => {
    clearSessionConnectionState(id)
    sshConnections.set(id, conn) // Save connection object
    connectionStatus.set(id, { isVerified: true })
    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: true })

    // Check if keyboard-interactive authentication was used
    // Must check before attemptSecondaryConnection as it will clear keyboardInteractiveOpts
    const hasKeyboardInteractive = keyboardInteractiveOpts.has(id)
    const isWakeupConnection = !!connectionInfo.wakeupSource
    const shouldSaveToPool = hasKeyboardInteractive || isWakeupConnection

    // Save to connection pool for future agent reuse when:
    // 1. keyboard-interactive (MFA/OTP) authentication was used, OR
    // 2. this is a wakeup connection (password auth but needs agent reuse)
    if (shouldSaveToPool) {
      const poolKey = getConnectionPoolKey(host, port || 22, username)
      logger.info('Saving connection to pool', { event: 'ssh.pool.save', reason: isWakeupConnection ? 'wakeup' : 'keyboard-interactive' })

      sshConnectionPool.set(poolKey, {
        conn: conn,
        sessions: new Set([id]),
        host: host,
        port: port || 22,
        username: username,
        hasMfaAuth: true
      })

      // Listen for connection close event to clean up connection pool
      conn.on('close', () => {
        logger.info('Pooled connection closed, cleaning up', { event: 'ssh.pool.cleanup' })
        sshConnectionPool.delete(poolKey)
      })

      conn.on('error', (err) => {
        logger.error('Pooled connection error, cleaning up', { event: 'ssh.pool.error', error: err.message })
        sshConnectionPool.delete(poolKey)
      })
    }

    // Execute secondary connection (this will clear keyboardInteractiveOpts, so must be placed after the check)
    attemptSecondaryConnection(event, connectionInfo, conn)

    logger.info('SSH connection established', {
      event: 'ssh.connect.success',
      connectionId: id,
      port: port || 22
    })
    resolve({ status: 'connected', message: 'Connection successful' })
  })

  conn.on('error', (err) => {
    recordSessionConnectionError(id, err)
    connectionStatus.set(id, { isVerified: false })

    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: false })
    if (err.level === 'client-authentication' && KeyboardInteractiveAttempts.has(id)) {
      logger.info('Authentication failed, retrying', { event: 'ssh.auth.retry', connectionId: id, retryCount })

      if (retryCount < MaxKeyboardInteractiveAttempts) {
        handleAttemptConnection(event, connectionInfo, resolve, reject, retryCount)
      } else {
        reject(new Error('Maximum retries reached, authentication failed'))
      }
    } else {
      logger.error('SSH connection error', { event: 'ssh.error', connectionId: id, error: err.message })
      reject(new Error(err.message))
    }
  })

  // Configure connection settings
  const algorithms = getAlgorithmsByAssetType(asset_type)
  const connectConfig: any = {
    host,
    port: port || 22,
    username,
    keepaliveInterval: 10000, // Keep connection alive
    keepaliveCountMax: 3,
    tryKeyboard: true, // Enable keyboard interactive authentication
    readyTimeout: KeyboardInteractiveTimeout, // Connection timeout, 30 seconds
    algorithms
  }

  connectConfig.ident = ident

  if (agentForward) {
    const manager = SSHAgentManager.getInstance()
    // If using Agent authentication
    connectConfig.agent = manager.getAgent()
    connectConfig.agentForward = true
  }

  conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
    try {
      // Wait for user response
      await handleRequestKeyboardInteractive(event, id, prompts, finish)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.warn('SSH keyboard-interactive error', { event: 'ssh.keyboard-interactive.error', connectionId: id, error: errorMessage })

      // Only close connection when max retries exceeded, user cancelled, or timeout
      if (errorMessage.includes('Maximum authentication attempts') || errorMessage.includes('cancelled') || errorMessage.includes('timed out')) {
        conn.end() // Close connection
        reject(err)
      }
      // For other errors, let SSH connection handle naturally, may retrigger keyboard-interactive
    }
  })

  try {
    if (privateKey) {
      // Authenticate with private key
      connectConfig.privateKey = privateKey
      if (passphrase) {
        connectConfig.passphrase = passphrase
      }
    } else if (password) {
      // Authenticate with password
      connectConfig.password = password
    } else {
      reject(new Error('No valid authentication method provided'))
      return
    }

    try {
      if (proxyCommand) {
        connectConfig.sock = await createProxyCommandSocket(proxyCommand, host, port || 22)
        delete connectConfig.host
        delete connectConfig.port
      } else if (needProxy) {
        connectConfig.sock = await createProxySocket(proxyConfig, host, port)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return reject(new Error(`Failed to establish a transport layer tunnel: ${errorMessage}`))
    }
    conn.connect(connectConfig) // Attempt to connect
  } catch (err) {
    logger.error('Connection configuration error', { event: 'ssh.config.error', error: err })
    reject(new Error(`Connection configuration error: ${err}`))
  }

  // Classify unexpected transport close and preserve reason for renderer reconnect logic.
  conn.on('close', () => {
    if (manualDisconnectSessions.has(id)) {
      logger.info('SSH connection close ignored (manual disconnect)', {
        event: 'ssh.conn.close.manual',
        connectionId: id
      })
      return
    }

    const existing = pendingShellCloseInfoBySession.get(id)
    if (existing) {
      return
    }

    const lastError = lastConnectionErrorBySession.get(id)
    setPendingShellCloseInfo(id, {
      reason: lastError?.isNetwork ? 'network' : 'unknown',
      isNetworkDisconnect: !!lastError?.isNetwork,
      errorCode: lastError?.errorCode,
      errorMessage: lastError?.errorMessage || 'SSH connection closed'
    })
    logger.info('SSH connection close captured', {
      event: 'ssh.conn.close',
      connectionId: id,
      hasLastError: !!lastError
    })
  })

  // Some network drops surface as "end"; handle it the same as "close".
  conn.on('end', () => {
    if (manualDisconnectSessions.has(id)) {
      logger.info('SSH connection end ignored (manual disconnect)', {
        event: 'ssh.conn.end.manual',
        connectionId: id
      })
      return
    }

    const existing = pendingShellCloseInfoBySession.get(id)
    if (existing) {
      return
    }

    const lastError = lastConnectionErrorBySession.get(id)
    setPendingShellCloseInfo(id, {
      reason: lastError?.isNetwork ? 'network' : 'unknown',
      isNetworkDisconnect: !!lastError?.isNetwork,
      errorCode: lastError?.errorCode,
      errorMessage: lastError?.errorMessage || 'SSH connection ended'
    })
    logger.info('SSH connection end captured', {
      event: 'ssh.conn.end',
      connectionId: id,
      hasLastError: !!lastError
    })
  })
}
export const getUniqueRemoteName = async (sftp: SFTPWrapper, remoteDir: string, originalName: string, isDir: boolean): Promise<string> => {
  const list = await new Promise<{ filename: string; longname: string; attrs: any }[]>((resolve, reject) => {
    sftp.readdir(remoteDir, (err, list) => (err ? reject(err) : resolve(list as any)))
  })
  let existing = new Set(list.map((f) => f.filename))

  if (isDir) {
    existing = new Set(list.filter((f) => f.attrs.isDirectory()).map((f) => f.filename))
  }

  let finalName = originalName
  const { name, ext } = path.parse(originalName)
  let count = 1

  while (existing.has(finalName)) {
    finalName = `${name}${ext}.${count}`
    count++
  }

  return finalName
}

const findReusableSftpRecord = (id: string): any => {
  const direct = sftpConnections.get(id)
  if (direct) return direct

  if (!id) return null

  const prefix = id.substring(0, id.lastIndexOf(':') + 1)

  for (const [existingId, existingRecord] of sftpConnections.entries()) {
    const sessionPart = existingId.substring(existingId.lastIndexOf(':') + 1)
    if (existingId.startsWith(prefix) && sessionPart.startsWith('files-')) {
      return existingRecord
    }
  }

  for (const [existingId, existingRecord] of sftpConnections.entries()) {
    if (existingId.startsWith(prefix)) {
      return existingRecord
    }
  }

  return null
}

export const getSftpConnection = (id: string): any => {
  const sftpConnectionInfo = findReusableSftpRecord(id)

  if (!sftpConnectionInfo) {
    logger.debug('SFTP connection not found', { event: 'ssh.sftp.notfound', connectionId: id })
    return null
  }

  if (!sftpConnectionInfo.isSuccess || !sftpConnectionInfo.sftp) {
    logger.debug('SFTP not available', {
      event: 'ssh.sftp.unavailable',
      connectionId: id,
      error: sftpConnectionInfo.error || 'Unknown error'
    })
    return null
  }

  return sftpConnectionInfo.sftp
}

export const cleanSftpConnection = (id) => {
  // Clean up SFTP
  if (sftpConnections.get(id)) {
    const sftp = getSftpConnection(id)
    sftp.end()
    sftpConnections.delete(id)
    // if (sshConnections.get(id + '-second')) {
    //   const connSec = sshConnections.get(id + '-second')
    //   connSec.end()
    //   sshConnections.delete(id + '-second')
    // }
  }
}

export const registerSSHHandlers = () => {
  // Handle connection
  ipcMain.handle('ssh:connect', async (_event, connectionInfo) => {
    const { sshType } = connectionInfo
    logger.info('Received SSH connect request', {
      event: 'ssh.connect.request',
      connectionId: connectionInfo?.id,
      sshType: sshType || 'ssh',
      port: connectionInfo?.port || 22,
      source: connectionInfo?.source || 'unknown',
      wakeupSource: connectionInfo?.wakeupSource || 'unknown',
      disablePostConnectProbe: connectionInfo?.disablePostConnectProbe === true,
      needProxy: connectionInfo?.needProxy === true,
      hasProxyCommand: !!connectionInfo?.proxyCommand,
      hasPassword: typeof connectionInfo?.password === 'string' && connectionInfo.password.length > 0,
      hasPrivateKey: typeof connectionInfo?.privateKey === 'string' && connectionInfo.privateKey.length > 0
    })

    if (sshType === 'jumpserver') {
      // Route to JumpServer connection
      try {
        const result = await handleJumpServerConnection(connectionInfo, _event)
        return result
      } catch (error: unknown) {
        logger.error('JumpServer connection request failed', {
          event: 'ssh.connect.jumpserver.error',
          connectionId: connectionInfo?.id,
          error: error
        })
        return buildErrorResponse(error)
      }
    }

    const bastionResult = await connectBastionByType(sshType, connectionInfo, _event)
    if (bastionResult !== null) {
      return bastionResult
    }

    // Route to Telnet handler when protocol is telnet
    if (connectionInfo.protocol === 'telnet') {
      try {
        const result = await telnetConnect(_event, {
          id: connectionInfo.id,
          host: connectionInfo.host,
          port: connectionInfo.port || 23,
          username: connectionInfo.username,
          password: connectionInfo.password,
          terminalType: connectionInfo.terminalType,
          cols: connectionInfo.cols,
          rows: connectionInfo.rows
        })
        return result
      } catch (error: unknown) {
        logger.error('Telnet connection failed', {
          event: 'telnet.connect.error',
          connectionId: connectionInfo?.id,
          error: error
        })
        return buildErrorResponse(error)
      }
    }

    // Default to SSH connection when sshType is missing or explicitly 'ssh'
    const retryCount = 0
    return new Promise((resolve, reject) => {
      handleAttemptConnection(_event, connectionInfo, resolve, reject, retryCount)
    })
  })

  ipcMain.handle('ssh:sftp:conn:check', async (_event, { id }) => {
    if (connectionStatus.has(id)) {
      const status = connectionStatus.get(id)
      return status?.sftpAvailable === true
    }
    return false
  })

  ipcMain.handle('ssh:shell', async (event, { id, terminalType, cols, rows }) => {
    // Telnet connections are already interactive after connect, no separate shell step needed
    if (isTelnetSession(id)) {
      return { status: 'success' }
    }

    // Check if it's a JumpServer connection
    if (jumpserverConnections.has(id)) {
      // Use JumpServer shell handling
      const stream = jumpserverShellStreams.get(id)
      if (!stream) {
        return { status: 'error', message: 'JumpServer connection not found' }
      }

      // Clear old listeners
      stream.removeAllListeners('data')

      let bufferChunks: string[] = []
      let bufferLength = 0
      let flushTimer: NodeJS.Timeout | null = null
      let rawChunks: Buffer[] = []
      let rawBytes = 0
      const flushBuffer = () => {
        if (!bufferLength && rawBytes === 0) return
        const chunk = bufferChunks.join('')
        bufferChunks = []
        bufferLength = 0
        const raw = rawBytes ? Buffer.concat(rawChunks, rawBytes) : undefined

        rawChunks = []
        rawBytes = 0
        event.sender.send(`ssh:shell:data:${id}`, { data: chunk, raw, marker: '' })
        flushTimer = null
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

      stream.on('data', (data) => {
        const dataStr = data.toString('utf8')
        const lastCommand = jumpserverLastCommand.get(id)
        const exitCommands = ['exit', 'logout', '\x04']

        // JumpServer menu exit detection
        if (dataStr.includes('[Host]>') && lastCommand && exitCommands.includes(lastCommand)) {
          jumpserverLastCommand.delete(id)
          stream.write('q\r', (err) => {
            if (err)
              logger.error('Failed to send quit command to JumpServer', { event: 'jumpserver.quit.error', connectionId: id, error: err.message })
            else logger.debug('Sent quit command to JumpServer session', { event: 'jumpserver.quit', connectionId: id })
            stream.end()
            const connData = jumpserverConnections.get(id)
            connData?.conn?.end()
          })
          return
        }

        const markedCmd = jumpserverMarkedCommands.get(id)
        if (markedCmd !== undefined) {
          if (markedCmd.marker === 'Chaterm:command') {
            event.sender.send(`ssh:shell:data:${id}`, {
              data: dataStr,
              raw: data,
              marker: markedCmd.marker
            })
            return
          }
          markedCmd.output += dataStr
          markedCmd.rawChunks.push(data)
          markedCmd.rawBytes += data.length
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
              jumpserverMarkedCommands.delete(id)
            }
          }, 200)
        } else {
          // Only add to shared buffer for non-marked data
          rawChunks.push(data)
          rawBytes += data.length
          bufferChunks.push(dataStr)
          bufferLength += dataStr.length
          scheduleFlush()
        }
      })

      stream.stderr.on('data', (data) => {
        event.sender.send(`ssh:shell:stderr:${id}`, data.toString('utf8'))
      })

      stream.on('close', () => {
        flushBuffer()
        logger.debug('JumpServer shell stream closed', { event: 'jumpserver.stream.close', connectionId: id })
        event.sender.send(`ssh:shell:close:${id}`)
        jumpserverShellStreams.delete(id)
      })

      return { status: 'success', message: 'JumpServer Shell ready' }
    }

    const bastionShellResult = await shellBastionSession(event, id, terminalType)
    if (bastionShellResult !== null) {
      return bastionShellResult
    }

    // Default SSH shell handling
    const conn = sshConnections.get(id)
    if (!conn) {
      return { status: 'error', message: 'Not connected to the server' }
    }

    const termType = terminalType || 'vt100'
    const delayMs = 300
    const fallbackExecs = ['bash', 'sh']

    const isConnected = () => conn && conn['_sock'] && !conn['_sock'].destroyed

    // Build pty options with initial window size when available
    const ptyOpts: Record<string, unknown> = { term: termType }
    if (cols && rows) {
      ptyOpts.cols = cols
      ptyOpts.rows = rows
    }

    const handleStream = (stream, method: 'shell' | 'exec') => {
      shellStreams.set(id, stream)

      let bufferChunks: string[] = []
      let bufferLength = 0
      let flushTimer: NodeJS.Timeout | null = null
      let rawChunks: Buffer[] = []
      let rawBytes = 0
      const flushBuffer = () => {
        if (!bufferLength && rawBytes === 0) return

        const chunk = bufferChunks.join('')
        bufferChunks = []
        bufferLength = 0

        const raw = rawBytes ? Buffer.concat(rawChunks, rawBytes) : undefined

        rawChunks = []
        rawBytes = 0
        event.sender.send(`ssh:shell:data:${id}`, { data: chunk, raw, marker: '' })
        flushTimer = null
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

      stream.on('data', (data) => {
        const markedCmd = markedCommands.get(id)
        const chunk = data.toString('utf8')

        if (markedCmd !== undefined) {
          markedCmd.output += chunk
          markedCmd.rawChunks.push(data)
          markedCmd.rawBytes += data.length
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
              markedCommands.delete(id)
            }
          }, 200)
        } else {
          // Only add to shared buffer for non-marked data
          rawChunks.push(data)
          rawBytes += data.length
          bufferChunks.push(chunk)
          bufferLength += chunk.length
          scheduleFlush()
        }
      })

      stream.stderr?.on('data', (data) => {
        event.sender.send(`ssh:shell:stderr:${id}`, data.toString('utf8'))
      })

      stream.on('error', (err) => {
        recordSessionConnectionError(id, err)
      })

      stream.on('close', () => {
        flushBuffer()
        const closeInfo = consumeShellCloseInfo(id)
        logger.info('Shell stream closed', {
          event: 'ssh.stream.close',
          connectionId: id,
          method,
          closeReason: closeInfo.reason,
          isNetworkDisconnect: closeInfo.isNetworkDisconnect,
          errorCode: closeInfo.errorCode,
          errorMessage: closeInfo.errorMessage
        })
        event.sender.send(`ssh:shell:close:${id}`, closeInfo)
        shellStreams.delete(id)
      })
    }

    const tryExecFallback = (execList: string[], resolve, reject) => {
      const [cmd, ...rest] = execList
      if (!cmd) {
        return reject(new Error('shell and exec run failed'))
      }

      conn.exec(cmd, { pty: true }, (execErr, execStream) => {
        if (execErr) {
          logger.warn('Shell exec fallback failed', { event: 'ssh.exec.failed', connectionId: id, cmd, error: execErr.message })
          return tryExecFallback(rest, resolve, reject)
        }

        logger.info('Terminal started via exec fallback', { event: 'ssh.exec.success', connectionId: id, cmd })
        handleStream(execStream, 'exec')
        resolve({ status: 'success', message: `The terminal has been started（exec:${cmd}）` })
      })
    }

    return new Promise((resolve, reject) => {
      if (!isConnected()) return reject(new Error('Connection disconnected, unable to start terminal'))

      setTimeout(() => {
        if (!isConnected()) return reject(new Error('The connection has been disconnected after a delay'))

        conn.shell(ptyOpts, (err, stream) => {
          if (err) {
            logger.warn('Shell start error, falling back to exec', { event: 'ssh.shell.error', connectionId: id, error: err.message })
            return tryExecFallback(fallbackExecs, resolve, reject)
          }

          logger.info('Shell started successfully', { event: 'ssh.shell.success', connectionId: id })
          handleStream(stream, 'shell')
          resolve({ status: 'success', message: 'Shell has started' })
        })
      }, delayMs)
    })
  })

  // Resize handling
  ipcMain.handle('ssh:shell:resize', async (_event, { id, cols, rows }) => {
    // Route to Telnet resize handler
    if (isTelnetSession(id)) {
      telnetResize(id, cols, rows)
      return { status: 'success' }
    }

    // Check if it's a JumpServer connection
    if (jumpserverConnections.has(id)) {
      const stream = jumpserverShellStreams.get(id)
      if (!stream) {
        return { status: 'error', message: 'JumpServer Shell not found' }
      }

      try {
        stream.setWindow(rows, cols, 0, 0)
        return { status: 'success', message: `JumpServer window size set to ${cols}x${rows}` }
      } catch (error: unknown) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    }

    const bastionResizeResult = await resizeBastionSession(id, cols, rows)
    if (bastionResizeResult !== null) {
      return bastionResizeResult
    }

    // Default SSH handling
    const stream = shellStreams.get(id)
    if (!stream) {
      return { status: 'error', message: 'Shell not found' }
    }

    try {
      // Set SSH shell window size
      stream.setWindow(rows, cols, 0, 0)
      return { status: 'success', message: `Window size set to  ${cols}x${rows}` }
    } catch (error: unknown) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.on('ssh:shell:write', (_event, { id, data, marker, lineCommand, isBinary }) => {
    // Route to Telnet write handler
    if (isTelnetSession(id)) {
      telnetWrite(id, data, marker)
      return
    }

    // Check if it's a JumpServer connection
    if (jumpserverConnections.has(id)) {
      const stream = jumpserverShellStreams.get(id)
      if (stream) {
        if (isBinary) {
          const buf = Buffer.from(data, 'binary')
          stream.write(buf)
        } else {
          // Use lineCommand for command detection, if not, fallback to data-trim()
          const command = lineCommand || data.trim()
          if (['exit', 'logout', '\x04'].includes(command)) {
            jumpserverLastCommand.set(id, command)
          } else {
            jumpserverLastCommand.delete(id)
          }
          if (jumpserverMarkedCommands.has(id)) {
            jumpserverMarkedCommands.delete(id)
          }
          if (marker) {
            jumpserverMarkedCommands.set(id, {
              marker,
              output: '',
              rawChunks: [] as Uint8Array[],
              rawBytes: 0,
              raw: [] as Uint8Array[],
              completed: false,
              lastActivity: Date.now(),
              idleTimer: null
            })
          }

          stream.write(data)
        }
      } else {
        logger.warn('Attempting to write to non-existent JumpServer stream', { event: 'jumpserver.write.notfound', connectionId: id })
      }
      return
    }

    if (writeBastionSession(id, data, marker, lineCommand, isBinary)) {
      return
    }

    // Default SSH handling
    const stream = shellStreams.get(id)
    if (stream) {
      // For default SSH connections, don't detect exit commands, let terminal handle exit naturally
      if (markedCommands.has(id)) {
        markedCommands.delete(id)
      }
      if (marker) {
        markedCommands.set(id, {
          marker,
          output: '',
          rawChunks: [] as Uint8Array[],
          rawBytes: 0,
          raw: [] as Uint8Array[],
          completed: false,
          lastActivity: Date.now(),
          idleTimer: null
        })
      }

      if (isBinary) {
        const buf = Buffer.from(data, 'binary')
        stream.write(buf)
      } else {
        stream.write(data)
      }
    } else {
      logger.warn('Attempting to write to non-existent stream', { event: 'ssh.write.notfound', connectionId: id })
    }
  })

  /**
   * Execute command on JumpServer asset (simulate exec via shell stream)
   * @param id - Connection ID
   * @param cmd - Command to execute
   * @returns Execution result (compatible with standard exec format)
   */
  async function executeCommandOnJumpServerAsset(
    id: string,
    cmd: string
  ): Promise<{
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    exitSignal?: string
    error?: string
  }> {
    // Get or create dedicated exec stream (not user interaction stream)
    let execStream: any
    try {
      execStream = await createJumpServerExecStream(id)
    } catch (error) {
      return {
        success: false,
        error: `Failed to create exec stream: ${error instanceof Error ? error.message : String(error)}`,
        stdout: '',
        stderr: '',
        exitCode: undefined,
        exitSignal: undefined
      }
    }

    if (!execStream) {
      return {
        success: false,
        error: 'JumpServer exec stream not available',
        stdout: '',
        stderr: '',
        exitCode: undefined,
        exitSignal: undefined
      }
    }

    return executeCommandOnJumpServerExec(execStream, cmd)
  }

  ipcMain.handle('ssh:conn:exec', async (_event, { id, cmd }) => {
    // Detect if it's a JumpServer connection, handle with priority
    if (jumpserverShellStreams.has(id)) {
      return executeCommandOnJumpServerAsset(id, cmd)
    }

    // Standard SSH connection handling
    const conn = sshConnections.get(id)
    if (!conn) {
      return {
        success: false,
        error: `No SSH connection for id=${id}`,
        stdout: '',
        stderr: '',
        exitCode: undefined,
        exitSignal: undefined
      }
    }

    return new Promise((resolve) => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          return resolve({
            success: false,
            error: err.message,
            stdout: '',
            stderr: '',
            exitCode: undefined,
            exitSignal: undefined
          })
        }

        const stdoutChunks: Buffer[] = []
        const stderrChunks: Buffer[] = []
        let exitCode = undefined
        let exitSignal = undefined

        stream.on('data', (chunk) => {
          stdoutChunks.push(chunk)
        })

        stream.stderr.on('data', (chunk) => {
          stderrChunks.push(chunk)
        })

        stream.on('exit', (code, signal) => {
          exitCode = code ?? undefined
          exitSignal = signal ?? undefined
        })

        stream.on('close', (code, signal) => {
          const finalCode = exitCode !== undefined ? exitCode : code
          const finalSignal = exitSignal !== undefined ? exitSignal : signal

          const stdout = Buffer.concat(stdoutChunks).toString('utf8')
          const stderr = Buffer.concat(stderrChunks).toString('utf8')

          resolve({
            success: true,
            stdout,
            stderr,
            exitCode: finalCode ?? undefined,
            exitSignal: finalSignal ?? undefined
          })
        })

        // Handle stream errors
        stream.on('error', (streamErr) => {
          // Optimization: use same concatenation method on error
          const stdout = Buffer.concat(stdoutChunks).toString('utf8')
          const stderr = Buffer.concat(stderrChunks).toString('utf8')

          resolve({
            success: false,
            error: streamErr.message,
            stdout,
            stderr,
            exitCode: undefined,
            exitSignal: undefined
          })
        })
      })
    })
  })

  ipcMain.handle('ssh:fork-session', async (_event, { sourceConnectionId, newConnectionId, host, port, username }) => {
    logger.info('Received SSH fork-session request', {
      event: 'ssh.fork-session.start',
      sourceConnectionId,
      newConnectionId
    })

    const conn = sshConnections.get(sourceConnectionId)
    if (!conn) {
      logger.warn('Source connection not found for fork', { event: 'ssh.fork-session.notfound', sourceConnectionId })
      return { status: 'error', message: 'Source connection not found' }
    }

    // Verify the underlying socket is still alive
    if (conn._sock && conn._sock.destroyed) {
      logger.warn('Source connection socket is destroyed', { event: 'ssh.fork-session.destroyed', sourceConnectionId })
      return { status: 'error', message: 'Source connection is no longer active' }
    }

    // Register the new session with the same underlying connection
    sshConnections.set(newConnectionId, conn)
    connectionStatus.set(newConnectionId, { isVerified: true })

    // Register in connection pool for proper reference counting on disconnect
    let foundInPool = false
    sshConnectionPool.forEach((value) => {
      if (value.conn === conn) {
        value.sessions.add(newConnectionId)
        foundInPool = true
      }
    })

    if (!foundInPool) {
      // Create a new pool entry for tracking; hasMfaAuth=false prevents getReusableSshConnection from reusing it
      const poolKey = getConnectionPoolKey(host, port || 22, username)
      const forkPoolKey = `fork:${poolKey}:${Date.now()}`
      sshConnectionPool.set(forkPoolKey, {
        conn,
        sessions: new Set([sourceConnectionId, newConnectionId]),
        host,
        port: port || 22,
        username,
        hasMfaAuth: false
      })
    }

    logger.info('SSH fork-session successful', {
      event: 'ssh.fork-session.success',
      sourceConnectionId,
      newConnectionId
    })
    return { status: 'connected' }
  })

  ipcMain.handle('ssh:disconnect', async (_event, { id }) => {
    logger.info('Received SSH disconnect request', {
      event: 'ssh.disconnect.start',
      connectionId: id
    })

    // Route to Telnet disconnect handler
    if (isTelnetSession(id)) {
      telnetDisconnect(id)
      return { status: 'disconnected' }
    }

    // Check if it's a JumpServer connection
    if (jumpserverConnections.has(id)) {
      const stream = jumpserverShellStreams.get(id)
      if (stream) {
        stream.end()
        jumpserverShellStreams.delete(id)
      }

      // Clean up exec stream
      const execStream = jumpserverExecStreams.get(id)
      if (execStream) {
        logger.debug('Cleaning up JumpServer exec stream', { event: 'jumpserver.exec.cleanup', connectionId: id })
        execStream.end()
        jumpserverExecStreams.delete(id)
      }

      const connData = jumpserverConnections.get(id)
      if (connData) {
        const connToClose = connData.conn

        // Check if other sessions are using the same connection
        let isConnStillInUse = false
        for (const [otherId, otherData] of jumpserverConnections.entries()) {
          if (otherId !== id && otherData.conn === connToClose) {
            isConnStillInUse = true
            break
          }
        }

        // Only close underlying connection when no other sessions are using it
        if (!isConnStillInUse) {
          logger.info('All JumpServer sessions closed, releasing underlying connection', { event: 'jumpserver.disconnect', connectionId: id })
          connToClose.end()
        } else {
          logger.debug('JumpServer session disconnected, underlying connection still in use', {
            event: 'jumpserver.disconnect.partial',
            connectionId: id
          })
        }
        cleanSftpConnection(id)
        jumpserverConnections.delete(id)
        jumpserverConnectionStatus.delete(id)
        logger.info('JumpServer session disconnected', {
          event: 'ssh.disconnect.jumpserver.success',
          connectionId: id
        })
        return { status: 'success', message: 'JumpServer connection disconnected' }
      }

      logger.warn('JumpServer disconnect requested for non-existent connection', {
        event: 'ssh.disconnect.jumpserver.notfound',
        connectionId: id
      })
      return { status: 'warning', message: 'No active JumpServer connection' }
    }

    const bastionDisconnectResult = await disconnectBastionSession(id)
    if (bastionDisconnectResult !== null) {
      return bastionDisconnectResult
    }

    // Default SSH handling
    manualDisconnectSessions.add(id)
    logger.info('Mark session as manual disconnect', {
      event: 'ssh.disconnect.manual.mark',
      connectionId: id
    })
    setPendingShellCloseInfo(id, {
      reason: 'manual',
      isNetworkDisconnect: false
    })

    const stream = shellStreams.get(id)
    if (stream) {
      stream.end()
      shellStreams.delete(id)
    }

    const conn = sshConnections.get(id)
    if (conn) {
      // Check if this connection is in the reuse pool
      let poolKey: string | null = null
      let reusableConn: ReusableConnection | null = null

      // Iterate through connection pool to find matching connection
      sshConnectionPool.forEach((value, key) => {
        if (value.conn === conn) {
          poolKey = key
          reusableConn = value
        }
      })

      if (poolKey && reusableConn) {
        // Remove current session from session set
        ;(reusableConn as ReusableConnection).sessions.delete(id)

        // If no other sessions are using this connection, close connection and clean up pool
        if ((reusableConn as ReusableConnection).sessions.size === 0) {
          logger.info('All SSH pool sessions closed, releasing connection', { event: 'ssh.pool.release' })
          conn.end()
          sshConnectionPool.delete(poolKey)
        }
      } else {
        // Regular connection not in reuse pool, close directly
        conn.end()
      }
      cleanSftpConnection(id)
      sshConnections.delete(id)
      sftpConnections.delete(id)
      clearSessionConnectionState(id)
      logger.info('SSH connection disconnected', {
        event: 'ssh.disconnect.success',
        connectionId: id
      })
      return { status: 'success', message: 'Disconnected' }
    }
    clearSessionConnectionState(id)
    logger.warn('SSH disconnect requested for non-existent connection', {
      event: 'ssh.disconnect.notfound',
      connectionId: id
    })
    return { status: 'warning', message: 'No active connection' }
  })

  ipcMain.handle('ssh:recordTerminalState', async (_event, params) => {
    const { id, state } = params

    const connection = sshConnections.get(id)
    if (connection) {
      connection.terminalState = state
    }
    return { success: true }
  })

  ipcMain.handle('ssh:recordCommand', async (_event, params) => {
    const { id, command, timestamp } = params

    // Record command
    const connection = sshConnections.get(id)
    if (connection) {
      if (!connection.commandHistory) {
        connection.commandHistory = []
      }
      connection.commandHistory.push({ command, timestamp })
    }
    return { success: true }
  })

  // Select File
  ipcMain.handle('dialog:open-file', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: 'Select File',
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Select Directory
  ipcMain.handle('dialog:open-directory', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: 'Select Directory',
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:save-file', async (event, { fileName }) => {
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: 'Save the file to...',
      defaultPath: fileName,
      buttonLabel: 'Save',
      filters: [{ name: 'All files', extensions: ['*'] }]
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('ssh:agent:enable-and-configure', async (_event: any, { enabled }: { enabled: boolean }) => {
    const manager = SSHAgentManager.getInstance()

    try {
      await manager.enableAgent(enabled)
      logger.info('SSH Agent enabled', { event: 'ssh.agent.enabled' })
      return { success: true }
    } catch (error: any) {
      logger.error('SSH Agent enable failed', { event: 'ssh.agent.error', error: error?.message })
      return { success: false }
    }
  })

  ipcMain.handle('ssh:agent:add-key', async (_e, { keyData, passphrase, comment }) => {
    try {
      const manager = SSHAgentManager.getInstance()
      const keyId = await manager.addKey(keyData, passphrase, comment)
      return { success: true, keyId }
    } catch (error: any) {
      logger.error('SSH Agent add-key failed', { event: 'ssh.agent.addkey.error', error: error?.message })
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('ssh:agent:remove-key', async (_e, { keyId }) => {
    try {
      const manager = SSHAgentManager.getInstance()
      const removeStatus = manager.removeKey(keyId)
      return { success: removeStatus }
    } catch (error: any) {
      logger.error('SSH Agent add-key failed', { event: 'ssh.agent.addkey.error', error: error?.message })
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('ssh:agent:list-key', async (_e) => {
    try {
      const manager = SSHAgentManager.getInstance()
      const keyIdMapList = manager.listKeys()
      return { success: true, keys: keyIdMapList }
    } catch (error: any) {
      logger.error('SSH Agent add-key failed', { event: 'ssh.agent.addkey.error', error: error?.message })
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('ssh:get-system-info', async (_event, { id }) => {
    try {
      const systemInfo = await getSystemInfo(id)
      return { success: true, data: systemInfo }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get system info'
      }
    }
  })

  // zmodem
  ipcMain.handle('zmodem:pickUploadFiles', async (evt) => {
    const win = require('electron').BrowserWindow.fromWebContents(evt.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections']
    })
    if (canceled) return []

    return filePaths.map((p) => ({
      name: path.basename(p),
      lastModified: fs.statSync(p).mtimeMs,
      data: new Uint8Array(fs.readFileSync(p))
    }))
  })

  ipcMain.handle('zmodem:pickSavePath', async (evt, defaultName) => {
    const win = require('electron').BrowserWindow.fromWebContents(evt.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName
    })
    return canceled ? null : filePath
  })

  const activeStreams = new Map()

  ipcMain.handle('zmodem:openStream', (_event, savePath) => {
    try {
      const stream = fs.createWriteStream(savePath)
      const streamId = Math.random().toString(36).slice(2)
      activeStreams.set(streamId, stream)
      return streamId
    } catch (err) {
      logger.error('Failed to open zmodem stream', { event: 'ssh.zmodem.error', error: err })
      return null
    }
  })

  ipcMain.handle('zmodem:writeChunk', (_event, streamId, chunk) => {
    const stream = activeStreams.get(streamId)
    if (stream) {
      stream.write(Buffer.from(chunk))
    }
  })

  ipcMain.handle('zmodem:closeStream', (_event, streamId) => {
    const stream = activeStreams.get(streamId)
    if (stream) {
      stream.end()
      activeStreams.delete(streamId)
    }
  })

  ipcMain.handle('ssh:shell-pid-set', async (_event, { id }) => {
    const jumpserverData = jumpserverConnections.get(id)
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    if (jumpserverData) {
      await sleep(1500)

      let execStream: any
      try {
        execStream = await createJumpServerExecStream(id)
      } catch {
        logger.info('Get jumpserver exec stream error')
        return
      }

      const pidResult = await executeCommandOnJumpServerExec(execStream, 'echo "__PID__$$\\n__PPID__$PPID"').catch(() => null)
      logger.info('Get jumpserver pid result', { pidResult })

      if (!pidResult?.success || !pidResult.stdout) return

      const pidMatch = pidResult.stdout.match(/__PID__(\d+)/)
      const ppidMatch = pidResult.stdout.match(/__PPID__(\d+)/)
      if (!pidMatch || !ppidMatch) return

      const execPid = parseInt(pidMatch[1])
      const ppid = parseInt(ppidMatch[1])
      const psCmd = `ps -o pid=,comm= -p $(ps -o pid= --ppid ${ppid} 2>/dev/null || ps -o pid= -p $(pgrep -P ${ppid} 2>/dev/null) 2>/dev/null) 2>/dev/null`

      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 300))
        const psResult = await executeCommandOnJumpServerExec(execStream, psCmd).catch(() => null)
        if (!psResult?.success || !psResult.stdout) continue

        const shellPid =
          psResult.stdout
            .replace(/\u001b\[[?]?\d*[a-zA-Z]/g, '')
            .replace(/\r/g, '')
            .trim()
            .split('\n')
            .map((line) => {
              const [pid, comm] = line.trim().split(/\s+/)
              return { pid: parseInt(pid), comm }
            })
            .filter((p) => !isNaN(p.pid) && p.pid !== execPid && /bash|sh|zsh|fish|dash|ksh|tcsh|csh/.test(p.comm))
            .map((p) => p.pid)[0] ?? null

        if (shellPid) {
          jumpserverSessionPids.set(id, shellPid)
          logger.info('Shell PID saved', { event: 'ssh.pid.saved', connectionId: id, shellPid })
          break
        }
      }
      return
    }
    const conn = sshConnections.get(id)
    if (!conn) return

    conn.exec('echo "__PID__$$\\n__PPID__$PPID"', (err, stream) => {
      if (err) return
      let output = ''
      stream.on('data', (data) => (output += data.toString()))
      stream.on('close', async () => {
        const pidMatch = output.match(/__PID__(\d+)/)
        const ppidMatch = output.match(/__PPID__(\d+)/)
        if (!pidMatch || !ppidMatch) return

        const execPid = parseInt(pidMatch[1])
        const ppid = parseInt(ppidMatch[1])

        const psCmd = `ps -o pid=,comm= -p $(ps -o pid= --ppid ${ppid} 2>/dev/null || ps -o pid= -p $(pgrep -P ${ppid} 2>/dev/null) 2>/dev/null) 2>/dev/null`
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 300))
          await new Promise<void>((resolve) => {
            conn.exec(psCmd, (err, stream) => {
              if (err) return resolve()
              let out = ''
              stream.on('data', (data) => (out += data.toString()))
              stream.on('close', () => {
                const shellPid =
                  out
                    .trim()
                    .split('\n')
                    .map((line) => {
                      const [pid, comm] = line.trim().split(/\s+/)
                      return { pid: parseInt(pid), comm }
                    })
                    .filter((p) => !isNaN(p.pid) && p.pid !== execPid && /bash|sh|zsh|fish|dash|ksh|tcsh|csh/.test(p.comm))
                    .map((p) => p.pid)[0] ?? null

                if (shellPid) {
                  sshSessionPids.set(id, shellPid)
                  logger.info('Shell PID saved', { event: 'ssh.pid.saved', connectionId: id, shellPid })
                }
                resolve()
              })
            })
          })
          if (sshSessionPids.has(id)) break
        }
      })
    })
  })
  ipcMain.handle('ssh:cwd:get', async (_event, { id }: { id: string }) => {
    const isJump = jumpserverConnections.has(id)
    const shellPid = isJump ? jumpserverSessionPids.get(id) : sshSessionPids.get(id)

    if (!shellPid) {
      return { success: false, cwd: null, reason: 'shellPid_missing' }
    }

    const cmd =
      'pid=' +
      shellPid +
      '; while :; do child=$(grep -l "^PPid:[[:space:]]*${pid}$" /proc/[0-9]*/status 2>/dev/null | head -1 | cut -d/ -f3); [ -z "$child" ] && break; pid=$child; done; result=$(readlink /proc/$pid/cwd 2>/dev/null); if [ -z "$result" ]; then result=$(sudo -n readlink /proc/$pid/cwd 2>/dev/null); fi; echo "$result"'
    let result: any
    if (jumpserverShellStreams.has(id)) {
      result = await executeCommandOnJumpServerAsset(id, cmd)
    } else {
      const conn = sshConnections.get(id)
      if (!conn) return { success: false, cwd: null, reason: `no_ssh_conn:${id}` }

      result = await new Promise((resolve) => {
        conn.exec(cmd, (err, stream) => {
          if (err) return resolve({ success: false, stdout: '', stderr: err.message, exitCode: 255 })
          const out: Buffer[] = []
          const errOut: Buffer[] = []
          stream.on('data', (c) => out.push(c))
          stream.stderr.on('data', (c) => errOut.push(c))
          stream.on('close', (code: number) => {
            resolve({
              success: code === 0,
              stdout: Buffer.concat(out).toString('utf8'),
              stderr: Buffer.concat(errOut).toString('utf8'),
              exitCode: code
            })
          })
        })
      })
    }

    const stdoutRaw = String(result?.stdout ?? '')

    const stdoutNoAnsi = stdoutRaw.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')

    const lines = stdoutNoAnsi
      .replace(/\r/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const cwd = lines.length ? lines[lines.length - 1] : null

    if (!cwd) {
      return {
        success: false,
        cwd: null,
        reason: `cwd_unavailable`,
        shellPid,
        debug: { isJump, exitCode: result?.exitCode, stdoutRaw, stderr: String(result?.stderr ?? '') }
      }
    }

    return { success: true, cwd, shellPid }
  })
}

const getSystemInfo = async (id: string): Promise<CommandGenerationContext> => {
  const systemInfoScript = `uname -a | sed 's/^/OS_VERSION:/' && echo "DEFAULT_SHELL:$SHELL" && echo "HOME_DIR:$HOME" && hostname | sed 's/^/HOSTNAME:/' && whoami | sed 's/^/USERNAME:/' && (sudo -n true 2>/dev/null && echo "SUDO_CHECK:has sudo permission" || echo "SUDO_CHECK:no sudo permission")`

  const inferPlatformFromOsVersion = (osVersion: string): string => {
    const v = (osVersion || '').toLowerCase()
    if (v.includes('darwin')) return 'darwin'
    if (v.includes('linux')) return 'linux'
    if (v.includes('mingw') || v.includes('msys') || v.includes('cygwin')) return 'win32'
    return 'unknown'
  }

  const parseSystemInfoOutput = (output: string): CommandGenerationContext => {
    const lines = output.trim().split('\n')
    const result: CommandGenerationContext = {
      platform: 'unknown',
      shell: 'bash',
      osVersion: '',
      hostname: '',
      username: '',
      homeDir: '',
      sudoPermission: false
    }

    lines.forEach((line) => {
      if (line.startsWith('OS_VERSION:')) {
        result.osVersion = line.replace('OS_VERSION:', '')
      } else if (line.startsWith('DEFAULT_SHELL:')) {
        result.shell = line.replace('DEFAULT_SHELL:', '')
      } else if (line.startsWith('HOME_DIR:')) {
        result.homeDir = line.replace('HOME_DIR:', '')
      } else if (line.startsWith('HOSTNAME:')) {
        result.hostname = line.replace('HOSTNAME:', '')
      } else if (line.startsWith('USERNAME:')) {
        result.username = line.replace('USERNAME:', '')
      } else if (line.startsWith('SUDO_CHECK:')) {
        result.sudoPermission = line.includes('has sudo permission')
      }
    })

    result.platform = inferPlatformFromOsVersion(result.osVersion || '')
    if (!result.shell) {
      result.shell = 'bash'
    }

    return result
  }

  const isJumpServerConnection = jumpserverConnections.has(id) || jumpserverShellStreams.has(id)

  if (isJumpServerConnection) {
    const execStream = await createJumpServerExecStream(id)
    const execResult = await executeCommandOnJumpServerExec(execStream, systemInfoScript)
    if (!execResult.stdout?.trim()) {
      throw new Error(execResult.error || 'Failed to get system info from JumpServer exec stream')
    }
    return parseSystemInfoOutput(execResult.stdout)
  }

  let conn = sshConnections.get(id)
  if (!conn) {
    const connData = jumpserverConnections.get(id)
    conn = connData?.conn
  }
  if (!conn) {
    throw new Error('No active SSH connection found')
  }

  return new Promise((resolve, reject) => {
    conn.exec(systemInfoScript, (err, stream) => {
      if (err) {
        return reject(err)
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => {
        stdout += data.toString('utf8')
      })

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })

      stream.on('close', () => {
        if (stderr) {
          return reject(new Error(stderr))
        }

        resolve(parseSystemInfoOutput(stdout))
      })
    })
  })
}

export const pickReconnectConnectionInfo = (connectionInfo: any) => {
  if (!connectionInfo?.id) return null

  return {
    id: connectionInfo.id,
    sshType: connectionInfo.sshType,
    host: connectionInfo.host,
    port: connectionInfo.port,
    username: connectionInfo.username,
    password: connectionInfo.password,
    privateKey: connectionInfo.privateKey,
    passphrase: connectionInfo.passphrase,
    needProxy: connectionInfo.needProxy,
    proxyConfig: connectionInfo.proxyConfig,
    proxyCommand: connectionInfo.proxyCommand,
    connIdentToken: connectionInfo.connIdentToken,
    asset_type: connectionInfo.asset_type,
    assetUuid: connectionInfo.assetUuid,
    targetIp: connectionInfo.targetIp,
    terminalType: connectionInfo.terminalType
  }
}

export const initSftpOnConnection = (conn: Client, connectionId: string, connectionInfo: any): Promise<void> => {
  return new Promise<void>((resolve) => {
    try {
      conn.sftp((err, sftp) => {
        if (err || !sftp) {
          logger.error(`SFTP check error `, { event: 'ssh.shell.sftp', connectionId: connectionId, error: err })

          connectionStatus.set(connectionId, {
            sftpAvailable: false,
            sftpError: err?.message || 'SFTP object is empty'
          })

          sftpConnections.set(connectionId, {
            isSuccess: false,
            error: `sftp init error: "${err?.message || 'SFTP object is empty'}"`
          })

          resolve()
          return
        }

        logger.info(`start SFTP `, { event: 'ssh.sftp.start', connectionId: connectionId })
        sftp.readdir('.', (readDirErr) => {
          if (readDirErr) {
            logger.error(`SFTP check failed `, { event: 'ssh.shell.sftp', connectionId: connectionId, error: readDirErr.message })

            connectionStatus.set(connectionId, {
              sftpAvailable: false,
              sftpError: readDirErr.message
            })

            try {
              sftp.end()
            } catch {}
          } else {
            logger.info(`SFTP check success`, { event: 'ssh.sftp.check', connectionId: connectionId })
            sftpConnections.set(connectionId, { isSuccess: true, sftp })
            connectionStatus.set(connectionId, { sftpAvailable: true })
            const picked = pickReconnectConnectionInfo(connectionInfo)
            if (picked) {
              sftpConnectionInfoMap.set(String(connectionId), picked)
            }
          }
          resolve()
        })
      })
    } catch (e: any) {
      const msg = e?.message || String(e)
      connectionStatus.set(connectionId, {
        sftpAvailable: false,
        sftpError: msg
      })
      sftpConnections.set(connectionId, { isSuccess: false, error: `sftp exception: "${msg}"` })
      resolve()
    }
  })
}
