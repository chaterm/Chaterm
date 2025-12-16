import { ipcMain } from 'electron'
import { Client } from 'ssh2'
import net from 'net'
import tls from 'tls'
import type { Readable } from 'stream'
import { createProxySocket } from '../proxy'
import { attemptSecondaryConnection, keyboardInteractiveOpts, sftpConnections, connectionStatus, LEGACY_ALGORITHMS } from '../sshHandle'
import { jumpserverConnections, jumpserverShellStreams, jumpserverMarkedCommands, jumpserverInputBuffer } from './state'
import type { JumpServerConnectionInfo } from './constants'
import { MAX_JUMPSERVER_MFA_ATTEMPTS } from './constants'
import { setupJumpServerInteraction } from './interaction'
import { handleJumpServerKeyboardInteractive } from './mfa'
import path from 'path'
import fs from 'fs'

export type PackageInfo = { name: string; version: string } & Record<string, unknown>

function safeAppPath(): string {
  try {
    const { app } = require('electron') as { app?: { getAppPath?: () => string } }
    if (app?.getAppPath) return app.getAppPath()
  } catch {}
  return process.cwd()
}

export function getPackageInfo(
  fallbackRelative: string = '../../package.json',
  defaultInfo: PackageInfo = { name: 'xxx', version: 'unknown' }
): PackageInfo {
  try {
    const appPath = safeAppPath()
    const packagePath = path.join(appPath, 'package.json')
    const sourcePath = fs.existsSync(packagePath) ? packagePath : path.join(__dirname, fallbackRelative)

    return JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as PackageInfo
  } catch (e) {
    console.error('Failed to read package.json:', e)
    return { ...defaultInfo }
  }
}

