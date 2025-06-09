import WebSocket from 'ws'
import CryptoJS from 'crypto-js'


export interface RemoteWsConnectionInfo {
  id?: string
  wsUrl: string
  token?: string // 可选的鉴权token
  terminalId: string
}

// wsConnections: id -> { ws, buffer, terminalId }
const wsConnections: Map<
  string,
  { ws: WebSocket; buffer: string[]; terminalId: string; pingInterval: NodeJS.Timeout }
> = new Map()

export async function remoteWsConnect(connectionInfo: RemoteWsConnectionInfo): Promise<{ id: string } | { error: string }> {
  return new Promise((resolve) => {
    try {
      console.log('[ws.ts] 准备连接，URL:', connectionInfo.wsUrl) // 打印连接URL
      const ws = new WebSocket(connectionInfo.wsUrl, {
        headers: connectionInfo.token ? { Authorization: `Bearer ${connectionInfo.token}` } : undefined
      })
      ws.binaryType = 'arraybuffer' // 设置二进制类型以接收原始终端数据
      const buffer: string[] = []
      const { terminalId } = connectionInfo
      ws.on('open', () => {
        console.log(`[ws.ts] WebSocket 连接已打开 (ID: ${terminalId})`)
        const id = connectionInfo.id || Math.random().toString(36).slice(2)
        // 增加定时发送ping消息
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const pingMsg = JSON.stringify({
              terminalId,
              msgType: 'PING',
              data: ''
            })
            // console.log('[ws.ts] 发送 PING:', pingMsg) // 日志过于冗长，暂时注释
            ws.send(pingMsg)
          }
        }, 5000)
        wsConnections.set(id, { ws, buffer, terminalId, pingInterval })

        // 连接建立后，立即发送一个回车以激活终端并获取初始提示符
        const initialEnterMsg = JSON.stringify({
          terminalId,
          msgType: 'TERMINAL_DATA',
          data: '\r\n'
        })
        console.log('[ws.ts] 发送初始回车:', initialEnterMsg) // 打印初始回车
        ws.send(initialEnterMsg)

        const decoder = new TextDecoder('utf-8')
        // 连接后立即监听所有消息
        ws.on('message', (data: WebSocket.Data) => {
          // 确保收到的任何二进制数据都被正确解码为字符串
          const message = typeof data === 'string' ? data : decoder.decode(data as Buffer | ArrayBuffer)

          // 快速跳过 PING 消息，避免不必要的 JSON 解析
          if (message.includes('"msgType":"PING"')) {
            return
          }

          console.log('[ws.ts] 收到解码后消息:', message)

          try {
            const msg = JSON.parse(message)

            if (msg.msgType === 'CONNECT') {
              const initMsg = JSON.stringify({
                terminalId,
                msgType: 'TERMINAL_INIT',
                data: JSON.stringify({ cols: 80, rows: 24 })
              })
              ws.send(initMsg)
              return // 处理完毕，等待下一个消息
            }

            const output = msg.originData || msg.data
            if (typeof output === 'string' && output) {
              console.log(`[ws.ts] 从JSON消息中提取到数据:`, output)
              buffer.push(output)
            } else {
              console.log('[ws.ts] JSON消息不含终端数据，已忽略。')
            }
          } catch (e) {
            // Not a JSON message, assume it's raw terminal output.
            buffer.push(message)
          }
        })
        resolve({ id })
      })
      ws.on('error', (err) => {
        console.error('[ws.ts] WebSocket 错误:', err) // 打印错误
        resolve({ error: err.message })
      })
    } catch (e: any) {
      console.error('[ws.ts] 创建 WebSocket 连接时出错:', e) // 打印创建时的异常
      resolve({ error: e.message })
    }
  })
}

export async function remoteWsExec(
  id: string,
  command: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  const conn = wsConnections.get(id)
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'WebSocket未连接' }
  }
  const { ws, buffer, terminalId } = conn
  // 清空buffer，只收集本次命令的输出
  buffer.length = 0
  return new Promise((resolve) => {
    const commandMsg = JSON.stringify({
      terminalId,
      msgType: 'TERMINAL_DATA',
      data: command + '\r\n'
    })
    console.log(`[ws.ts] 准备执行命令 (ID: ${id}):`, commandMsg)
    ws.send(commandMsg)

    const startTime = Date.now()
    const interval = setInterval(() => {
      const rawOutput = buffer.join('')
      // 移除ANSI转义序列以进行干净的提示符检查
      // eslint-disable-next-line no-control-regex
      const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
      const cleanForCheck = rawOutput.replace(ansiRegex, '')
      console.log('[ws.ts] 检查中，清理后的输出:', cleanForCheck)

      // 检查是否出现提示符
      const promptAppeared = /([$#%>]\s*)[\r\n]*$/.test(cleanForCheck)

      if (promptAppeared || Date.now() - startTime > 5000) {
        clearInterval(interval)

        // 最终清理
        let cleanOutput = rawOutput.replace(ansiRegex, '')
        const lines = cleanOutput.split(/\r\n|\n/)

        // 移除命令回显
        const commandIndex = lines.findIndex((line) => line.includes(command))
        const contentLines = commandIndex !== -1 ? lines.slice(commandIndex + 1) : lines

        // 移除最后的提示符
        if (contentLines.length > 0) {
          const lastLine = contentLines[contentLines.length - 1]
          if (/([$#%>]\s*)$/.test(lastLine)) {
            contentLines.pop()
          }
        }

        resolve({ success: true, output: contentLines.join('\n').trim() })
      }
    }, 100) // 每100ms检查一次
  })
}

export async function remoteWsDisconnect(id: string): Promise<void> {
  const conn = wsConnections.get(id)
  if (conn) {
    clearInterval(conn.pingInterval) // 停止发送ping
    conn.ws.close()
    wsConnections.delete(id)
  }
}

export const __testExports = {
  wsConnections
}



export function encrypt(authData) {
  const keyStr = 'CtmKeyNY@D96^qza'
  const ivStr = keyStr
  const key = CryptoJS.enc.Utf8.parse(keyStr)
  const iv = CryptoJS.enc.Utf8.parse(ivStr)
  const srcs = CryptoJS.enc.Utf8.parse(JSON.stringify(authData))
  const encrypted = CryptoJS.AES.encrypt(srcs, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return encodeURIComponent(encrypted.toString())
}
