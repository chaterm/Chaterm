import { ipcMain, dialog } from 'electron'
import { Client } from 'ssh2'

// 存储 SSH 连接
const sshConnections = new Map()
const sftpConnections = new Map()
// 存储 shell 会话流
const shellStreams = new Map()
const markedCommands = new Map()

export const registerSSHHandlers = () => {
  // 处理连接
  ipcMain.handle('ssh:connect', async (_event, connectionInfo) => {
    const { id, host, port, username, password, privateKey, passphrase } = connectionInfo
    return new Promise((resolve, reject) => {
      const conn = new Client()
      conn.on('ready', () => {
        sshConnections.set(id, conn)
        // 建立保存sftp
        conn!.sftp((_err, s) => {
          sftpConnections.set(id, s)
        })
        conn.exec('sudo -n true 2>/dev/null && echo true || echo  false', (err, stream) => {
          if (err) {
            _event.sender.send(`ssh:connect:data:${id}`, {
              hasSudo: false
            })
          }
          stream
            .on('close', () => {
              _event.sender.send(`ssh:connect:data:${id}`, {
                hasSudo: false
              })
            })
            .on('data', (data) => {
              _event.sender.send(`ssh:connect:data:${id}`, {
                hasSudo: data.toString().trim() === 'true'
              })
            })
            .stderr.on('data', () => {
              _event.sender.send(`ssh:connect:data:${id}`, {
                hasSudo: false
              })
            })
        })
        resolve({ status: 'connected', message: '连接成功' })
      })
      conn.on('error', (err) => {
        reject({ status: 'error', message: err.message })
      })
      const connectConfig: any = {
        host,
        port: port || 22,
        username,
        keepaliveInterval: 10000 // 保持连接活跃
      }
      try {
        if (privateKey) {
          // 读取私钥文件
          connectConfig.privateKey = privateKey
          if (passphrase) {
            connectConfig.passphrase = passphrase
          }
        } else if (password) {
          connectConfig.password = password
        } else {
          reject({ status: 'error', message: '私钥错误' })
          return
        }
        conn.connect(connectConfig)
      } catch (err) {
        reject({ status: 'error', message: `连接配置错误: ${err}` })
      }
    })
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
          reject({ status: 'error', message: err.message })
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
    return new Promise<string>((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err)

        let stdout = ''
        let stderr = ''
        let exitCode: number | undefined
        let exitSignal: string | undefined

        // 收集输出
        stream.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })
        stream.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })

        stream.on('exit', (code, signal) => {
          exitCode = code ?? undefined
          exitSignal = signal ?? undefined
        })

        stream.on('close', (code, signal) => {
          const finalCode = exitCode !== undefined ? exitCode : code
          const finalSignal = exitSignal !== undefined ? exitSignal : signal
          if (finalCode === 0) {
            resolve(stdout)
          } else {
            reject(
              new Error(
                `Command exited with code=${finalCode}, signal=${finalSignal}\n` +
                  `stderr: ${stderr}`
              )
            )
          }
        })
      })
    })
  })

  ipcMain.handle('ssh:sftp:list', async (_e, { path, id }) => {
    if (!sftpConnections.has(id)) {
      return Promise.reject(new Error(`no sftp conn for ${id}`))
    }
    const sftp = sftpConnections.get(id)
    return new Promise<any[]>((resolve, reject) => {
      sftp!.readdir(path, (err, list) => {
        if (err) {
          // 0x03 (3) 是 SSH_FX_PERMISSION_DENIED
          if ((err as any).code === 3) {
            return resolve([`cannot open directory '${path}'： Permission denied`])
          }
          return reject(err)
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

  ipcMain.handle('ssh:select-private-key', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Private Key Files', extensions: ['pem', 'key', 'ppk', ''] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: '选择SSH私钥文件'
    })

    if (result.canceled) {
      return { status: 'canceled' }
    }

    return {
      status: 'success',
      filePath: result.filePaths[0]
    }
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