// 建立sftp
const sftpAsync = (conn, connectionId) => {
  return new Promise<void>((resolve) => {
    conn.sftp((err, sftp) => {
      if (err || !sftp) {
        console.log(`SFTPCheckError [${connectionId}]`, err)
        connectionStatus.set(connectionId, {
          sftpAvailable: false,
          sftpError: err?.message || 'SFTP object is empty'
        })
        sftpConnections.set(connectionId, { isSuccess: false, error: `sftp init error: "${err?.message || 'SFTP object is empty'}"` })
        resolve()
      } else {
        console.log(`startSftp [${connectionId}]`)
        sftp.readdir('.', (readDirErr) => {
          if (readDirErr) {
            console.log(`SFTPCheckFailed [${connectionId}]`)
            connectionStatus.set(connectionId, {
              sftpAvailable: false,
              sftpError: readDirErr.message
            })
            sftp.end()
          } else {
            console.log(`SFTPCheckSuccess [${connectionId}]`)
            sftpConnections.set(connectionId, { isSuccess: true, sftp: sftp })
            connectionStatus.set(connectionId, { sftpAvailable: true })
          }
          resolve()
        })
      }
    })
  })
}
const attemptJumpServerConnection = async (
  connectionInfo: JumpServerConnectionInfo,
  event?: Electron.IpcMainInvokeEvent,
  attemptCount: number = 0
): Promise<{ status: string; message: string }> => {
  const connectionId = connectionInfo.id

  const sendStatusUpdate = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    if (event) {
      event.sender.send('jumpserver:status-update', {
        id: connectionId,
        message,
        type,
        timestamp: new Date().toLocaleTimeString()
      })
    }
  }

  let sock: net.Socket | tls.TLSSocket | undefined
  if (connectionInfo.needProxy && connectionInfo.proxyConfig) {
    sock = await createProxySocket(connectionInfo.proxyConfig, connectionInfo.host, connectionInfo.port || 22)
  }
  const identToken = connectionInfo.connIdentToken ? `_t=${connectionInfo.connIdentToken}` : ''
  const packageInfo = getPackageInfo()
  const ident = `${packageInfo.name}_${packageInfo.version}` + identToken

  return new Promise((resolve, reject) => {
    const jumpserverUuid = connectionInfo.assetUuid || connectionId

    if (connectionInfo.assetUuid) {
      for (const [, existingData] of jumpserverConnections.entries()) {
        if (existingData.jumpserverUuid === jumpserverUuid) {
          sendStatusUpdate('复用现有连接，正在创建新的Shell会话...', 'info')

          const conn = existingData.conn
          conn.shell({ term: connectionInfo.terminalType || 'vt100' }, (err, newStream) => {
            if (err) {
              console.error('复用连接创建 shell 失败:', err)
              reject(new Error(`复用连接创建 shell 失败: ${err.message}`))
              return
            }
            // 建立sftp连接
            // TODO jumpserver下复用conn实现,其他堡垒机可能需要new conn
            try {
              sftpAsync(conn, connectionId)
            } catch (e) {
              connectionStatus.set(connectionId, {
                sftpAvailable: false,
                sftpError: 'SFTP connection failed'
              })
            }
            setupJumpServerInteraction(newStream, connectionInfo, connectionId, jumpserverUuid, conn, event, sendStatusUpdate, resolve, reject)
          })

          return
        }
      }
    }

    sendStatusUpdate('正在连接到远程堡垒机...', 'info')

    const conn = new Client()

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
      ident: string
      sock?: Readable
      algorithms?: typeof LEGACY_ALGORITHMS
    } = {
      host: connectionInfo.host,
      port: connectionInfo.port || 22,
      username: connectionInfo.username,
      keepaliveInterval: 10000,
      readyTimeout: 30000,
      tryKeyboard: true,
      ident: ident,
      algorithms: LEGACY_ALGORITHMS
    }

    if (sock) {
      connectConfig.sock = sock
    }

    if (connectionInfo.privateKey) {
      try {
        connectConfig.privateKey = Buffer.from(connectionInfo.privateKey)
        if (connectionInfo.passphrase) {
          connectConfig.passphrase = connectionInfo.passphrase
        }
      } catch (err: unknown) {
        reject(new Error(`私钥格式错误: ${err instanceof Error ? err.message : String(err)}`))
        return
      }
    } else if (connectionInfo.password) {
      connectConfig.password = connectionInfo.password
    } else {
      reject(new Error('缺少认证信息：需要私钥或密码'))
      return
    }

    conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
      try {
        if (attemptCount === 0) {
          sendStatusUpdate('需要二次验证，请输入验证码...', 'info')
        } else {
          sendStatusUpdate(`验证失败，请重新输入验证码 (${attemptCount + 1}/${MAX_JUMPSERVER_MFA_ATTEMPTS})...`, 'warning')
        }

        await handleJumpServerKeyboardInteractive(event, connectionId, prompts, finish)
      } catch (err) {
        sendStatusUpdate('二次验证失败', 'error')
        conn.end()
        reject(err as Error)
      }
    })

    conn.on('ready', () => {
      console.log('JumpServer 连接建立，开始创建 shell')
      sendStatusUpdate('已成功连接到堡垒机，请稍等...', 'success')
      attemptSecondaryConnection(event, connectionInfo, ident)

      if (event && keyboardInteractiveOpts.has(connectionId)) {
        console.log('发送MFA验证成功事件:', { connectionId, status: 'success' })
        event.sender.send('ssh:keyboard-interactive-result', {
          id: connectionId,
          status: 'success'
        })
      }

      conn.shell({ term: connectionInfo.terminalType || 'vt100' }, (err, stream) => {
        if (err) {
          reject(new Error(`创建 shell 失败: ${err.message}`))
          return
        }

        setupJumpServerInteraction(stream, connectionInfo, connectionId, jumpserverUuid, conn, event, sendStatusUpdate, resolve, reject)
      })
    })

    conn.on('error', (err) => {
      console.error('JumpServer connection error:', err)

      if ((err as any).level === 'client-authentication') {
        console.log(`JumpServer MFA认证失败，尝试次数: ${attemptCount + 1}/${MAX_JUMPSERVER_MFA_ATTEMPTS}`)

        if (event) {
          event.sender.send('ssh:keyboard-interactive-result', {
            id: connectionId,
            attempts: attemptCount + 1,
            status: 'failed'
          })
        }

        if (attemptCount < MAX_JUMPSERVER_MFA_ATTEMPTS - 1) {
          const retryError = new Error(`JumpServer MFA认证失败`)
          ;(retryError as any).shouldRetry = true
          ;(retryError as any).attemptCount = attemptCount
          reject(retryError)
          return
        }
      }

      if (event) {
        event.sender.send('ssh:keyboard-interactive-result', {
          id: connectionId,
          status: 'failed',
          final: true
        })
      }

      reject(new Error(`JumpServer 连接失败: ${err.message}`))
    })

    conn.connect(connectConfig)
  })
}

