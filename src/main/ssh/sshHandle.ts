import { BrowserWindow, dialog, ipcMain } from 'electron'
import { Client } from 'ssh2'
import type { SFTPWrapper, Algorithms } from 'ssh2'

const { app } = require('electron')
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
import { createProxySocket } from './proxy'

import {
  jumpserverConnections,
  handleJumpServerConnection,
  jumpserverShellStreams,
  jumpserverExecStreams,
  jumpserverMarkedCommands,
  jumpserverConnectionStatus,
  jumpserverLastCommand,
  createJumpServerExecStream
} from './jumpserverHandle'
import path from 'path'
import fs from 'fs'
import { SSHAgentManager } from './ssh-agent/ChatermSSHAgent'

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

// Legacy algorithm support for older SSH servers
// Using 'append' to keep default secure algorithms with higher priority
// Note: ssh2 runtime supports partial Record with only 'append', but TypeScript types require all keys
export const LEGACY_ALGORITHMS = {
  kex: {
    append: ['diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group1-sha1']
  },
  serverHostKey: {
    append: ['ssh-rsa', 'ssh-dss']
  }
} as Algorithms

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
const sshConnectionPool = new Map<string, ReusableConnection>()

// Generate unique key for connection pool
const getConnectionPoolKey = (host: string, port: number, username: string): string => {
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

// Set KeyboardInteractive authentication timeout (milliseconds)
const KeyboardInteractiveTimeout = 300000 // 5 minutes timeout
const MaxKeyboardInteractiveAttempts = 5 // Max KeyboardInteractive attempts

// eslint-disable-next-line @typescript-eslint/no-var-requires
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

export const attemptSecondaryConnection = async (event, connectionInfo, ident) => {
  const { id, host, port, username, password, privateKey, passphrase, needProxy, proxyConfig } = connectionInfo
  const conn = new Client()
  const connectConfig: any = {
    host,
    port: port || 22,
    username,
    keepaliveInterval: 10000,
    readyTimeout: KeyboardInteractiveTimeout,
    ident: ident,
    algorithms: LEGACY_ALGORITHMS
  }

  if (privateKey) {
    connectConfig.privateKey = privateKey
    if (passphrase) connectConfig.passphrase = passphrase
  } else if (password) {
    connectConfig.password = password
  }

  if (needProxy) {
    console.log('proxyConfig:', proxyConfig)
    connectConfig.sock = await createProxySocket(proxyConfig, host, port)
  }

  // Send initialization command result
  const readyResult: {
    hasSudo?: boolean
    commandList?: string[]
  } = {}

  let execCount = 0
  const totalCounts = 2
  const hasOpt = keyboardInteractiveOpts.has(id)
  const sendReadyData = (stopCount) => {
    execCount++
    if (execCount === totalCounts || stopCount) {
      event.sender.send(`ssh:connect:data:${id}`, readyResult)
      if (hasOpt) {
        keyboardInteractiveOpts.delete(id)
      }
    }
  }

  if (hasOpt) {
    connectConfig.tryKeyboard = true
    conn.on('keyboard-interactive', (_name, _instructions, _instructionsLang, _prompts, finish) => {
      const cached = keyboardInteractiveOpts.get(id)
      finish(cached || [])
    })
  }

  const sftpAsync = (conn) => {
    return new Promise<void>((resolve) => {
      conn.sftp((err, sftp) => {
        if (err || !sftp) {
          console.log(`SFTPCheckError [${id}]`, err)
          connectionStatus.set(id, {
            sftpAvailable: false,
            sftpError: err?.message || 'SFTP object is empty'
          })
          sftpConnections.set(id, { isSuccess: false, error: `sftp init error: "${err?.message || 'SFTP object is empty'}"` })
          resolve()
        } else {
          console.log(`startSftp [${id}]`)
          sftp.readdir('.', (readDirErr) => {
            if (readDirErr) {
              console.log(`SFTPCheckFailed [${id}]`)
              connectionStatus.set(id, {
                sftpAvailable: false,
                sftpError: readDirErr.message
              })
              sftp.end()
            } else {
              console.log(`SFTPCheckSuccess [${id}]`)
              sftpConnections.set(id, { isSuccess: true, sftp: sftp })
              connectionStatus.set(id, { sftpAvailable: true })
            }
            resolve()
          })
        }
      })
    })
  }

  conn
    .on('ready', async () => {
      // Perform sftp check
      try {
        await sftpAsync(conn)
      } catch (e) {
        connectionStatus.set(id, {
          sftpAvailable: false,
          sftpError: 'SFTP connection failed'
        })
      }

      // Perform sudo check
      try {
        conn.exec('sudo -n true 2>/dev/null && echo true || echo false', (err, stream) => {
          if (err) {
            readyResult.hasSudo = false
            sendReadyData(false)
          } else {
            stream
              .on('data', (data: Buffer) => {
                const result = data.toString().trim()
                readyResult.hasSudo = result === 'true'
              })
              .stderr.on('data', () => {
                readyResult.hasSudo = false
              })
              .on('close', () => {
                sendReadyData(false)
              })
          }
        })
      } catch (e) {
        readyResult.hasSudo = false
        sendReadyData(false)
      }

      // Perform cmd check
      try {
        let stdout = ''
        let stderr = ''
        conn.exec(
          'sh -c \'if command -v bash >/dev/null 2>&1; then bash -lc "compgen -A builtin; compgen -A command"; bash -ic "compgen -A alias" 2>/dev/null; else IFS=:; for d in $PATH; do [ -d "$d" ] || continue; for f in "$d"/*; do [ -x "$f" ] && printf "%s\\n" "${f##*/}"; done; done; fi\' | sort -u',
          (err, stream) => {
            if (err) {
              readyResult.commandList = []
              sendReadyData(false)
            } else {
              stream
                .on('data', (data: Buffer) => {
                  stdout += data.toString()
                })
                .stderr.on('data', (data: Buffer) => {
                  stderr += data.toString()
                })
                .on('close', () => {
                  if (stderr) {
                    readyResult.commandList = []
                  } else {
                    readyResult.commandList = stdout.split('\n').filter(Boolean)
                  }
                  sendReadyData(false)
                })
            }
          }
        )
      } catch (e) {
        readyResult.commandList = []
        sendReadyData(false)
      }
    })
    .on('error', (err) => {
      sftpConnections.set(id, { isSuccess: false, error: `sftp connection error: "${err.message}"` })
      readyResult.hasSudo = false
      readyResult.commandList = []
      sendReadyData(true)
      connectionStatus.set(id, {
        sftpAvailable: false,
        sftpError: err.message
      })
    })
  sshConnections.set(id + '-second', conn) // Save connection object
  conn.connect(connectConfig)
}

const handleAttemptConnection = async (event, connectionInfo, resolve, reject, retryCount) => {
  const { id, host, port, username, password, privateKey, passphrase, agentForward, needProxy, proxyConfig, connIdentToken } = connectionInfo
  retryCount++

  connectionStatus.set(id, { isVerified: false }) // Update connection status
  const identToken = connIdentToken ? `_t=${connIdentToken}` : ''
  const ident = `${packageInfo.name}_${packageInfo.version}` + identToken

  // Check connection reuse pool: only attempt reuse when using keyboard-interactive authentication
  const poolKey = getConnectionPoolKey(host, port || 22, username)
  const reusableConn = sshConnectionPool.get(poolKey)

  if (reusableConn && reusableConn.hasMfaAuth) {
    console.log(`[SSH Reuse] Detected reusable MFA connection: ${poolKey}`)

    // Use existing connection
    const conn = reusableConn.conn

    // Mark current session as connected
    sshConnections.set(id, conn)
    connectionStatus.set(id, { isVerified: true })
    reusableConn.sessions.add(id)

    // Trigger connection success event
    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: true })

    // Execute secondary connection (sudo check, SFTP, etc.)
    attemptSecondaryConnection(event, connectionInfo, ident)

    console.log(`[SSH Reuse] Successfully reused connection, skipping MFA authentication`)
    resolve({ status: 'connected', message: 'Connection successful (reused)' })
    return
  }

  const conn = new Client()

  conn.on('ready', () => {
    sshConnections.set(id, conn) // Save connection object
    connectionStatus.set(id, { isVerified: true })
    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: true })

    // Check if keyboard-interactive authentication was used
    // Must check before attemptSecondaryConnection as it will clear keyboardInteractiveOpts
    const hasKeyboardInteractive = keyboardInteractiveOpts.has(id)

    // If keyboard-interactive authentication was used, immediately save to connection pool for future reuse
    if (hasKeyboardInteractive) {
      const poolKey = getConnectionPoolKey(host, port || 22, username)
      console.log(`[SSH Connection Pool] Saving MFA authenticated connection: ${poolKey}`)

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
        console.log(`[SSH Connection Pool] Connection closed, cleaning up reuse pool: ${poolKey}`)
        sshConnectionPool.delete(poolKey)
      })

      conn.on('error', (err) => {
        console.error(`[SSH Connection Pool] Connection error, cleaning up reuse pool: ${poolKey}`, err.message)
        sshConnectionPool.delete(poolKey)
      })
    }

    // Execute secondary connection (this will clear keyboardInteractiveOpts, so must be placed after the check)
    attemptSecondaryConnection(event, connectionInfo, ident)

    resolve({ status: 'connected', message: 'Connection successful' })
  })

  conn.on('error', (err) => {
    connectionStatus.set(id, { isVerified: false })

    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: false })
    if (err.level === 'client-authentication' && KeyboardInteractiveAttempts.has(id)) {
      console.log('Authentication failed. Retrying...')

      if (retryCount < MaxKeyboardInteractiveAttempts) {
        handleAttemptConnection(event, connectionInfo, resolve, reject, retryCount)
      } else {
        reject(new Error('Maximum retries reached, authentication failed'))
      }
    } else {
      console.log('Connection error:', err)
      reject(new Error(err.message))
    }
  })

  // Configure connection settings
  const connectConfig: any = {
    host,
    port: port || 22,
    username,
    keepaliveInterval: 10000, // Keep connection alive
    tryKeyboard: true, // Enable keyboard interactive authentication
    readyTimeout: KeyboardInteractiveTimeout, // Connection timeout, 30 seconds
    algorithms: LEGACY_ALGORITHMS
  }
  if (needProxy) {
    connectConfig.sock = await createProxySocket(proxyConfig, host, port)
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
      console.log('SSH keyboard-interactive error:', errorMessage)

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
    conn.connect(connectConfig) // Attempt to connect
  } catch (err) {
    console.error('Connection configuration error:', err)
    reject(new Error(`Connection configuration error: ${err}`))
  }
}

