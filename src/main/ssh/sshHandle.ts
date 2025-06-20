import { ipcMain } from 'electron'
import { Client } from 'ssh2'

// 存储 SSH 连接
export const sshConnections = new Map()
export const sftpConnections = new Map()

// 执行命令结果
export interface ExecResult {
  stdout: string
  stderr: string
  exitCode?: number
  exitSignal?: string
}

// 存储 shell 会话流
const shellStreams = new Map()
const markedCommands = new Map()

const KeyboardInteractiveAttempts = new Map()
const connectionStatus = new Map()

// 设置KeyboardInteractive验证超时时间（毫秒）
const KeyboardInteractiveTimeout = 300000 // 5分钟超时
const MaxKeyboardInteractiveAttempts = 5 // 最大KeyboardInteractive尝试次数

// eslint-disable-next-line @typescript-eslint/no-var-requires
const EventEmitter = require('events')
const connectionEvents = new EventEmitter()
const handleRequestKeyboardInteractive = (event, id, prompts, finish) => {
  return new Promise((_resolve, reject) => {
    const RequestKeyboardInteractive = () => {
      event.sender.send('ssh:keyboard-interactive-request', {
        id,
        prompts: prompts.map((p) => p.prompt)
      })
      KeyboardInteractiveAttempts.set(id, 0)
      const timeoutId = setTimeout(() => {
        // 移除监听器
        ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${id}`)
        ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${id}`)

        // 取消验证
        finish([])

        event.sender.send('ssh:keyboard-interactive-timeout', { id })
        reject(new Error('验证超时，请重试连接'))
      }, KeyboardInteractiveTimeout)
      ipcMain.once(`ssh:keyboard-interactive-response:${id}`, (_evt, responses) => {
        clearTimeout(timeoutId) // 清除超时定时器
        finish(responses)

        const attemptCount = KeyboardInteractiveAttempts.get(id)
        let isVerified = null

        const statusHandler = (status) => {
          isVerified = status.isVerified

          if (!isVerified) {
            // 尝试次数加1
            const newAttemptCount = attemptCount + 1
            KeyboardInteractiveAttempts.set(id, newAttemptCount)

            event.sender.send('ssh:keyboard-interactive-result', {
              id,
              attempts: newAttemptCount,
              status: 'failed'
            })
            // 如果尝试次数小于最大尝试次数，重新请求
            if (newAttemptCount < MaxKeyboardInteractiveAttempts) {
              RequestKeyboardInteractive()
            } else {
              KeyboardInteractiveAttempts.set(id, 0)
              // finish([])
            }
          } else {
            KeyboardInteractiveAttempts.delete(id)
            console.log('发送成功事件:', { id })
            event.sender.send('ssh:keyboard-interactive-result', { id, status: 'success' })
            // finish(responses)
          }
          connectionEvents.removeListener(`connection-status-changed:${id}`, statusHandler)
        }

        connectionEvents.once(`connection-status-changed:${id}`, statusHandler)
      })
      ipcMain.once(`ssh:keyboard-interactive-cancel:${id}`, () => {
        KeyboardInteractiveAttempts.delete(id)
        clearTimeout(timeoutId)
        finish([])
        reject(new Error('验证已取消'))
      })
    }
    RequestKeyboardInteractive()
  })
}

