import { Client } from 'ssh2'
import { ipcMain } from 'electron'
import net from 'net'
import tls from 'tls'
import { getUserConfigFromRenderer } from '../../../index'
import { createProxySocket } from '../../../ssh/proxy'
import { parseJumpServerUsers, hasUserSelectionPrompt } from '../../../ssh/jumpserver/parser'
import { handleJumpServerUserSelectionWithWindow } from '../../../ssh/jumpserver/userSelection'
import { jumpserverConnections as globalJumpserverConnections } from '../../../ssh/jumpserverHandle'

// Store JumpServer connections
export const jumpserverConnections = new Map()

// Command execution result
export interface JumpServerExecResult {
  stdout: string
  stderr: string
  exitCode?: number
  exitSignal?: string
}

// Store shell session streams
export const jumpserverShellStreams = new Map()
export const jumpserverMarkedCommands = new Map()
export const jumpserverLastCommand = new Map()
const jumpserverInputBuffer = new Map() // Create input buffer for each session

export const jumpserverConnectionStatus = new Map()

const findReusableConnection = (jumpserverUuid?: string) => {
  if (!jumpserverUuid) {
    return null
  }

  for (const [id, status] of jumpserverConnectionStatus.entries()) {
    const context = status as { source?: string; jumpserverUuid?: string } | undefined
    if (context?.jumpserverUuid === jumpserverUuid && context.source === 'shared') {
      const existingConn = jumpserverConnections.get(id)
      if (existingConn) {
        return { conn: existingConn as Client }
      }
    }
  }

  for (const [_id, data] of globalJumpserverConnections.entries()) {
    const record = data as { conn?: Client; jumpserverUuid?: string } | undefined
    if (record?.jumpserverUuid === jumpserverUuid && record.conn) {
      return { conn: record.conn }
    }
  }

  return null
}