const getUniqueRemoteName = async (sftp: SFTPWrapper, remoteDir: string, originalName: string, isDir: boolean): Promise<string> => {
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

export const getSftpConnection = (id: string): any => {
  const sftpConnectionInfo = sftpConnections.get(id)

  if (!sftpConnectionInfo) {
    console.log('Sftp connection not found')
    return null
  }

  if (!sftpConnectionInfo.isSuccess || !sftpConnectionInfo.sftp) {
    console.log(`SFTP not available: ${sftpConnectionInfo.error || 'Unknown error'}`)
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
    if (sshConnections.get(id + '-second')) {
      const connSec = sshConnections.get(id + '-second')
      connSec.end()
      sshConnections.delete(id + '-second')
    }
  }
}

// Upload file
const handleUploadFile = (_event, id, remotePath, localPath, resolve, reject) => {
  const sftp = getSftpConnection(id)
  if (!sftp) {
    return reject('Sftp Not connected')
  }

  fs.promises
    .access(localPath)
    .then(() => {
      const fileName = path.basename(localPath)
      return getUniqueRemoteName(sftp, remotePath, fileName, false)
    })
    .then((finalName) => {
      const remoteFilePath = path.posix.join(remotePath, finalName)

      return new Promise((res, rej) => {
        sftp.fastPut(localPath, remoteFilePath, {}, (err) => {
          if (err) return rej(err)
          res(remoteFilePath)
        })
      })
    })
    .then((remoteFilePath) => {
      resolve({ status: 'success', remoteFilePath })
    })
    .catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      reject(`Upload failed: ${errorMessage}`)
    })
}

