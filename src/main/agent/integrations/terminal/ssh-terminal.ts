import { Client, Shell } from 'ssh2'
import { BaseTerminal, IConnectionInfo } from './terminal-base'

export class SshTerminal extends BaseTerminal {
  private conn: Client | null = null
  private stream: Shell | null = null

  async connect(connectionInfo: IConnectionInfo): Promise<void> {
    this.log('Connecting via SSH...')
    return new Promise((resolve, reject) => {
      this.conn = new Client()

      this.conn
        .on('ready', () => {
          this.log('SSH connection ready.')
          this.conn?.shell({ term: 'xterm-256color' }, (err, stream) => {
            if (err) {
              this.onError(err)
              return reject(err)
            }
            this.stream = stream
            this.stream
              .on('data', (data: Buffer) => this.onData(data))
              .on('close', () => this.onExit(0))
              .stderr.on('data', (data: Buffer) => this.onData(data)) // redirect stderr to stdout

            this.log('SSH shell started.')
            resolve()
          })
        })
        .on('error', (err) => {
          this.onError(err)
          reject(err)
        })
        .on('close', () => {
            this.onExit(0)
        })

      const connectConfig: any = {
        host: connectionInfo.host,
        port: connectionInfo.port || 22,
        username: connectionInfo.username,
        keepaliveInterval: 10000
      }

      if (connectionInfo.privateKey) {
        connectConfig.privateKey = connectionInfo.privateKey
        if (connectionInfo.passphrase) {
          connectConfig.passphrase = connectionInfo.passphrase
        }
      } else if (connectionInfo.password) {
        connectConfig.password = connectionInfo.password
      } else {
        const err = new Error('SSH connection failed: No password or private key provided.')
        this.onError(err)
        return reject(err)
      }

      this.conn.connect(connectConfig)
    })
  }

  write(data: string): void {
    if (this.stream) {
      this.stream.write(data)
    } else {
      this.onError(new Error('Cannot write to terminal: stream is not available.'))
    }
  }

  resize(cols: number, rows: number): void {
    if (this.stream) {
      this.stream.setWindow(rows, cols, rows, cols)
    }
  }

  dispose(): void {
    this.log('Disposing SSH terminal.')
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
    if (this.conn) {
      this.conn.end()
      this.conn = null
    }
  }
} 