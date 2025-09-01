import { Client } from 'ssh2'
import { ipcMain } from 'electron'
import net from 'net'
import tls from 'tls'
import { getUserConfigFromRenderer } from '../../../index'
import { createProxySocket } from '../../../ssh/proxy'

// 存储 JumpServer 连接
export const jumpserverConnections = new Map()

// 执行命令结果
export interface JumpServerExecResult {
  stdout: string
  stderr: string
  exitCode?: number
  exitSignal?: string
}

// 存储 shell 会话流
export const jumpserverShellStreams = new Map()
export const jumpserverMarkedCommands = new Map()
export const jumpserverLastCommand = new Map()
const jumpserverInputBuffer = new Map() // 为每个会话创建输入缓冲区

export const jumpserverConnectionStatus = new Map()

// JumpServer 连接处理 - 导出供其他模块使用
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
}): Promise<{ status: string; message: string }> => {
  const connectionId = connectionInfo.id

  console.log(`[JumpServer ${connectionId}] 开始连接到 ${connectionInfo.host}:${connectionInfo.port || 22}`)
  console.log(`[JumpServer ${connectionId}] 用户名: ${connectionInfo.username}`)
  console.log(`[JumpServer ${connectionId}] 目标IP: ${connectionInfo.targetIp}`)
  console.log(`[JumpServer ${connectionId}] 认证方式: ${connectionInfo.privateKey ? '私钥' : '密码'}`)

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
      console.log(`[JumpServer ${connectionId}] 复用现有连接`)
      return resolve({ status: 'connected', message: '复用现有JumpServer连接' })
    }

    const conn = new Client()
    let outputBuffer = ''
    let connectionPhase = 'connecting'
    const startTime = Date.now()

    // 添加连接超时监控
    const connectionTimeout = setTimeout(() => {
      const elapsed = Date.now() - startTime
      console.error(`[JumpServer ${connectionId}] 连接超时，已等待 ${elapsed}ms`)
      console.error(`[JumpServer ${connectionId}] 当前阶段: ${connectionPhase}`)
      console.error(`[JumpServer ${connectionId}] 输出缓冲区内容: "${outputBuffer}"`)
      conn.end()
      reject(new Error(`JumpServer 连接超时: 在 ${elapsed}ms 后仍未完成握手`))
    }, 35000) // 35秒超时

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
      sock?: net.Socket | tls.TLSSocket
    } = {
      host: connectionInfo.host,
      port: connectionInfo.port || 22,
      username: connectionInfo.username,
      keepaliveInterval: 10000,
      readyTimeout: 30000,
      tryKeyboard: true // Enable keyboard interactive authentication for 2FA
    }

    if (connectionInfo.needProxy) {
      connectConfig.sock = sock
    }

    // 处理私钥认证
    if (connectionInfo.privateKey) {
      try {
        connectConfig.privateKey = Buffer.from(connectionInfo.privateKey)
        if (connectionInfo.passphrase) {
          connectConfig.passphrase = connectionInfo.passphrase
        }
        console.log(`[JumpServer ${connectionId}] 私钥认证配置完成`)
      } catch (err: unknown) {
        clearTimeout(connectionTimeout)
        console.error(`[JumpServer ${connectionId}] 私钥格式错误:`, err)
        return reject(new Error(`私钥格式错误: ${err instanceof Error ? err.message : String(err)}`))
      }
    } else if (connectionInfo.password) {
      connectConfig.password = connectionInfo.password
      console.log(`[JumpServer ${connectionId}] 密码认证配置完成`)
    } else {
      clearTimeout(connectionTimeout)
      console.error(`[JumpServer ${connectionId}] 缺少认证信息`)
      return reject(new Error('缺少认证信息：需要私钥或密码'))
    }

    // Handle keyboard-interactive authentication for 2FA
    conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
      try {
        console.log(`[JumpServer ${connectionId}] 需要二次验证，请输入验证码...`)

        // 直接使用简化的 MFA 处理
        const promptTexts = prompts.map((p: any) => p.prompt)

        // 发送 MFA 请求到前端
        const { BrowserWindow } = require('electron')
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          mainWindow.webContents.send('ssh:keyboard-interactive-request', {
            id: connectionId,
            prompts: promptTexts
          })
        }

        // 设置超时
        const timeoutId = setTimeout(() => {
          ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${connectionId}`)
          ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${connectionId}`)
          finish([])
          if (mainWindow) {
            mainWindow.webContents.send('ssh:keyboard-interactive-timeout', { id: connectionId })
          }
          reject(new Error('二次验证超时'))
        }, 30000) // 30秒超时

        // 监听用户响应
        ipcMain.once(`ssh:keyboard-interactive-response:${connectionId}`, (_evt: any, responses: string[]) => {
          clearTimeout(timeoutId)
          finish(responses)
        })

        // 监听用户取消
        ipcMain.once(`ssh:keyboard-interactive-cancel:${connectionId}`, () => {
          clearTimeout(timeoutId)
          finish([])
          reject(new Error('用户取消了二次验证'))
        })
      } catch (err) {
        console.error(`[JumpServer ${connectionId}] 二次验证失败:`, err)
        conn.end() // Close connection
        reject(err)
      }
    })

    conn.on('ready', () => {
      const elapsed = Date.now() - startTime
      console.log(`[JumpServer ${connectionId}] SSH连接建立成功，耗时 ${elapsed}ms，开始创建 shell`)

      // 发送MFA验证成功事件到前端
      const { BrowserWindow } = require('electron')
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        console.log(`[JumpServer ${connectionId}] 发送MFA验证成功事件:`, { connectionId, status: 'success' })
        mainWindow.webContents.send('ssh:keyboard-interactive-result', {
          id: connectionId,
          status: 'success'
        })
      }

      conn.shell((err, stream) => {
        if (err) {
          clearTimeout(connectionTimeout)
          console.error(`[JumpServer ${connectionId}] 创建shell失败:`, err)
          return reject(new Error(`创建 shell 失败: ${err.message}`))
        }

        console.log(`[JumpServer ${connectionId}] Shell创建成功，等待JumpServer菜单`)

        // 处理数据输出
        stream.on('data', (data: Buffer) => {
          const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
          const chunk = data.toString().replace(ansiRegex, '')
          outputBuffer += chunk

          console.log(`[JumpServer ${connectionId}] 收到数据 (阶段: ${connectionPhase}): "${chunk.replace(/\r?\n/g, '\\n')}"`)

          // 根据连接阶段处理不同的响应
          if (connectionPhase === 'connecting' && outputBuffer.includes('Opt>')) {
            console.log(`[JumpServer ${connectionId}] 检测到 JumpServer 菜单，输入目标 IP: ${connectionInfo.targetIp}`)
            connectionPhase = 'inputIp'
            outputBuffer = ''
            stream.write(connectionInfo.targetIp + '\r')
          } else if (connectionPhase === 'inputIp' && (outputBuffer.includes('Password:') || outputBuffer.includes('password:'))) {
            console.log(`[JumpServer ${connectionId}] 检测到密码提示，准备输入密码`)
            connectionPhase = 'inputPassword'
            outputBuffer = ''
            setTimeout(() => {
              console.log(`[JumpServer ${connectionId}] 发送目标服务器密码`)
              stream.write(connectionInfo.password + '\r')
            }, 100)
          } else if (connectionPhase === 'inputPassword') {
            // 检测密码认证错误
            if (outputBuffer.includes('password auth error') || outputBuffer.includes('[Host]>')) {
              console.error(`[JumpServer ${connectionId}] 目标服务器密码认证失败`)

              // 发送MFA验证失败事件到前端
              const { BrowserWindow } = require('electron')
              const mainWindow = BrowserWindow.getAllWindows()[0]
              if (mainWindow) {
                mainWindow.webContents.send('ssh:keyboard-interactive-result', {
                  id: connectionId,
                  status: 'failed'
                })
              }

              clearTimeout(connectionTimeout)
              conn.end()
              return reject(new Error('JumpServer 密码认证失败，请检查密码是否正确'))
            }
            // 检测连接成功
            if (outputBuffer.includes('$') || outputBuffer.includes('#') || outputBuffer.includes('~')) {
              const totalElapsed = Date.now() - startTime
              console.log(`[JumpServer ${connectionId}] 连接成功，到达目标服务器，总耗时 ${totalElapsed}ms`)
              clearTimeout(connectionTimeout)
              connectionPhase = 'connected'
              outputBuffer = ''

              // 保存连接对象和流对象
              jumpserverConnections.set(connectionId, conn)
              jumpserverShellStreams.set(connectionId, stream)
              jumpserverConnectionStatus.set(connectionId, { isVerified: true })

              resolve({ status: 'connected', message: '连接成功' })
            }
          }
        })

        stream.stderr.on('data', (data: Buffer) => {
          console.error(`[JumpServer ${connectionId}] stderr:`, data.toString())
        })

        stream.on('close', () => {
          const elapsed = Date.now() - startTime
          console.log(`[JumpServer ${connectionId}] stream关闭，连接阶段: ${connectionPhase}，耗时: ${elapsed}ms`)
          clearTimeout(connectionTimeout)
          jumpserverShellStreams.delete(connectionId)
          jumpserverConnections.delete(connectionId)
          jumpserverConnectionStatus.delete(connectionId)
          jumpserverLastCommand.delete(connectionId)
          jumpserverInputBuffer.delete(connectionId)
          if (connectionPhase !== 'connected') {
            reject(new Error('连接在完成前被关闭'))
          }
        })

        stream.on('error', (error: Error) => {
          console.error(`[JumpServer ${connectionId}] stream错误:`, error)
          clearTimeout(connectionTimeout)
          reject(error)
        })
      })
    })

    conn.on('error', (err: any) => {
      const elapsed = Date.now() - startTime
      console.error(`[JumpServer ${connectionId}] 连接错误，耗时 ${elapsed}ms:`, err)
      console.error(`[JumpServer ${connectionId}] 错误详情 - 代码: ${err.code}, 级别: ${err.level}`)

      // 发送MFA验证失败事件到前端
      const { BrowserWindow } = require('electron')
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('ssh:keyboard-interactive-result', {
          id: connectionId,
          status: 'failed'
        })
      }

      clearTimeout(connectionTimeout)
      reject(new Error(`JumpServer 连接失败: ${err.message}`))
    })

    console.log(`[JumpServer ${connectionId}] 开始建立SSH连接...`)
    conn.connect(connectConfig)
  })
}

// JumpServer 命令执行
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

// JumpServer 断开连接
export const jumpServerDisconnect = async (sessionId: string): Promise<{ status: string; message: string }> => {
  const stream = jumpserverShellStreams.get(sessionId)
  if (stream) {
    stream.end()
  }

  const conn = jumpserverConnections.get(sessionId)
  if (conn) {
    conn.end()
  }

  if (stream || conn) {
    console.log(`JumpServer disconnect initiated for id: ${sessionId}`)
    return { status: 'success', message: 'JumpServer 连接已断开' }
  }

  return { status: 'warning', message: '没有活动的 JumpServer 连接' }
}

// Shell 写入
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
    console.warn('尝试写入不存在的 JumpServer stream:', sessionId)
  }
}

// Shell 窗口大小调整
export const jumpServerShellResize = (sessionId: string, cols: number, rows: number): { status: string; message: string } => {
  const stream = jumpserverShellStreams.get(sessionId)
  if (!stream) {
    return { status: 'error', message: 'JumpServer Shell 未找到' }
  }

  try {
    stream.setWindow(rows, cols, 0, 0)
    return { status: 'success', message: `JumpServer 窗口大小已设置为 ${cols}x${rows}` }
  } catch (error: unknown) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