// Delete file
const handleDeleteFile = (_event, id, remotePath, resolve, reject) => {
  const sftp = getSftpConnection(id)
  if (!sftp) {
    return reject('Sftp Not connected')
  }

  if (!remotePath || remotePath.trim() === '' || remotePath.trim() === '*' || remotePath === '/') {
    return reject('Illegal path, cannot be deleted')
  }

  new Promise<void>((res, rej) => {
    sftp.unlink(remotePath, (err) => {
      if (err) return rej(err)
      res()
    })
  })
    .then(() => {
      resolve({
        status: 'success',
        message: 'File deleted successfully',
        deletedPath: remotePath
      })
    })
    .catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      reject(`Delete failed: ${errorMessage}`)
    })
}
// download file
const handleDownloadFile = (_event, id, remotePath, localPath, resolve, reject) => {
  const sftp = getSftpConnection(id)
  if (!sftp) {
    return reject('Sftp Not connected')
  }

  // Use chained Promise instead of async/await
  new Promise<void>((res, rej) => {
    sftp.fastGet(remotePath, localPath, {}, (err) => {
      if (err) return rej(err)
      res()
    })
  })
    .then(() => {
      resolve({ status: 'success', localPath })
    })
    .catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      reject(`Download failed: ${errorMessage}`)
    })
}