const initializeJumpServerShell = (
  conn: Client,
  stream: any,
  {
    connectionInfo,
    connectionId,
    connectionTimeout,
    startTime,
    resolve,
    reject,
    connectionSource,
    jumpserverUuid
  }: {
    connectionInfo: {
      password?: string
      targetIp: string
    } & Record<string, any>
    connectionId: string
    connectionTimeout?: NodeJS.Timeout
    startTime: number
    resolve: (value: { status: string; message: string }) => void
    reject: (reason: Error) => void
    connectionSource: 'agent' | 'shared'
    jumpserverUuid: string
  }
) => {
  console.log(`[JumpServer ${connectionId}] Shell created successfully, waiting for JumpServer menu`)

  let connectionEstablished = false
  let outputBuffer = ''
  let connectionPhase = 'connecting'

  const handleConnectionSuccess = (reason: string) => {
    if (connectionEstablished) {
      return
    }
    connectionEstablished = true
    const totalElapsed = Date.now() - startTime
    console.log(`[JumpServer ${connectionId}] Connection successful (${reason}), reached target server, total time: ${totalElapsed}ms`)
    if (connectionTimeout) {
      clearTimeout(connectionTimeout)
    }
    connectionPhase = 'connected'
    outputBuffer = ''

    jumpserverConnections.set(connectionId, conn)
    jumpserverShellStreams.set(connectionId, stream)
    jumpserverConnectionStatus.set(connectionId, {
      isVerified: true,
      source: connectionSource,
      jumpserverUuid
    })

    resolve({ status: 'connected', message: 'Connection successful' })
  }

  const hasPasswordPrompt = (text: string): boolean => {
    return text.includes('Password:') || text.includes('password:')
  }

  const hasPasswordError = (text: string): boolean => {
    return text.includes('password auth error') || text.includes('[Host]>')
  }

  const detectDirectConnectionReason = (text: string): string | null => {
    if (!text) return null

    const indicators = ['Connecting to', 'Last login:', 'Last failed login:']
    for (const indicator of indicators) {
      if (text.includes(indicator)) {
        console.log(`[JumpServer ${connectionId}] Detected success indicator keyword: "${indicator.trim()}"`)
        return `Indicator ${indicator.trim()}`
      }
    }

    const lines = text.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed === '[Host]>' || trimmed.endsWith('Opt>')) continue
      const isPrompt =
        (trimmed.endsWith('$') || trimmed.endsWith('#') || trimmed.endsWith(']$') || trimmed.endsWith(']#') || trimmed.endsWith('>$')) &&
        (trimmed.includes('@') || trimmed.includes(':~') || trimmed.startsWith('['))
      if (isPrompt) {
        console.log(`[JumpServer ${connectionId}] Detected suspected shell prompt: "${trimmed}"`)
        return `Prompt ${trimmed}`
      }
    }

    return null
  }

  // Handle data output
  stream.on('data', (data: Buffer) => {
    const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
    const chunk = data.toString().replace(ansiRegex, '')
    outputBuffer += chunk

    console.log(`[JumpServer ${connectionId}] Received data (phase: ${connectionPhase}): "${chunk.replace(/\r?\n/g, '\\n')}"`)

    // Handle different responses based on connection phase
    if (connectionPhase === 'connecting' && outputBuffer.includes('Opt>')) {
      console.log(`[JumpServer ${connectionId}] Detected JumpServer menu, entering target IP: ${connectionInfo.targetIp}`)
      connectionPhase = 'inputIp'
      outputBuffer = ''
      stream.write(connectionInfo.targetIp + '\r')
    } else if (connectionPhase === 'inputIp') {
      // Check if user selection is required
      if (hasUserSelectionPrompt(outputBuffer)) {
        console.log(`[JumpServer ${connectionId}] Detected multi-user prompt, user needs to select account`)
        connectionPhase = 'selectUser'
        const users = parseJumpServerUsers(outputBuffer)
        console.log(`[JumpServer ${connectionId}] Parsed user list:`, users)

        if (users.length === 0) {
          console.error(`[JumpServer ${connectionId}] Failed to parse user list, buffer content:`, outputBuffer)
          if (connectionTimeout) {
            clearTimeout(connectionTimeout)
          }
          if (connectionSource === 'agent') {
            conn.end()
          }
          reject(new Error('Failed to parse user list'))
          return
        }

        outputBuffer = ''

        // Request user selection from frontend
        handleJumpServerUserSelectionWithWindow(connectionId, users)
          .then((selectedUserId) => {
            console.log(`[JumpServer ${connectionId}] User selected account ID:`, selectedUserId)
            connectionPhase = 'inputPassword'
            stream.write(selectedUserId.toString() + '\r')
          })
          .catch((err) => {
            console.error(`[JumpServer ${connectionId}] User selection failed:`, err)
            if (connectionTimeout) {
              clearTimeout(connectionTimeout)
            }
            if (connectionSource === 'agent') {
              conn.end()
            }
            reject(err)
          })
      } else if (hasPasswordPrompt(outputBuffer)) {
        console.log(`[JumpServer ${connectionId}] Detected password prompt, preparing to enter password`)
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        setTimeout(() => {
          console.log(`[JumpServer ${connectionId}] Sending target server password`)
          stream.write(connectionInfo.password + '\r')
        }, 100)
      } else {
        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          console.log(`[JumpServer ${connectionId}] Target asset directly enters target host without password, reason: ${reason}`)
          handleConnectionSuccess(`No password - ${reason}`)
        } else {
          const preview = outputBuffer.slice(-200).replace(/\r?\n/g, '\\n')
          console.log(`[JumpServer ${connectionId}] inputIp phase buffer preview: "${preview}"`)
        }
      }
    } else if (connectionPhase === 'selectUser') {
      // After user selection, check for password prompt or direct connection
      if (hasPasswordPrompt(outputBuffer)) {
        console.log(`[JumpServer ${connectionId}] Detected password prompt after user selection, preparing to enter password`)
        connectionPhase = 'inputPassword'
        outputBuffer = ''
        setTimeout(() => {
          console.log(`[JumpServer ${connectionId}] Sending target server password`)
          stream.write(connectionInfo.password + '\r')
        }, 100)
      } else {
        const reason = detectDirectConnectionReason(outputBuffer)
        if (reason) {
          console.log(`[JumpServer ${connectionId}] Direct connection established after user selection, reason: ${reason}`)
          handleConnectionSuccess(`User selection - ${reason}`)
        }
      }
    } else if (connectionPhase === 'inputPassword') {
      // Detect password authentication error
      if (hasPasswordError(outputBuffer)) {
        console.error(`[JumpServer ${connectionId}] Target server password authentication failed`)

        // Send MFA verification failure event to frontend
        const { BrowserWindow } = require('electron')
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          mainWindow.webContents.send('ssh:keyboard-interactive-result', {
            id: connectionId,
            status: 'failed'
          })
        }

        if (connectionTimeout) {
          clearTimeout(connectionTimeout)
        }
        if (connectionSource === 'agent') {
          conn.end()
        }
        reject(new Error('JumpServer password authentication failed, please check if password is correct'))
        return
      }
      // Detect connection success
      const reason = detectDirectConnectionReason(outputBuffer)
      if (reason) {
        console.log(`[JumpServer ${connectionId}] Entered target host after password verification, reason: ${reason}`)
        handleConnectionSuccess(`After password verification - ${reason}`)
      }
    }
  })

  stream.stderr.on('data', (data: Buffer) => {
    console.error(`[JumpServer ${connectionId}] stderr:`, data.toString())
  })

  stream.on('close', () => {
    const elapsed = Date.now() - startTime
    console.log(`[JumpServer ${connectionId}] Stream closed, connection phase: ${connectionPhase}, elapsed: ${elapsed}ms`)
    if (connectionTimeout) {
      clearTimeout(connectionTimeout)
    }
    jumpserverShellStreams.delete(connectionId)
    jumpserverConnections.delete(connectionId)
    jumpserverConnectionStatus.delete(connectionId)
    jumpserverLastCommand.delete(connectionId)
    jumpserverInputBuffer.delete(connectionId)
    if (connectionPhase !== 'connected') {
      reject(new Error('Connection closed before completion'))
    }
  })

  stream.on('error', (error: Error) => {
    console.error(`[JumpServer ${connectionId}] Stream error:`, error)
    if (connectionTimeout) {
      clearTimeout(connectionTimeout)
    }
    jumpserverConnectionStatus.delete(connectionId)
    reject(error)
  })
}

