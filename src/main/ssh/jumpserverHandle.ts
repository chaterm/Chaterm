import { ipcMain } from 'electron'
import { Client } from 'ssh2'
import { keyboardInteractiveOpts, attemptSecondaryConnection, sftpConnections, getSftpConnection } from './sshHandle'

// JumpServer专用的MFA处理函数
const handleJumpServerKeyboardInteractive = (event, id, prompts, finish) => {
  return new Promise<void>((resolve, reject) => {
    // 发送MFA请求到前端
    event.sender.send('ssh:keyboard-interactive-request', {
      id,
      prompts: prompts.map((p) => p.prompt)
    })

    // 设置超时
    const timeoutId = setTimeout(() => {
      ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${id}`)
      ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${id}`)
      finish([])
      event.sender.send('ssh:keyboard-interactive-timeout', { id })
      reject(new Error('二次验证超时'))
    }, 30000) // 30秒超时

    // 监听用户响应，验证结果通过ready/error事件处理
    ipcMain.once(`ssh:keyboard-interactive-response:${id}`, (_evt, responses) => {
      clearTimeout(timeoutId)
      finish(responses)
      keyboardInteractiveOpts.set(id, responses)
      // 不等待验证结果，让SSH连接的ready/error事件处理验证结果
      resolve()
    })

    // 监听用户取消
    ipcMain.once(`ssh:keyboard-interactive-cancel:${id}`, () => {
      clearTimeout(timeoutId)
      finish([])
      reject(new Error('用户取消了二次验证'))
    })
  })
}

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