// upload Directory
const uploadDirectory = (_event, id, localDir, remoteDir, resolve, reject) => {
  const sftp = getSftpConnection(id)
  if (!sftp) {
    return reject('Sftp Not connected')
  }

  const dirName = path.basename(localDir)

  getUniqueRemoteName(sftp, remoteDir, dirName, true)
    .then((finalName) => {
      const finalDir = path.posix.join(remoteDir, finalName)
      return new Promise<string>((res, rej) => {
        sftp.mkdir(finalDir, { mode: 0o755 }, (err) => {
          if (err && err.code !== 4) {
            return rej(err)
          } else {
            res(finalDir)
          }
        })
      })
    })
    .then((finalDir) => {
      const files = fs.readdirSync(localDir)
      const processNext = (index: number) => {
        if (index >= files.length) {
          return resolve({ status: 'success', localDir })
        }

        const file = files[index]
        const localPath = path.join(localDir, file)
        const remotePath = path.posix.join(finalDir, file)
        const stat = fs.statSync(localPath)

        if (stat.isDirectory()) {
          uploadDirectory(
            _event,
            id,
            localPath,
            finalDir,
            () => processNext(index + 1),
            (err) => reject(err)
          )
        } else {
          sftp.fastPut(localPath, remotePath, {}, (err) => {
            if (err) return reject(err)
            processNext(index + 1)
          })
        }
      }

      processNext(0)
    })
    .catch((err) => {
      reject(err?.message || String(err))
    })
}

