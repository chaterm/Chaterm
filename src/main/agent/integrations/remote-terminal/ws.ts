import WebSocket from 'ws'
import CryptoJS from 'crypto-js'

export interface RemoteWsConnectionInfo {
  id?: string
  wsUrl: string
  token?: string // Optional authentication token
  terminalId: string
}

// wsConnections: id -> { ws, buffer, terminalId }
const wsConnections: Map<string, { ws: WebSocket; buffer: string[]; terminalId: string; pingInterval: NodeJS.Timeout }> = new Map()

export async function remoteWsConnect(connectionInfo: RemoteWsConnectionInfo): Promise<{ id: string } | { error: string }> {
  return new Promise((resolve) => {
    try {
      console.log('[ws.ts] Preparing to connect, URL:', connectionInfo.wsUrl) // Print connection URL
      const ws = new WebSocket(connectionInfo.wsUrl, {
        headers: connectionInfo.token ? { Authorization: `Bearer ${connectionInfo.token}` } : undefined
      })
      ws.binaryType = 'arraybuffer' // Set binary type to receive raw terminal data
      const buffer: string[] = []
      const { terminalId } = connectionInfo
      ws.on('open', () => {
        console.log(`[ws.ts] WebSocket connection opened (ID: ${terminalId})`)
        const id = connectionInfo.id || Math.random().toString(36).slice(2)
        // Add timed ping messages
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const pingMsg = JSON.stringify({
              terminalId,
              msgType: 'PING',
              data: ''
            })
            // console.log('[ws.ts] Sending PING:', pingMsg) // Log is too verbose, temporarily commented out
            ws.send(pingMsg)
          }
        }, 5000)
        wsConnections.set(id, { ws, buffer, terminalId, pingInterval })

        // After connection is established, immediately send a carriage return to activate the terminal and get the initial prompt
        const initialEnterMsg = JSON.stringify({
          terminalId,
          msgType: 'TERMINAL_DATA',
          data: '\r\n'
        })
        console.log('[ws.ts] Sending initial carriage return:', initialEnterMsg) // Print initial carriage return
        ws.send(initialEnterMsg)

        const decoder = new TextDecoder('utf-8')
        // Listen for all messages immediately after connection
        ws.on('message', (data: WebSocket.Data) => {
          // Ensure any binary data received is correctly decoded to a string
          const message = typeof data === 'string' ? data : decoder.decode(data as Buffer | ArrayBuffer)

          // Quickly skip PING messages to avoid unnecessary JSON parsing
          if (message.includes('"msgType":"PING"')) {
            return
          }

          console.log('[ws.ts] Received decoded message:', message)

          try {
            const msg = JSON.parse(message)

            if (msg.msgType === 'CONNECT') {
              const initMsg = JSON.stringify({
                terminalId,
                msgType: 'TERMINAL_INIT',
                data: JSON.stringify({ cols: 80, rows: 24 })
              })
              ws.send(initMsg)
              return // Done processing, wait for next message
            }

            const output = msg.originData || msg.data
            if (typeof output === 'string' && output) {
              console.log(`[ws.ts] Data extracted from JSON message:`, output)
              buffer.push(output)
            } else {
              console.log('[ws.ts] JSON message contains no terminal data, ignored.')
            }
          } catch (e) {
            // Not a JSON message, assume it's raw terminal output.
            buffer.push(message)
          }
        })
        resolve({ id })
      })
      ws.on('error', (err) => {
        console.error('[ws.ts] WebSocket error:', err) // Print error
        resolve({ error: err.message })
      })
    } catch (e: any) {
      console.error('[ws.ts] Error creating WebSocket connection:', e) // Print exception during creation
      resolve({ error: e.message })
    }
  })
}

export async function remoteWsExec(id: string, command: string): Promise<{ success: boolean; output?: string; error?: string }> {
  const conn = wsConnections.get(id)
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'WebSocket未连接' }
  }
  const { ws, buffer, terminalId } = conn
  // Clear buffer, only collect output for this command
  buffer.length = 0
  return new Promise((resolve) => {
    const commandMsg = JSON.stringify({
      terminalId,
      msgType: 'TERMINAL_DATA',
      data: command + '\r\n'
    })
    console.log(`[ws.ts] Preparing to execute command (ID: ${id}):`, commandMsg)
    ws.send(commandMsg)

    const startTime = Date.now()
    const interval = setInterval(() => {
      const rawOutput = buffer.join('')
      // Remove ANSI escape sequences for clean prompt checking
      // eslint-disable-next-line no-control-regex
      const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
      const cleanForCheck = rawOutput.replace(ansiRegex, '')
      console.log('[ws.ts] Checking, cleaned output:', cleanForCheck)

      // Check if prompt appeared
      const promptAppeared = /([$#%>]\s*)[\r\n]*$/.test(cleanForCheck)

      if (promptAppeared || Date.now() - startTime > 5000) {
        clearInterval(interval)

        // Final cleanup
        let cleanOutput = rawOutput.replace(ansiRegex, '')
        const lines = cleanOutput.split(/\r\n|\n/)

        // Remove command echo
        const commandIndex = lines.findIndex((line) => line.includes(command))
        const contentLines = commandIndex !== -1 ? lines.slice(commandIndex + 1) : lines

        // Remove final prompt
        if (contentLines.length > 0) {
          const lastLine = contentLines[contentLines.length - 1]
          if (/([$#%>]\s*)$/.test(lastLine)) {
            contentLines.pop()
          }
        }

        resolve({ success: true, output: contentLines.join('\n').trim() })
      }
    }, 100) // Check every 100ms
  })
}

export async function remoteWsDisconnect(id: string): Promise<void> {
  const conn = wsConnections.get(id)
  if (conn) {
    clearInterval(conn.pingInterval) // Stop sending ping
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
