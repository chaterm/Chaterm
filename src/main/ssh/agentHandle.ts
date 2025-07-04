import { ipcMain } from 'electron'
import { Client, ConnectConfig } from 'ssh2'
import { ConnectionInfo } from '../agent/integrations/remote-terminal'

// 存储 SSH 连接
const remoteConnections = new Map<string, Client>()
// 存储 shell 会话流
const remoteShellStreams = new Map()

export async function remoteSshConnect(connectionInfo: ConnectionInfo): Promise<{ id?: string; error?: string }> {
  const { host, port, username, password, privateKey, passphrase } = connectionInfo
  const connectionId = `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`

  return new Promise((resolve) => {
    const conn = new Client()
    let secondAuthTriggered = false
    let resolved = false

    const safeResolve = (result: { id?: string; error?: string }) => {
      if (!resolved) {
        resolved = true
        resolve(result)
      }
    }

    conn.on('keyboard-interactive', () => {
      secondAuthTriggered = true
      conn.end()
      safeResolve({ error: '服务器要求二次认证（如OTP/2FA），无法连接。' })
    })

    conn.on('ready', () => {
      if (secondAuthTriggered) return
      remoteConnections.set(connectionId, conn)
      console.log(`SSH连接成功: ${connectionId}`)
      safeResolve({ id: connectionId })
    })

    conn.on('error', (err) => {
      if (secondAuthTriggered) return
      console.error('SSH连接错误:', err.message)
      conn.end()
      safeResolve({ error: err.message })
    })

    conn.on('close', () => {
      if (secondAuthTriggered) return
      // 如果连接在 'ready' 事件之前关闭，并且没有触发 'error' 事件，
      // 这通常意味着所有认证方法都失败了。
      safeResolve({ error: 'SSH 连接关闭，可能是认证失败。' })
    })

    const connectConfig: ConnectConfig = {
      host,
      port: port || 22,
      username,
      keepaliveInterval: 10000, // 保持连接活跃
      tryKeyboard: true // 禁用 keyboard-interactive
    }

    try {
      if (privateKey) {
        connectConfig.privateKey = privateKey
        if (passphrase) {
          connectConfig.passphrase = passphrase
        }
      } else if (password) {
        connectConfig.password = password
      } else {
        safeResolve({ error: '缺少密码或私钥' })
        return
      }
      conn.connect(connectConfig)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('SSH连接配置错误:', errorMessage)
      safeResolve({ error: `连接配置错误: ${errorMessage}` })
    }
  })
}

export async function remoteSshExec(
  sessionId: string,
  command: string,
  timeoutMs: number = 30 * 60 * 1000
): Promise<{ success?: boolean; output?: string; error?: string }> {
  const conn = remoteConnections.get(sessionId)
  if (!conn) {
    console.error(`SSH连接不存在: ${sessionId}`)
    return { success: false, error: '未连接到远程服务器' }
  }
  console.log(`开始执行SSH命令: ${command} (会话: ${sessionId})`)

  const base64Command = Buffer.from(command, 'utf-8').toString('base64')
  const shellCommand = `CHATERM_COMMAND_B64='${base64Command}' exec bash -l -c 'eval "$(echo $CHATERM_COMMAND_B64 | base64 -d)"'`

  return new Promise((resolve) => {
    let timeoutHandler: NodeJS.Timeout
    let finished = false

    function safeResolve(result: { success?: boolean; output?: string; error?: string }) {
      if (!finished) {
        finished = true
        clearTimeout(timeoutHandler)
        resolve(result)
      }
    }

    conn.exec(shellCommand, { pty: true }, (err, stream) => {
      if (err) {
        safeResolve({ success: false, error: err.message })
        return
      }

      let output = ''

      stream.on('data', (data: Buffer) => {
        output += data.toString()
      })

      stream.stderr.on('data', (data: Buffer) => {
        output += data.toString()
      })

      stream.on('close', (code: number | null) => {
        safeResolve({
          success: code === 0,
          output: output,
          error: code !== 0 ? `命令执行失败，退出码: ${code}` : undefined
        })
      })

      // 设置超时
      timeoutHandler = setTimeout(() => {
        // stream 终止
        try {
          stream.close()
        } catch {}
        safeResolve({
          success: false,
          output: output,
          error: `命令执行超时（${timeoutMs}ms）`
        })
      }, timeoutMs)
    })
  })
}

// 新增：支持实时流式输出的 SSH 命令执行方法
export async function remoteSshExecStream(
  sessionId: string,
  command: string,
  onData: (chunk: string) => void,
  timeoutMs: number = 30 * 60 * 1000
): Promise<{ success?: boolean; error?: string }> {
  const conn = remoteConnections.get(sessionId)
  if (!conn) {
    console.error(`SSH连接不存在: ${sessionId}`)
    return { success: false, error: '未连接到远程服务器' }
  }

  console.log(`开始执行SSH命令(流式): ${command} (会话: ${sessionId})`)

  const base64Command = Buffer.from(command, 'utf-8').toString('base64')
  const shellCommand = `CHATERM_COMMAND_B64='${base64Command}' exec bash -l -c 'eval "$(echo $CHATERM_COMMAND_B64 | base64 -d)"'`

  return new Promise((resolve) => {
    let timeoutHandler: NodeJS.Timeout
    let finished = false

    function safeResolve(result: { success?: boolean; error?: string }) {
      if (!finished) {
        finished = true
        clearTimeout(timeoutHandler)
        resolve(result)
      }
    }

    conn.exec(shellCommand, { pty: true }, (err, stream) => {
      if (err) {
        safeResolve({ success: false, error: err.message })
        return
      }

      stream.on('data', (data: Buffer) => {
        try {
          onData(data.toString())
        } catch (cbErr) {
          console.error('remoteSshExecStream onData 回调错误:', cbErr)
        }
      })

      stream.stderr.on('data', (data: Buffer) => {
        try {
          onData(data.toString())
        } catch (cbErr) {
          console.error('remoteSshExecStream stderr onData 回调错误:', cbErr)
        }
      })

      stream.on('close', (code: number | null) => {
        safeResolve({
          success: code === 0,
          error: code !== 0 ? `命令执行失败，退出码: ${code}` : undefined
        })
      })

      // 设置超时
      timeoutHandler = setTimeout(() => {
        try {
          stream.close()
        } catch {}
        safeResolve({
          success: false,
          error: `命令执行超时（${timeoutMs}ms）`
        })
      }, timeoutMs)
    })
  })
}

export async function remoteSshDisconnect(sessionId: string): Promise<{ success?: boolean; error?: string }> {
  const stream = remoteShellStreams.get(sessionId)
  if (stream) {
    stream.end()
    remoteShellStreams.delete(sessionId)
  }

  const conn = remoteConnections.get(sessionId)
  if (conn) {
    conn.end()
    remoteConnections.delete(sessionId)
    console.log(`SSH连接已断开: ${sessionId}`)
    return { success: true }
  }

  console.warn(`尝试断开不存在的SSH连接: ${sessionId}`)
  return { success: false, error: '没有活动的远程连接' }
}

export const registerRemoteTerminalHandlers = () => {
  ipcMain.handle('ssh:remote-connect', async (_event, connectionInfo) => {
    try {
      return await remoteSshConnect(connectionInfo)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ssh:remote-exec', async (_event, sessionId, command) => {
    try {
      return await remoteSshExec(sessionId, command)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 流式执行不通过 IPC 暴露，保持内部调用即可

  ipcMain.handle('ssh:remote-disconnect', async (_event, sessionId) => {
    try {
      return await remoteSshDisconnect(sessionId)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