// JumpServer 连接处理 - 导出供 sshHandle 使用
export const handleJumpServerConnection = async (
  connectionInfo: {
    id: string
    host: string
    port?: number
    username: string
    password?: string
    privateKey?: string
    passphrase?: string
    targetIp: string
    terminalType?: string
  },
  event?: Electron.IpcMainInvokeEvent
): Promise<{ status: string; message: string }> => {
  const connectionId = connectionInfo.id

  // 发送状态更新的辅助函数
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

  return new Promise((resolve, reject) => {
    if (jumpserverConnections.has(connectionId)) {
      console.log('复用现有JumpServer连接')
      return resolve({ status: 'connected', message: '复用现有JumpServer连接' })
    }

    sendStatusUpdate('正在连接到远程服务器...', 'info')

    const conn = new Client()
    let outputBuffer = ''
    let connectionPhase = 'connecting'

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
    } = {
      host: connectionInfo.host,
      port: connectionInfo.port || 22,
      username: connectionInfo.username,
      keepaliveInterval: 10000,
      readyTimeout: 30000,
      tryKeyboard: true // Enable keyboard interactive authentication for 2FA
    }

    // 处理私钥认证
    if (connectionInfo.privateKey) {
      try {
        connectConfig.privateKey = Buffer.from(connectionInfo.privateKey)
        if (connectionInfo.passphrase) {
          connectConfig.passphrase = connectionInfo.passphrase
        }
      } catch (err: unknown) {
        return reject(new Error(`私钥格式错误: ${err instanceof Error ? err.message : String(err)}`))
      }
    } else if (connectionInfo.password) {
      connectConfig.password = connectionInfo.password
    } else {
      return reject(new Error('缺少认证信息：需要私钥或密码'))
    }

    // Handle keyboard-interactive authentication for 2FA
    conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
      try {
        sendStatusUpdate('需要二次验证，请输入验证码...', 'info')
        // JumpServer specific MFA handling
        await handleJumpServerKeyboardInteractive(event, connectionId, prompts, finish)
      } catch (err) {
        sendStatusUpdate('二次验证失败', 'error')
        conn.end() // Close connection
        reject(err)
      }
    })

    conn.on('ready', () => {
      console.log('JumpServer 连接建立，开始创建 shell')
      sendStatusUpdate('已成功连接到服务器，请稍等...', 'success')
      attemptSecondaryConnection(event, connectionInfo)
      // 发送MFA验证成功事件到前端
      if (event) {
        console.log('发送MFA验证成功事件:', { connectionId, status: 'success' })
        event.sender.send('ssh:keyboard-interactive-result', {
          id: connectionId,
          status: 'success'
        })
      }

      conn.shell({ term: connectionInfo.terminalType || 'vt100' }, (err, stream) => {
        if (err) {
          return reject(new Error(`创建 shell 失败: ${err.message}`))
        }

        // 处理数据输出
        stream.on('data', (data: Buffer) => {
          const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nry=><]/g
          const chunk = data.toString().replace(ansiRegex, '')
          outputBuffer += chunk
          // console.log(`Phase: ${connectionPhase}, Buffer: ${outputBuffer}`)

          // 根据连接阶段处理不同的响应
          if (connectionPhase === 'connecting' && outputBuffer.includes('Opt>')) {
            console.log('检测到 JumpServer 菜单，输入目标 IP')
            sendStatusUpdate(`正在连接到目标服务器...`, 'info')
            connectionPhase = 'inputIp'
            outputBuffer = ''
            stream.write(connectionInfo.targetIp + '\r')
          } else if (connectionPhase === 'inputIp' && (outputBuffer.includes('Password:') || outputBuffer.includes('password:'))) {
            console.log('检测到密码提示，输入密码')
            sendStatusUpdate('正在进行身份验证...', 'info')
            connectionPhase = 'inputPassword'
            outputBuffer = ''
            setTimeout(() => {
              stream.write(connectionInfo.password + '\r')
            }, 100)
          } else if (connectionPhase === 'inputPassword') {
            // 检测密码认证错误
            if (outputBuffer.includes('password auth error') || outputBuffer.includes('[Host]>')) {
              console.log('JumpServer 密码认证失败')

              // 发送MFA验证失败事件到前端
              if (event) {
                event.sender.send('ssh:keyboard-interactive-result', {
                  id: connectionId,
                  status: 'failed'
                })
              }

              conn.end()
              return reject(new Error('JumpServer 密码认证失败，请检查密码是否正确'))
            }
            // 检测连接成功
            if (outputBuffer.includes('$') || outputBuffer.includes('#') || outputBuffer.includes('~')) {
              console.log('JumpServer 连接成功，到达目标服务器')
              sendStatusUpdate('已成功连接到服务器，请稍等...', 'success')
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
          console.error('JumpServer stderr:', data.toString())
        })

        stream.on('close', () => {
          console.log(`JumpServer stream closed for connection ${connectionId}`)
          jumpserverShellStreams.delete(connectionId)
          jumpserverConnections.delete(connectionId)
          jumpserverConnectionStatus.delete(connectionId)
          jumpserverLastCommand.delete(connectionId) // 确保关闭时也清理
          jumpserverInputBuffer.delete(connectionId) // 清理缓冲区
          if (connectionPhase !== 'connected') {
            reject(new Error('连接在完成前被关闭'))
          }
        })

        stream.on('error', (error: Error) => {
          console.error('JumpServer stream error:', error)
          reject(error)
        })
      })
    })

    conn.on('error', (err) => {
      console.error('JumpServer connection error:', err)

      // 发送MFA验证失败事件到前端
      if (event) {
        event.sender.send('ssh:keyboard-interactive-result', { id: connectionId, status: 'failed' })
      }

      reject(new Error(`JumpServer 连接失败: ${err.message}`))
    })

    conn.connect(connectConfig)
  })
}

export const registerJumpServerHandlers = () => {
  // 处理 JumpServer 连接
  ipcMain.handle('jumpserver:connect', async (event, connectionInfo) => {
    try {
      return await handleJumpServerConnection(connectionInfo, event)
    } catch (error: unknown) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })

  // 处理 JumpServer shell
  ipcMain.handle('jumpserver:shell', async (_event, { id }) => {
    const stream = jumpserverShellStreams.get(id)
    if (!stream) {
      return { status: 'error', message: '未找到 JumpServer 连接' }
    }

    // 直接返回成功，因为 shell 已经在连接时建立
    return { status: 'success', message: 'JumpServer Shell 已就绪' }
  })

  // 处理 shell 写入
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

  // 处理命令执行
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
      conn.exec(cmd, (err, stream) => {
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

  // 处理窗口大小调整
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