const handleAttemptConnection = (event, connectionInfo, resolve, reject, retryCount) => {
  const { id, host, port, username, password, privateKey, passphrase } = connectionInfo
  retryCount++

  connectionStatus.set(id, { isVerified: false }) // 更新连接状态

  const conn = new Client()

  conn.on('ready', () => {
    sshConnections.set(id, conn) // 保存连接对象
    connectionStatus.set(id, { isVerified: true })
    // 建立保存sftp
    conn.sftp((err, sftp) => {
      if (err || !sftp) {
        connectionStatus.set(id, {
          isVerified: true,
          sftpAvailable: false,
          sftpError: err?.message || 'SFTP对象为空'
        })
        return
      }
      // 测试sftp连接是否真正可用
      sftp.readdir('.', (testErr) => {
        if (testErr) {
          console.error(`SFTPCheckFilaed [${id}]:`, testErr.message)
          connectionStatus.set(id, {
            sftpAvailable: false,
            sftpError: testErr.message
          })
          sftp.end()
        } else {
          sftpConnections.set(id, sftp)
          connectionStatus.set(id, {
            sftpAvailable: true
          })
          console.log(`SFTPCheckSuccess [${id}]`)
        }
      })
    })
    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: true })
    // 检查是否有 sudo 权限
    conn.exec('sudo -n true 2>/dev/null && echo true || echo  false', (err, stream) => {
      if (err) {
        event.sender.send(`ssh:connect:data:${id}`, { hasSudo: false })
      }
      stream
        .on('close', () => {
          event.sender.send(`ssh:connect:data:${id}`, { hasSudo: false })
        })
        .on('data', (data) => {
          event.sender.send(`ssh:connect:data:${id}`, {
            hasSudo: data.toString().trim() === 'true'
          })
        })
        .stderr.on('data', () => {
          event.sender.send(`ssh:connect:data:${id}`, { hasSudo: false })
        })
    })

    resolve({ status: 'connected', message: '连接成功' })
  })

  conn.on('error', (err) => {
    connectionStatus.set(id, { isVerified: false })
    console.log('err set ')

    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: false })
    if (err.level === 'client-authentication' && KeyboardInteractiveAttempts.has(id)) {
      console.log('Authentication failed. Retrying...')

      if (retryCount < MaxKeyboardInteractiveAttempts) {
        handleAttemptConnection(event, connectionInfo, resolve, reject, retryCount)
      } else {
        reject(new Error('最大重试次数已达到，认证失败'))
      }
    } else {
      reject(new Error(err.message))
    }
  })

  // 配置连接设置
  const connectConfig: any = {
    host,
    port: port || 22,
    username,
    keepaliveInterval: 10000, // 保持连接活跃
    tryKeyboard: true, // 启用键盘交互认证方式
    readyTimeout: KeyboardInteractiveTimeout // 连接超时时间，30秒
  }

  conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
    try {
      // 等待用户响应
      await handleRequestKeyboardInteractive(event, id, prompts, finish)
    } catch (err) {
      conn.end() // 关闭连接
      reject(err)
    }
  })

  try {
    if (privateKey) {
      // 使用私钥认证
      connectConfig.privateKey = privateKey
      if (passphrase) {
        connectConfig.passphrase = passphrase
      }
    } else if (password) {
      // 使用密码认证
      connectConfig.password = password
    } else {
      reject(new Error('没有提供有效的认证方式'))
      return
    }
    conn.connect(connectConfig) // 尝试连接
  } catch (err) {
    console.error('Connection configuration error:', err)
    reject(new Error(`连接配置错误: ${err}`))
  }
}

