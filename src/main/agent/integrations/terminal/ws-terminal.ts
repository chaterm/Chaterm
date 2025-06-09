import WebSocket from 'ws'
import { BaseTerminal, IConnectionInfo } from './terminal-base'
import { encrypt } from './utils/util'

export class WsTerminal extends BaseTerminal {
  private ws: WebSocket | null = null
  private pingInterval: NodeJS.Timeout | null = null
  private terminalId: string = ''

  async connect(connectionInfo: IConnectionInfo): Promise<void> {
    this.log('Connecting via WebSocket...')
    this.terminalId = connectionInfo.terminalId!

    const authData = {
      email: connectionInfo.email,
      ip: connectionInfo.host,
      uid: connectionInfo.uid,
      organizationId: connectionInfo.organizationId,
      terminalId: connectionInfo.terminalId
    }
    const auth = encrypt(authData)
    const wsUrl = `${connectionInfo.wsUrl}?&uuid=${auth}`

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.log('WebSocket connection opened.')
        let welcome =
          '\x1b[38;2;22;119;255m' + connectionInfo.name + ', 欢迎您使用智能堡垒机Chaterm \x1b[m\r\n'
        // Assuming a default language or getting it from somewhere
        // if (configStore.getUserConfig.language == 'en-US') {
        //   welcome =
        //     '\x1b[38;2;22;119;255m' + connectionInfo.email.split('@')[0] + ', Welcome to use Chaterm \x1b[m\r\n'
        // }
        this.onData(welcome)

        this.pingInterval = setInterval(() => {
          this.send('PING', '')
        }, 5000)
        resolve()
      })

      this.ws.on('message', (data) => {
        // The original implementation has complex logic for message handling
        // We will simplify here and just forward the data.
        // The original code checks if data is object or not
        if (typeof data !== 'object') {
          try {
            const o = JSON.parse(data.toString())
            // The original code has a 'dispatch' function with a switch case
            // for CONNECT, CLOSE, PING, TERMINAL_ACTION_VIM etc.
            // This logic should probably live here in the WsTerminal
            if (o.msgType === 'TERMINAL_AUTO_COMPLEMENT') {
              // This should be handled properly, maybe by sending a specific IPC message
            } else {
               // Assuming other messages are displayable data
               this.onData(data.toString())
            }
          } catch(e) {
            // not a json, probably raw data
            this.onData(data.toString())
          }
        } else {
          this.onData(data as Buffer)
        }
      })

      this.ws.on('error', (err) => {
        this.onError(err)
        reject(err)
      })

      this.ws.on('close', () => {
        this.onExit(0)
      })
    })
  }

  private send(msgType: string, data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ terminalId: this.terminalId, msgType, data }))
    }
  }

  write(data: string): void {
    // The original onData has logic for tab, ctrl+k etc.
    // This logic should be moved from the renderer to here.
    // For now, we just send it as TERMINAL_DATA
    this.send('TERMINAL_DATA', data)
  }

  resize(cols: number, rows: number): void {
    // The original implementation sends resize info.
    this.send('TERMINAL_RESIZE', JSON.stringify({ cols, rows }))
  }

  dispose(): void {
    this.log('Disposing WebSocket terminal.')
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
} 