import { BrowserWindow, dialog, ipcMain } from 'electron'
import { Client } from 'ssh2'
import type { SFTPWrapper } from 'ssh2'

import {
  jumpserverConnections,
  handleJumpServerConnection,
  jumpserverShellStreams,
  jumpserverMarkedCommands,
  jumpserverConnectionStatus,
  jumpserverLastCommand
} from './jumpserverHandle'
import path from 'path'
import fs from 'fs'
import { SSHAgentManager } from './ssh-agent/ChatermSSHAgent'

// Store SSH connections
export const sshConnections = new Map()
export const sftpConnections = new Map()

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
const connectionStatus = new Map()

// Set KeyboardInteractive authentication timeout (milliseconds)
const KeyboardInteractiveTimeout = 300000 // 5 minutes timeout
const MaxKeyboardInteractiveAttempts = 5 // Max KeyboardInteractive attempts

// eslint-disable-next-line @typescript-eslint/no-var-requires
const EventEmitter = require('events')
const connectionEvents = new EventEmitter()
export const handleRequestKeyboardInteractive = (event, id, prompts, finish) => {
  return new Promise((_resolve, reject) => {
    const RequestKeyboardInteractive = () => {
      event.sender.send('ssh:keyboard-interactive-request', {
        id,
        prompts: prompts.map((p) => p.prompt)
      })
      KeyboardInteractiveAttempts.set(id, 0)
      const timeoutId = setTimeout(() => {
        // Remove listener
        ipcMain.removeAllListeners(`ssh:keyboard-interactive-response:${id}`)
        ipcMain.removeAllListeners(`ssh:keyboard-interactive-cancel:${id}`)

        // Cancel authentication
        finish([])

        event.sender.send('ssh:keyboard-interactive-timeout', { id })
        reject(new Error('Authentication timed out, please try connecting again'))
      }, KeyboardInteractiveTimeout)
      ipcMain.once(`ssh:keyboard-interactive-response:${id}`, (_evt, responses) => {
        clearTimeout(timeoutId) // Clear timeout timer
        finish(responses)

        const attemptCount = KeyboardInteractiveAttempts.get(id)
        let isVerified = null

        const statusHandler = (status) => {
          isVerified = status.isVerified

          if (!isVerified) {
            // Increment attempt count
            const newAttemptCount = attemptCount + 1
            KeyboardInteractiveAttempts.set(id, newAttemptCount)

            event.sender.send('ssh:keyboard-interactive-result', {
              id,
              attempts: newAttemptCount,
              status: 'failed'
            })
            // If attempts are less than max attempts, re-request
            if (newAttemptCount < MaxKeyboardInteractiveAttempts) {
              RequestKeyboardInteractive()
            } else {
              KeyboardInteractiveAttempts.set(id, 0)
              // finish([])
            }
          } else {
            KeyboardInteractiveAttempts.delete(id)
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
        reject(new Error('Authentication cancelled'))
      })
    }
    RequestKeyboardInteractive()
  })
}

export const attemptSecondaryConnection = (event, connectionInfo) => {
  const { id, host, port, username, password, privateKey, passphrase } = connectionInfo
  const conn = new Client()
  const connectConfig: any = {
    host,
    port: port || 22,
    username,
    keepaliveInterval: 10000,
    readyTimeout: KeyboardInteractiveTimeout
  }

  if (privateKey) {
    connectConfig.privateKey = privateKey
    if (passphrase) connectConfig.passphrase = passphrase
  } else if (password) {
    connectConfig.password = password
  }

  // Send initialization command result
  const readyResult: {
    hasSudo?: boolean
    commandList?: string[]
  } = {}

  let execCount = 0
  const totalCounts = 2

  const sendReadyData = (stopCount) => {
    execCount++
    if (execCount === totalCounts || stopCount) {
      event.sender.send(`ssh:connect:data:${id}`, readyResult)
    }
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
              sftpConnections.set(id, sftp)
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
        conn.exec('ls /usr/bin/ /usr/local/bin/ /usr/sbin/ /usr/local/sbin/ /bin/ | sort | uniq', (err, stream) => {
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
        })
      } catch (e) {
        readyResult.commandList = []
        sendReadyData(false)
      }
    })
    .on('error', (err) => {
      readyResult.hasSudo = false
      readyResult.commandList = []
      sendReadyData(true)
      connectionStatus.set(id, {
        sftpAvailable: false,
        sftpError: err.message
      })
    })

  conn.connect(connectConfig)
}