// JumpServer connection handling - exported for use by other modules
export const handleJumpServerConnection = async (connectionInfo: {
  id: string
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  targetIp: string
  needProxy: boolean
  proxyName: string
  assetUuid?: string
  ident?: string
}): Promise<{ status: string; message: string }> => {
  const connectionId = connectionInfo.id
  const jumpserverUuid = connectionInfo.assetUuid || connectionId

  console.log(`[JumpServer ${connectionId}] Starting connection to ${connectionInfo.host}:${connectionInfo.port || 22}`)
  console.log(`[JumpServer ${connectionId}] Username: ${connectionInfo.username}`)
  console.log(`[JumpServer ${connectionId}] Target IP: ${connectionInfo.targetIp}`)
  console.log(`[JumpServer ${connectionId}] Authentication method: ${connectionInfo.privateKey ? 'Private key' : 'Password'}`)

  let sock: net.Socket | tls.TLSSocket
  if (connectionInfo.needProxy) {
    const cfg = await getUserConfigFromRenderer()
    if (connectionInfo.proxyName) {
      const proxyConfig = cfg.sshProxyConfigs.find((item) => item.name === connectionInfo.proxyName)
      sock = await createProxySocket(proxyConfig, connectionInfo.host || '', connectionInfo.port || 22)
    }
  }

  return new Promise((resolve, reject) => {
    if (jumpserverConnections.has(connectionId)) {
      console.log(`[JumpServer ${connectionId}] Reusing existing connection`)
      jumpserverConnectionStatus.set(connectionId, {
        isVerified: true,
        source: 'agent',
        jumpserverUuid
      })
      return resolve({ status: 'connected', message: 'Reusing existing JumpServer connection' })
    }

    if (connectionInfo.assetUuid) {
      const reusable = findReusableConnection(jumpserverUuid)
      if (reusable) {
        console.log(`[JumpServer ${connectionId}] Found globally authenticated connection, attempting to reuse`)
        const startTime = Date.now()
        const connectionTimeout = setTimeout(() => {
          const elapsed = Date.now() - startTime
          console.error(`[JumpServer ${connectionId}] Reused connection shell creation timeout, waited ${elapsed}ms`)
          reject(new Error('JumpServer reused connection failed: Shell creation timeout'))
        }, 35000)

        reusable.conn.shell((err, stream) => {
          if (err) {
            clearTimeout(connectionTimeout)
            console.error(`[JumpServer ${connectionId}] Reused connection shell creation failed:`, err)
            reject(new Error(`Reused connection shell creation failed: ${err.message}`))
            return
          }

          initializeJumpServerShell(reusable.conn, stream, {
            connectionInfo,
            connectionId,
            connectionTimeout,
            startTime,
            resolve,
            reject,
            connectionSource: 'shared',
            jumpserverUuid
          })
        })
        return
      }
    }

    const conn = new Client()
    const startTime = Date.now()

    // Add connection timeout monitoring
    const connectionTimeout = setTimeout(() => {
      const elapsed = Date.now() - startTime
      console.error(`[JumpServer ${connectionId}] Connection timeout, waited ${elapsed}ms`)
      conn.end()
      reject(new Error(`JumpServer connection timeout: Handshake not completed after ${elapsed}ms`))
    }, 35000) // 35 second timeout

    const connectConfig: {
      host: string
      port: number
      username: string
      keepaliveInterval: number
      readyTimeout: number
      tryKeyboard: boolean
      privateKey?: Buffer
      passphrase?: string
      password?: string
      ident?: string
      sock?: net.Socket | tls.TLSSocket
    } = {
      host: connectionInfo.host,
      port: connectionInfo.port || 22,
      username: connectionInfo.username,
      keepaliveInterval: 10000,
      readyTimeout: 30000,
      ident: connectionInfo.ident,
      tryKeyboard: true // Enable keyboard interactive authentication for 2FA
    }

    if (connectionInfo.needProxy) {
      connectConfig.sock = sock
    }

    // Handle private key authentication
    if (connectionInfo.privateKey) {
      try {
        connectConfig.privateKey = Buffer.from(connectionInfo.privateKey)
        if (connectionInfo.passphrase) {
          connectConfig.passphrase = connectionInfo.passphrase
        }
        console.log(`[JumpServer ${connectionId}] Private key authentication configured`)
      } catch (err: unknown) {
        clearTimeout(connectionTimeout)
        console.error(`[JumpServer ${connectionId}] Private key format error:`, err)
        return reject(new Error(`Private key format error: ${err instanceof Error ? err.message : String(err)}`))
      }
    } else if (connectionInfo.password) {
      connectConfig.password = connectionInfo.password
      console.log(`[JumpServer ${connectionId}] Password authentication configured`)
    } else {
      clearTimeout(connectionTimeout)
      console.error(`[JumpServer ${connectionId}] Missing authentication information`)
      return reject(new Error('Missing authentication information: Private key or password required'))
    }

    // Handle keyboard-interactive authentication for 2FA
    conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
      try {
        console.log(`[JumpServer ${connectionId}] Two-factor authentication required, please enter verification code...`)

        // Use simplified MFA handling directly
        const promptTexts = prompts.map((p: any) => p.prompt)

        // Send MFA request to frontend
        const { BrowserWindow } = require('electron')
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          mainWindow.webContents.send('ssh:keyboard-interactive-request', {
            id: connectionId,
            prompts: promptTexts
          })
        }

        // Set timeout
        const timeoutId = setTimeout(() => {
          ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${connectionId}`)
          ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${connectionId}`)
          finish([])
          if (mainWindow) {
            mainWindow.webContents.send('ssh:keyboard-interactive-timeout', { id: connectionId })
          }
          reject(new Error('Two-factor authentication timeout'))
        }, 30000) // 30 second timeout

        // Listen for user response
        ipcMain.once(`ssh:keyboard-interactive-response:${connectionId}`, (_evt: any, responses: string[]) => {
          clearTimeout(timeoutId)
          finish(responses)
        })

        // Listen for user cancellation
        ipcMain.once(`ssh:keyboard-interactive-cancel:${connectionId}`, () => {
          clearTimeout(timeoutId)
          finish([])
          reject(new Error('User cancelled two-factor authentication'))
        })
      } catch (err) {
        console.error(`[JumpServer ${connectionId}] Two-factor authentication failed:`, err)
        conn.end() // Close connection
        reject(err)
      }
    })

    conn.on('ready', () => {
      const elapsed = Date.now() - startTime
      console.log(`[JumpServer ${connectionId}] SSH connection established successfully, elapsed ${elapsed}ms, starting shell creation`)

      // Send MFA verification success event to frontend
      const { BrowserWindow } = require('electron')
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        console.log(`[JumpServer ${connectionId}] Sending MFA verification success event:`, { connectionId, status: 'success' })
        mainWindow.webContents.send('ssh:keyboard-interactive-result', {
          id: connectionId,
          status: 'success'
        })
      }

      conn.shell((err, stream) => {
        if (err) {
          clearTimeout(connectionTimeout)
          console.error(`[JumpServer ${connectionId}] Shell creation failed:`, err)
          return reject(new Error(`Shell creation failed: ${err.message}`))
        }

        initializeJumpServerShell(conn, stream, {
          connectionInfo,
          connectionId,
          connectionTimeout,
          startTime,
          resolve,
          reject,
          connectionSource: 'agent',
          jumpserverUuid
        })
      })
    })

    conn.on('error', (err: any) => {
      const elapsed = Date.now() - startTime
      console.error(`[JumpServer ${connectionId}] Connection error, elapsed ${elapsed}ms:`, err)
      console.error(`[JumpServer ${connectionId}] Error details - code: ${err.code}, level: ${err.level}`)

      // Send MFA verification failure event to frontend
      const { BrowserWindow } = require('electron')
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('ssh:keyboard-interactive-result', {
          id: connectionId,
          status: 'failed',
          message: 'MFA verification failed, please re-enter verification code'
        })
      }

      clearTimeout(connectionTimeout)
      jumpserverConnectionStatus.delete(connectionId)
      reject(new Error(`JumpServer connection failed: ${err.message}`))
    })

    console.log(`[JumpServer ${connectionId}] Starting SSH connection...`)
    conn.connect(connectConfig)
  })
}

