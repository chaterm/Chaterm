import { BrowserWindow } from 'electron'

export interface IConnectionInfo {
  type: 'ssh' | 'websocket'
  id?: string
  host?: string
  port?: number
  username?: string
  password?: string
  privateKey?: string
  passphrase?: string
  // for websocket
  wsUrl?: string
  token?: string
  email?: string
  uid?: string
  organizationId?: string
  terminalId?: string // This seems to be generated on the frontend
  name?: string
}

export abstract class BaseTerminal {
  constructor(
    protected id: string,
    protected window: BrowserWindow
  ) {}

  abstract connect(connectionInfo: IConnectionInfo): Promise<void>
  abstract write(data: string): void
  abstract resize(cols: number, rows: number): void
  abstract dispose(): void

  protected onData(data: string | Buffer) {
    this.window.webContents.send(`terminal:data:${this.id}`, data.toString())
  }
  protected onExit(code: number) {
    this.window.webContents.send(`terminal:exit:${this.id}`, code)
    this.dispose()
  }
  protected onError(error: Error) {
    console.error(`Terminal [${this.id}] error:`, error)
    this.window.webContents.send(`terminal:error:${this.id}`, error.message)
  }

  protected log(message: string) {
    console.log(`Terminal [${this.id}]: ${message}`)
  }
} 