const handleAttemptConnection = (event, connectionInfo, resolve, reject, retryCount) => {
  const { id, host, port, username, password, privateKey, passphrase, agentForward } = connectionInfo
  retryCount++

  connectionStatus.set(id, { isVerified: false }) // Update connection status

  const conn = new Client()

  conn.on('ready', () => {
    sshConnections.set(id, conn) // Save connection object
    connectionStatus.set(id, { isVerified: true })
    connectionEvents.emit(`connection-status-changed:${id}`, { isVerified: true })
    attemptSecondaryConnection(event, connectionInfo)
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
    readyTimeout: KeyboardInteractiveTimeout // Connection timeout, 30 seconds
  }

  if (agentForward) {
    const manager = SSHAgentManager.getInstance()
    // 如果使用 Agent 认证
    connectConfig.agent = manager.getAgent()
    connectConfig.agentForward = true
  }

  conn.on('keyboard-interactive', async (_name, _instructions, _instructionsLang, prompts, finish) => {
    try {
      // Wait for user response
      await handleRequestKeyboardInteractive(event, id, prompts, finish)
    } catch (err) {
      conn.end() // Close connection
      reject(err)
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

// Upload file
const handleUploadFile = (_event, id, remotePath, localPath, resolve, reject) => {
  const sftp = sftpConnections.get(id)
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
  const sftp = sftpConnections.get(id)
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
  const sftp = sftpConnections.get(id)
  if (!sftp) {
    return reject('Sftp Not connected')
  }

  // 使用链式 Promise 替代 async/await
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
  const sftp = sftpConnections.get(id)
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
      // 路由到 JumpServer 连接
      try {
        const result = await handleJumpServerConnection(connectionInfo, _event)

        // 连接成功后，发送初始化数据（模拟 attemptSecondaryConnection 的行为）
        if (result.status === 'connected') {
          const readyResult = {
            hasSudo: false,
            commandList: []
          }

          // 发送连接数据事件
          _event.sender.send(`ssh:connect:data:${connectionInfo.id}`, readyResult)
        }

        return result
      } catch (error: unknown) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    } else {
      // 默认走 SSH 连接
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
    return [...sftpConnections.keys()]
  })

  ipcMain.handle('ssh:shell', async (_event, { id, terminalType }) => {
    // 检查是否为 JumpServer 连接
    if (jumpserverConnections.has(id)) {
      // 使用 JumpServer 的 shell 处理
      const stream = jumpserverShellStreams.get(id)
      if (!stream) {
        return { status: 'error', message: '未找到 JumpServer 连接' }
      }

      // 设置 shell 数据流监听器
      stream.removeAllListeners('data')
      stream.on('data', (data) => {
        const dataStr = data.toString()
        // 添加 JumpServer 退出检测逻辑
        const lastCommand = jumpserverLastCommand.get(id)
        const exitCommands = ['exit', 'logout', '\x04']

        // 检测 JumpServer 菜单返回并自动退出
        if (dataStr.includes('[Host]>') && lastCommand && exitCommands.includes(lastCommand)) {
          jumpserverLastCommand.delete(id) // 使用后清除命令
          // 发送 'q' 命令退出 JumpServer 会话
          stream.write('q\r', (err) => {
            if (err) {
              console.error(`[JumpServer ${id}] 发送 "q" 命令失败:`, err)
            } else {
              console.log(`[JumpServer ${id}] 已发送 "q" 命令以终止会话。`)
            }
            // 结束流和连接
            stream.end()
            const conn = jumpserverConnections.get(id)
            if (conn) {
              conn.end()
            }
          })
          return // 不再继续处理数据
        }

        const markedCmd = jumpserverMarkedCommands.get(id)
        if (markedCmd !== undefined) {
          markedCmd.output += dataStr
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
              jumpserverMarkedCommands.delete(id)
            }
          }, 200)
        } else {
          _event.sender.send(`ssh:shell:data:${id}`, {
            data: dataStr,
            marker: ''
          })
        }
      })

      stream.stderr.on('data', (data) => {
        _event.sender.send(`ssh:shell:stderr:${id}`, data.toString())
      })

      stream.on('close', () => {
        console.log(`JumpServer shell stream closed for id=${id}`)
        _event.sender.send(`ssh:shell:close:${id}`)
        jumpserverShellStreams.delete(id)
      })

      return { status: 'success', message: 'JumpServer Shell 已就绪' }
    }

    // 默认 SSH shell 处理
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
          }, 200)
        } else {
          _event.sender.send(`ssh:shell:data:${id}`, {
            data: data.toString(),
            marker: ''
          })
        }
      })

      stream.stderr?.on('data', (data) => {
        _event.sender.send(`ssh:shell:stderr:${id}`, data.toString())
      })

      stream.on('close', () => {
        console.log(`Shell stream closed for id=${id} (${method})`)
        _event.sender.send(`ssh:shell:close:${id}`)
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
      if (!isConnected()) {
        return reject(new Error('Connection disconnected, unable to start terminal'))
      }

      setTimeout(() => {
        if (!isConnected()) {
          return reject(new Error('The connection has been disconnected after a delay'))
        }

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
    // 检查是否为 JumpServer 连接
    if (jumpserverConnections.has(id)) {
      const stream = jumpserverShellStreams.get(id)
      if (!stream) {
        return { status: 'error', message: 'JumpServer Shell未找到' }
      }

      try {
        stream.setWindow(rows, cols, 0, 0)
        return { status: 'success', message: `JumpServer窗口大小已设置为 ${cols}x${rows}` }
      } catch (error: unknown) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    }

    // 默认 SSH 处理
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

  ipcMain.on('ssh:shell:write', (_event, { id, data, marker, lineCommand }) => {
    // 检查是否为 JumpServer 连接
    if (jumpserverConnections.has(id)) {
      const stream = jumpserverShellStreams.get(id)
      if (stream) {
        // 使用 lineCommand 进行命令检测，如果没有则回退到 data.trim()
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
        stream.write(data)
      } else {
        console.warn('尝试写入不存在的JumpServer stream:', id)
      }
      return
    }

    // 默认 SSH 处理
    const stream = shellStreams.get(id)
    if (stream) {
      console.log(`ssh:shell:write (default) raw data: "${data}"`)
      // 对于默认SSH连接，不做退出命令检测，让终端自然处理退出
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
      console.warn('Attempting to write to non-existent stream:', id)
    }
  })

  ipcMain.handle('ssh:conn:exec', async (_event, { id, cmd }) => {
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
          // 优化：错误时也使用相同的拼接方式
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
    if (!sftpConnections.has(id)) {
      return Promise.reject(new Error(`no sftp conn for ${id}`))
    }
    const sftp = sftpConnections.get(id)
    return new Promise<unknown[]>((resolve) => {
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
    // 检查是否为 JumpServer 连接
    if (jumpserverConnections.has(id)) {
      const stream = jumpserverShellStreams.get(id)
      if (stream) {
        stream.end()
        jumpserverShellStreams.delete(id)
      }

      const conn = jumpserverConnections.get(id)
      if (conn) {
        conn.end()
        jumpserverConnections.delete(id)
        jumpserverConnectionStatus.delete(id)
        return { status: 'success', message: 'JumpServer 连接已断开' }
      }

      return { status: 'warning', message: '没有活动的 JumpServer 连接' }
    }

    // 默认 SSH 处理
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
    const sftp = sftpConnections.get(id)
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
    const sftp = sftpConnections.get(id)
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
  const conn = sshConnections.get(id) || jumpserverConnections.get(id)
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