export const registerSSHHandlers = () => {
  // Handle connection
  ipcMain.handle('ssh:connect', async (_event, connectionInfo) => {
    const { sshType } = connectionInfo

    if (sshType === 'jumpserver') {
      // Route to JumpServer connection
      try {
        const result = await handleJumpServerConnection(connectionInfo, _event)
        return result
      } catch (error: unknown) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    } else {
      // Default to SSH connection
      const retryCount = 0
      return new Promise((resolve, reject) => {
        handleAttemptConnection(_event, connectionInfo, resolve, reject, retryCount)
      })
    }
  })

  ipcMain.handle('ssh:sftp:conn:check', async (_event, { id }) => {
    if (connectionStatus.has(id)) {
      const status = connectionStatus.get(id)
      return status?.sftpAvailable === true
    }
    return false
  })

  ipcMain.handle('ssh:sftp:conn:list', async () => {
    return Array.from(sftpConnections.entries()).map(([key, sftpConn]) => ({
      id: key,
      isSuccess: sftpConn.isSuccess,
      error: sftpConn.error
    }))
  })

  ipcMain.handle('ssh:shell', async (event, { id, terminalType }) => {
    // Check if it's a JumpServer connection
    if (jumpserverConnections.has(id)) {
      // Use JumpServer shell handling
      const stream = jumpserverShellStreams.get(id)
      if (!stream) {
        return { status: 'error', message: 'JumpServer connection not found' }
      }

      // Clear old listeners
      stream.removeAllListeners('data')

      let buffer = ''
      let flushTimer: NodeJS.Timeout | null = null

      const flushBuffer = () => {
        if (!buffer) return
        const chunk = buffer
        buffer = ''
        event.sender.send(`ssh:shell:data:${id}`, { data: chunk, marker: '' })
        flushTimer = null
      }

      const scheduleFlush = () => {
        // Clear existing timer to prevent multiple timers
        if (flushTimer) {
          clearTimeout(flushTimer)
        }

        const delay = getDelayByBufferSize(buffer.length)

        if (delay === 0) {
          // Send immediately for small data (likely user input)
          flushBuffer()
        } else {
          // Schedule delayed flush for larger data
          flushTimer = setTimeout(flushBuffer, delay)
        }
      }

      stream.on('data', (data) => {
        const dataStr = data.toString()
        const lastCommand = jumpserverLastCommand.get(id)
        const exitCommands = ['exit', 'logout', '\x04']

        // JumpServer menu exit detection
        if (dataStr.includes('[Host]>') && lastCommand && exitCommands.includes(lastCommand)) {
          jumpserverLastCommand.delete(id)
          stream.write('q\r', (err) => {
            if (err) console.error(`[JumpServer ${id}] Failed to send "q":`, err)
            else console.log(`[JumpServer ${id}] Sent "q" to terminate session.`)
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
              marker: markedCmd.marker
            })
            return
          }
          markedCmd.output += dataStr
          markedCmd.lastActivity = Date.now()
          if (markedCmd.idleTimer) clearTimeout(markedCmd.idleTimer)
          markedCmd.idleTimer = setTimeout(() => {
            if (markedCmd && !markedCmd.completed) {
              markedCmd.completed = true
              event.sender.send(`ssh:shell:data:${id}`, {
                data: markedCmd.output,
                marker: markedCmd.marker
              })
              jumpserverMarkedCommands.delete(id)
            }
          }, 200)
        } else {
          buffer += dataStr
          scheduleFlush()
        }
      })

      stream.stderr.on('data', (data) => {
        event.sender.send(`ssh:shell:stderr:${id}`, data.toString())
      })

      stream.on('close', () => {
        flushBuffer()
        console.log(`JumpServer shell stream closed for id=${id}`)
        event.sender.send(`ssh:shell:close:${id}`)
        jumpserverShellStreams.delete(id)
      })

      return { status: 'success', message: 'JumpServer Shell ready' }
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

    const handleStream = (stream, method: 'shell' | 'exec') => {
      shellStreams.set(id, stream)

      let buffer = ''
      let flushTimer: NodeJS.Timeout | null = null

      const flushBuffer = () => {
        if (!buffer) return
        const chunk = buffer
        buffer = ''
        event.sender.send(`ssh:shell:data:${id}`, { data: chunk, marker: '' })
        flushTimer = null
      }

      const scheduleFlush = () => {
        // Clear existing timer to prevent multiple timers
        if (flushTimer) {
          clearTimeout(flushTimer)
        }

        const delay = getDelayByBufferSize(buffer.length)

        if (delay === 0) {
          // Send immediately for small data (likely user input)
          flushBuffer()
        } else {
          // Schedule delayed flush for larger data
          flushTimer = setTimeout(flushBuffer, delay)
        }
      }

      stream.on('data', (data) => {
        const markedCmd = markedCommands.get(id)
        const chunk = data.toString()

        if (markedCmd !== undefined) {
          markedCmd.output += chunk
          markedCmd.lastActivity = Date.now()
          if (markedCmd.idleTimer) clearTimeout(markedCmd.idleTimer)
          markedCmd.idleTimer = setTimeout(() => {
            if (markedCmd && !markedCmd.completed) {
              markedCmd.completed = true
              event.sender.send(`ssh:shell:data:${id}`, {
                data: markedCmd.output,
                marker: markedCmd.marker
              })
              markedCommands.delete(id)
            }
          }, 200)
        } else {
          buffer += chunk
          scheduleFlush()
        }
      })

      stream.stderr?.on('data', (data) => {
        event.sender.send(`ssh:shell:stderr:${id}`, data.toString())
      })

      stream.on('close', () => {
        flushBuffer()
        console.log(`Shell stream closed for id=${id} (${method})`)
        event.sender.send(`ssh:shell:close:${id}`)
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
          console.warn(`[${id}] exec(${cmd}) Failed: ${execErr.message}`)
          return tryExecFallback(rest, resolve, reject)
        }

        console.info(`[${id}] use exec(${cmd}) Successfully started the terminal`)
        handleStream(execStream, 'exec')
        resolve({ status: 'success', message: `The terminal has been started（exec:${cmd}）` })
      })
    }

    return new Promise((resolve, reject) => {
      if (!isConnected()) return reject(new Error('Connection disconnected, unable to start terminal'))

      setTimeout(() => {
        if (!isConnected()) return reject(new Error('The connection has been disconnected after a delay'))

        conn.shell({ term: termType }, (err, stream) => {
          if (err) {
            console.warn(`[${id}] shell() start error: ${err.message}`)
            return tryExecFallback(fallbackExecs, resolve, reject)
          }

          console.info(`[${id}] shell() Successfully started`)
          handleStream(stream, 'shell')
          resolve({ status: 'success', message: 'Shell has started' })
        })
      }, delayMs)
    })
  })

  // Resize handling
  ipcMain.handle('ssh:shell:resize', async (_event, { id, cols, rows }) => {
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
    // Check if it's a JumpServer connection
    if (jumpserverConnections.has(id)) {
      const stream = jumpserverShellStreams.get(id)
      if (stream) {
        // Use lineCommand for command detection, fallback to data.trim() if not available
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
        console.warn('Attempting to write to non-existent JumpServer stream:', id)
      }
      return
    }

    // Default SSH handling
    const stream = shellStreams.get(id)
    if (stream) {
      console.log(`ssh:shell:write (default) raw data: "${data}"`)
      // For default SSH connections, don't detect exit commands, let terminal handle exit naturally
      if (markedCommands.has(id)) {
        markedCommands.delete(id)
      }
      if (marker) {
        markedCommands.set(id, {
          marker,
          output: '',
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
      console.warn('Attempting to write to non-existent stream:', id)
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

    return new Promise((resolve) => {
      const timestamp = Date.now()
      const marker = `__CHATERM_EXEC_END_${timestamp}__`
      const exitCodeMarker = `__CHATERM_EXIT_CODE_${timestamp}__`
      let outputBuffer = ''
      let timeoutHandle: NodeJS.Timeout

      // Output listener
      const dataHandler = (data: Buffer) => {
        outputBuffer += data.toString()

        // End marker detected
        if (outputBuffer.includes(marker)) {
          cleanup()

          try {
            // Extract output content (remove command echo and markers)
            const lines = outputBuffer.split('\n')

            // Find command line position (command echo)
            const commandIndex = lines.findIndex((line) => line.trim().includes(cmd.trim()))

            // Find end marker position
            const markerIndex = lines.findIndex((line) => line.includes(marker))

            // Extract command output (between command line and marker)
            const outputLines = lines.slice(commandIndex + 1, markerIndex)
            const stdout = outputLines.join('\n').trim()

            // Extract exit code (from content after exitCodeMarker)
            const exitCodePattern = new RegExp(`${exitCodeMarker}(\\d+)`)
            const exitCodeMatch = outputBuffer.match(exitCodePattern)
            const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0

            resolve({
              success: exitCode === 0,
              stdout,
              stderr: '',
              exitCode,
              exitSignal: undefined
            })
          } catch (parseError) {
            // Return raw output on parse failure
            resolve({
              success: false,
              error: `Failed to parse command output: ${parseError}`,
              stdout: outputBuffer,
              stderr: '',
              exitCode: undefined,
              exitSignal: undefined
            })
          }
        }
      }

      // Cleanup function
      const cleanup = () => {
        execStream.removeListener('data', dataHandler)
        clearTimeout(timeoutHandle)
      }

      // Timeout protection (30 seconds)
      timeoutHandle = setTimeout(() => {
        cleanup()
        resolve({
          success: false,
          error: 'Command execution timeout (30s)',
          stdout: outputBuffer,
          stderr: '',
          exitCode: undefined,
          exitSignal: undefined
        })
      }, 30000)

      // Register listener
      execStream.on('data', dataHandler)

      // Send command (capture exit code)
      // Use bash trick: command; echo marker; echo exitcode_marker$?
      const fullCommand = `${cmd}; echo "${marker}"; echo "${exitCodeMarker}$?"\r`
      execStream.write(fullCommand)
    })
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

          const stdout = Buffer.concat(stdoutChunks).toString()
          const stderr = Buffer.concat(stderrChunks).toString()

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
          const stdout = Buffer.concat(stdoutChunks).toString()
          const stderr = Buffer.concat(stderrChunks).toString()

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

  ipcMain.handle('ssh:sftp:list', async (_e, { path, id }) => {
    return new Promise<unknown[]>((resolve) => {
      const sftp = getSftpConnection(id)
      if (!sftp) return resolve([''])

      sftp!.readdir(path, (err, list) => {
        if (err) {
          const errorCode = (err as { code?: number }).code
          switch (errorCode) {
            case 2: // SSH_FX_NO_SUCH_FILE
              return resolve([`cannot open directory '${path}': No such file or directory`])
            case 3: // SSH_FX_PERMISSION_DENIED
              return resolve([`cannot open directory '${path}': Permission denied`])
            case 4: // SSH_FX_FAILURE
              return resolve([`cannot open directory '${path}': Operation failed`])
            case 5: // SSH_FX_BAD_MESSAGE
              return resolve([`cannot open directory '${path}': Bad message format`])
            case 6: // SSH_FX_NO_CONNECTION
              return resolve([`cannot open directory '${path}': No connection`])
            case 7: // SSH_FX_CONNECTION_LOST
              return resolve([`cannot open directory '${path}': Connection lost`])
            case 8: // SSH_FX_OP_UNSUPPORTED
              return resolve([`cannot open directory '${path}': Operation not supported`])
            default:
              // Unknown error code
              const message = (err as Error).message || `Unknown error (code: ${errorCode})`
              return resolve([`cannot open directory '${path}': ${message}`])
          }
        }
        const files = list.map((item) => {
          const name = item.filename
          const attrs = item.attrs
          const prefix = path === '/' ? '/' : path + '/'
          return {
            name: name,
            path: prefix + name,
            isDir: attrs.isDirectory(),
            isLink: attrs.isSymbolicLink(),
            mode: '0' + (attrs.mode & 0o777).toString(8),
            modTime: new Date(attrs.mtime * 1000).toISOString().replace('T', ' ').slice(0, 19),
            size: attrs.size
          }
        })
        resolve(files)
      })
    })
  })

  ipcMain.handle('ssh:disconnect', async (_event, { id }) => {
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
        console.log(`Cleaning up JumpServer exec stream: ${id}`)
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
          console.log(`[JumpServer] All sessions closed, releasing underlying connection: ${id}`)
          connToClose.end()
        } else {
          console.log(`[JumpServer] Session disconnected, but underlying connection still in use by other sessions: ${id}`)
        }
        cleanSftpConnection(id)
        jumpserverConnections.delete(id)
        jumpserverConnectionStatus.delete(id)
        return { status: 'success', message: 'JumpServer connection disconnected' }
      }

      return { status: 'warning', message: 'No active JumpServer connection' }
    }

    // Default SSH handling
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
          console.log(`[SSH Connection Pool] All sessions closed, releasing connection: ${poolKey}`)
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
      return { status: 'success', message: 'Disconnected' }
    }
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

  //sftp
  ipcMain.handle('ssh:sftp:upload-file', (event, { id, remotePath, localPath }) => {
    return new Promise((resolve, reject) => {
      handleUploadFile(event, id, remotePath, localPath, resolve, reject)
    })
  })
  ipcMain.handle('ssh:sftp:upload-dir', (event, { id, remoteDir, localDir }) => {
    return new Promise((resolve, reject) => {
      uploadDirectory(event, id, localDir, remoteDir, resolve, reject)
    })
  })

  ipcMain.handle('ssh:sftp:download-file', (event, { id, remotePath, localPath }) => {
    return new Promise((resolve, reject) => {
      handleDownloadFile(event, id, remotePath, localPath, resolve, reject)
    })
  })

  ipcMain.handle('ssh:sftp:delete-file', (event, { id, remotePath }) => {
    return new Promise((resolve, reject) => {
      handleDeleteFile(event, id, remotePath, resolve, reject)
    })
  })

  ipcMain.handle('ssh:sftp:rename-move', async (_e, { id, oldPath, newPath }) => {
    const sftp = getSftpConnection(id)
    if (!sftp) return { status: 'error', message: 'Sftp Not connected' }

    try {
      if (oldPath === newPath) {
        return { status: 'success' }
      }
      await new Promise<void>((res, rej) => {
        sftp.rename(oldPath, newPath, (err) => (err ? rej(err) : res()))
      })
      return { status: 'success' }
    } catch (err) {
      return { status: 'error', message: (err as Error).message }
    }
  })

  ipcMain.handle('ssh:sftp:chmod', async (_e, { id, remotePath, mode, recursive }) => {
    const sftp = getSftpConnection(id)
    if (!sftp) return { status: 'error', message: 'Sftp Not connected' }

    try {
      const parsedMode = parseInt(String(mode), 8)
      console.log('remotePath:', remotePath)
      console.log('parsedMode:', parsedMode)
      console.log('recursive:', recursive)

      if (recursive) {
        const chmodRecursive = async (path: string): Promise<void> => {
          // Modify the permissions of the current path first
          await new Promise<void>((res, rej) => {
            sftp.chmod(path, parsedMode, (err) => (err ? rej(err) : res()))
          })

          // Retrieve directory contents
          const items = await new Promise<any[]>((res, rej) => {
            sftp.readdir(path, (err, list) => (err ? rej(err) : res(list || [])))
          })

          // Recursive processing of subdirectories and files
          for (const item of items) {
            if (item.filename === '.' || item.filename === '..') continue

            const itemPath = `${path}/${item.filename}`

            await new Promise<void>((res, rej) => {
              sftp.chmod(itemPath, parsedMode, (err) => (err ? rej(err) : res()))
            })

            if (item.attrs && item.attrs.isDirectory && item.attrs.isDirectory()) {
              await chmodRecursive(itemPath)
            }
          }
        }

        await chmodRecursive(remotePath)
      } else {
        await new Promise<void>((res, rej) => {
          sftp.chmod(remotePath, parsedMode, (err) => (err ? rej(err) : res()))
        })
      }

      return { status: 'success' }
    } catch (err) {
      return { status: 'error', message: (err as Error).message }
    }
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
      const result = await manager.enableAgent(enabled)
      console.log('SSH Agent enabled:', result.SSH_AUTH_SOCK)
      return { success: true }
    } catch (error: any) {
      console.error('Error in agent:enable-and-configure:', error)
      return { success: false }
    }
  })

  ipcMain.handle('ssh:agent:add-key', async (_e, { keyData, passphrase, comment }) => {
    try {
      const manager = SSHAgentManager.getInstance()
      const keyId = await manager.addKey(keyData, passphrase, comment)
      return { success: true, keyId }
    } catch (error: any) {
      console.error('Error in agent:add-key:', error)
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('ssh:agent:remove-key', async (_e, { keyId }) => {
    try {
      const manager = SSHAgentManager.getInstance()
      const removeStatus = manager.removeKey(keyId)
      return { success: removeStatus }
    } catch (error: any) {
      console.error('Error in agent:add-key:', error)
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('ssh:agent:list-key', async (_e) => {
    try {
      const manager = SSHAgentManager.getInstance()
      const keyIdMapList = manager.listKeys()
      return { success: true, keys: keyIdMapList }
    } catch (error: any) {
      console.error('Error in agent:add-key:', error)
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
}

const getSystemInfo = async (
  id: string
): Promise<{
  osVersion: string
  defaultShell: string
  homeDir: string
  hostname: string
  username: string
  sudoPermission: boolean
}> => {
  let conn = sshConnections.get(id)
  if (!conn) {
    const connData = jumpserverConnections.get(id)
    conn = connData?.conn
  }
  if (!conn) {
    throw new Error('No active SSH connection found')
  }

  const systemInfoScript = `uname -a | sed 's/^/OS_VERSION:/' && echo "DEFAULT_SHELL:$SHELL" && echo "HOME_DIR:$HOME" && hostname | sed 's/^/HOSTNAME:/' && whoami | sed 's/^/USERNAME:/' && (sudo -n true 2>/dev/null && echo "SUDO_CHECK:has sudo permission" || echo "SUDO_CHECK:no sudo permission")`

  return new Promise((resolve, reject) => {
    conn.exec(systemInfoScript, (err, stream) => {
      if (err) {
        return reject(err)
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      stream.on('close', () => {
        if (stderr) {
          return reject(new Error(stderr))
        }

        const lines = stdout.trim().split('\n')
        const result = {
          osVersion: '',
          defaultShell: '',
          homeDir: '',
          hostname: '',
          username: '',
          sudoPermission: false
        }

        lines.forEach((line) => {
          if (line.startsWith('OS_VERSION:')) {
            result.osVersion = line.replace('OS_VERSION:', '')
          } else if (line.startsWith('DEFAULT_SHELL:')) {
            result.defaultShell = line.replace('DEFAULT_SHELL:', '')
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

        resolve(result)
      })
    })
  })
}