export const handleJumpServerConnection = async (
  connectionInfo: JumpServerConnectionInfo,
  event?: Electron.IpcMainInvokeEvent
): Promise<{ status: string; message: string }> => {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_JUMPSERVER_MFA_ATTEMPTS; attempt++) {
    try {
      console.log(`JumpServer连接尝试 ${attempt + 1}/${MAX_JUMPSERVER_MFA_ATTEMPTS}`)
      const result = await attemptJumpServerConnection(connectionInfo, event, attempt)
      return result
    } catch (error) {
      lastError = error as Error
      console.log(`JumpServer连接尝试 ${attempt + 1} 失败:`, lastError.message)

      if ((lastError as any).shouldRetry && attempt < MAX_JUMPSERVER_MFA_ATTEMPTS - 1) {
        console.log(`将进行第 ${attempt + 2} 次重试...`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }
      break
    }
  }

  if (event) {
    event.sender.send('ssh:keyboard-interactive-result', {
      id: connectionInfo.id,
      status: 'failed',
      final: true
    })
  }

  throw lastError || new Error('JumpServer连接失败')
}

export const registerJumpServerHandlers = () => {
  ipcMain.handle('jumpserver:connect', async (event, connectionInfo: JumpServerConnectionInfo) => {
    try {
      return await handleJumpServerConnection(connectionInfo, event)
    } catch (error: unknown) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('jumpserver:shell', async (_event, { id }) => {
    const stream = jumpserverShellStreams.get(id)
    if (!stream) {
      return { status: 'error', message: '未找到 JumpServer 连接' }
    }

    return { status: 'success', message: 'JumpServer Shell 已就绪' }
  })

  ipcMain.on('jumpserver:shell:write', (_event, { id, data, marker }) => {
    const stream = jumpserverShellStreams.get(id)
    if (stream) {
      if (!jumpserverInputBuffer.has(id)) {
        jumpserverInputBuffer.set(id, '')
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
      stream.write(data)
    } else {
      console.warn('尝试写入不存在的 JumpServer stream:', id)
    }
  })

  ipcMain.handle('jumpserver:conn:exec', async (_event, { id, cmd }) => {
    const conn = jumpserverConnections.get(id)
    if (!conn) {
      return {
        success: false,
        error: `No JumpServer connection for id=${id}`,
        stdout: '',
        stderr: '',
        exitCode: undefined,
        exitSignal: undefined
      }
    }

    return new Promise((resolve) => {
      conn.conn.exec(cmd, (err, stream) => {
        if (err) {
          resolve({
            success: false,
            error: err.message,
            stdout: '',
            stderr: '',
            exitCode: undefined,
            exitSignal: undefined
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
            success: code === 0,
            error: code !== 0 ? `Command failed with exit code: ${code}` : undefined,
            stdout,
            stderr,
            exitCode: code,
            exitSignal: signal
          })
        })
      })
    })
  })

  ipcMain.handle('jumpserver:shell:resize', async (_event, { id, cols, rows }) => {
    const stream = jumpserverShellStreams.get(id)
    if (!stream) {
      return { status: 'error', message: 'JumpServer Shell 未找到' }
    }

    try {
      stream.setWindow(rows, cols, 0, 0)
      return { status: 'success', message: `JumpServer 窗口大小已设置为 ${cols}x${rows}` }
    } catch (error: unknown) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })
}