// JumpServer command execution
export const jumpServerExec = async (sessionId: string, command: string): Promise<JumpServerExecResult> => {
  const conn = jumpserverConnections.get(sessionId)
  if (!conn) {
    throw new Error(`No JumpServer connection for id=${sessionId}`)
  }

  return new Promise((resolve) => {
    conn.exec(command, (err: any, stream: any) => {
      if (err) {
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1
        })
        return
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      stream.on('close', (code: number, signal: string) => {
        resolve({
          stdout,
          stderr,
          exitCode: code,
          exitSignal: signal
        })
      })
    })
  })
}

// JumpServer disconnect
export const jumpServerDisconnect = async (sessionId: string): Promise<{ status: string; message: string }> => {
  const status = jumpserverConnectionStatus.get(sessionId) as { source?: string } | undefined
  const stream = jumpserverShellStreams.get(sessionId)
  if (stream) {
    stream.end()
  }

  const conn = jumpserverConnections.get(sessionId)
  if (conn && status?.source !== 'shared') {
    conn.end()
  }

  jumpserverConnectionStatus.delete(sessionId)

  if (stream || conn) {
    console.log(`JumpServer disconnect initiated for id: ${sessionId}`)
    return { status: 'success', message: 'JumpServer connection disconnected' }
  }

  return { status: 'warning', message: 'No active JumpServer connection' }
}

// Shell write
export const jumpServerShellWrite = (sessionId: string, data: string, marker?: string): void => {
  const stream = jumpserverShellStreams.get(sessionId)
  if (stream) {
    if (!jumpserverInputBuffer.has(sessionId)) {
      jumpserverInputBuffer.set(sessionId, '')
    }

    if (jumpserverMarkedCommands.has(sessionId)) {
      jumpserverMarkedCommands.delete(sessionId)
    }
    if (marker) {
      jumpserverMarkedCommands.set(sessionId, {
        marker,
        output: '',
        completed: false,
        lastActivity: Date.now(),
        idleTimer: null
      })
    }
    stream.write(data)
  } else {
    console.warn('Attempting to write to non-existent JumpServer stream:', sessionId)
  }
}

// Shell window resize
export const jumpServerShellResize = (sessionId: string, cols: number, rows: number): { status: string; message: string } => {
  const stream = jumpserverShellStreams.get(sessionId)
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