export const registerSSHHandlers = () => {
  // 处理连接
  ipcMain.handle('ssh:connect', async (_event, connectionInfo) => {
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

  ipcMain.handle('ssh:sftp:conn:list', async () => {
    return [...sftpConnections.keys()]
  })

  ipcMain.handle('ssh:shell', async (_event, { id }) => {
    const conn = sshConnections.get(id)
    if (!conn) {
      return { status: 'error', message: '未连接到服务器' }
    }
    return new Promise((resolve, reject) => {
      conn.shell((err, stream) => {
        if (err) {
          reject(new Error(err.message))
          return
        }

        shellStreams.set(id, stream)
        stream.on('data', (data) => {
          const markedCmd = markedCommands.get(id)
          if (markedCmd !== undefined) {
            markedCmd.output += data.toString()
            markedCmd.lastActivity = Date.now()
            if (markedCmd.idleTimer) {
              clearTimeout(markedCmd.idleTimer)
            }
            markedCmd.idleTimer = setTimeout(() => {
              if (markedCmd && !markedCmd.completed) {
                markedCmd.completed = true
                _event.sender.send(`ssh:shell:data:${id}`, {
                  data: markedCmd.output,
                  marker: markedCmd.marker
                })
                markedCommands.delete(id)
              }
            }, 100)
          } else {
            _event.sender.send(`ssh:shell:data:${id}`, {
              data: data.toString(),
              marker: ''
            })
          }
        })

        stream.stderr.on('data', (data) => {
          _event.sender.send(`ssh:shell:stderr:${id}`, data.toString())
        })

        stream.on('close', () => {
          _event.sender.send(`ssh:shell:close:${id}`)
          shellStreams.delete(id)
        })

        resolve({ status: 'success', message: 'Shell已启动' })
      })
    })
  })

  // resize处理
  ipcMain.handle('ssh:shell:resize', async (_event, { id, cols, rows }) => {
    const stream = shellStreams.get(id)
    if (!stream) {
      return { status: 'error', message: 'Shell未找到' }
    }

    try {
      // 设置SSH shell窗口大小
      stream.setWindow(rows, cols, 0, 0)
      return { status: 'success', message: `窗口大小已设置为 ${cols}x${rows}` }
    } catch (error) {
      return { status: 'error', message: error }
    }
  })

  ipcMain.on('ssh:shell:write', (_event, { id, data, marker }) => {
    const stream = shellStreams.get(id)
    if (stream) {
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
      stream.write(data)
    } else {
      console.warn('尝试写入不存在的stream:', id)
    }
  })

  ipcMain.handle('ssh:conn:exec', async (_event, { id, cmd }) => {
    const conn = sshConnections.get(id)
    if (!conn) {
      throw new Error(`No SSH connection for id=${id}`)
    }

    return new Promise<ExecResult>((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err)

        let stdout = ''
        let stderr = ''
        let exitCode: number | undefined
        let exitSignal: string | undefined

        stream.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })
        stream.stderr.on('data', (chunk: Buffer) => {
          // 收集输出
          stderr += chunk.toString()
        })

        stream.on('exit', (code, signal) => {
          exitCode = code ?? undefined
          exitSignal = signal ?? undefined
        })

        stream.on('close', (code, signal) => {
          const finalCode = exitCode !== undefined ? exitCode : code
          const finalSignal = exitSignal !== undefined ? exitSignal : signal

          // 无论成功还是失败都返回结果
          resolve({
            stdout,
            stderr,
            exitCode: finalCode ?? undefined,
            exitSignal: finalSignal ?? undefined
          })
        })
      })
    })
  })
  ipcMain.handle('ssh:sftp:list', async (_e, { path, id }) => {
    if (!sftpConnections.has(id)) {
      return Promise.reject(new Error(`no sftp conn for ${id}`))
    }
    const sftp = sftpConnections.get(id)
    return new Promise<any[]>((resolve) => {
      sftp!.readdir(path, (err, list) => {
        if (err) {
          const errorCode = (err as any).code
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
              // 未知错误码
              const message = err.message || `Unknown error (code: ${errorCode})`
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
    const stream = shellStreams.get(id)
    if (stream) {
      stream.end()
      shellStreams.delete(id)
    }
    const conn = sshConnections.get(id)
    if (conn) {
      conn.end()
      sshConnections.delete(id)
      sftpConnections.delete(id)
      return { status: 'success', message: '已断开连接' }
    }
    return { status: 'warning', message: '没有活动的连接' }
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

    // 记录命令
    const connection = sshConnections.get(id)
    if (connection) {
      if (!connection.commandHistory) {
        connection.commandHistory = []
      }
      connection.commandHistory.push({ command, timestamp })
    }
    return { success: true }
  })
}
