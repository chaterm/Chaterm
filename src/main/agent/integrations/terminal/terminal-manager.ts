import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { BaseTerminal, IConnectionInfo } from './terminal-base'
import { SshTerminal } from './ssh-terminal'
import { WsTerminal } from './ws-terminal'

export class TerminalManager {
  private terminals = new Map<string, BaseTerminal>()

  create(window: BrowserWindow, connectionInfo: IConnectionInfo): string {
    const id = uuidv4()
    let terminal: BaseTerminal

    if (connectionInfo.type === 'ssh') {
      terminal = new SshTerminal(id, window)
    } else if (connectionInfo.type === 'websocket') {
      terminal = new WsTerminal(id, window)
    } else {
      // Maybe send an error back to the window
      throw new Error(`Unsupported terminal type: ${connectionInfo.type}`)
    }

    this.terminals.set(id, terminal)
    console.log(`Terminal created with id: ${id}, type: ${connectionInfo.type}`)

    terminal.connect(connectionInfo).catch((err) => {
      console.error(`Failed to connect terminal ${id}:`, err.message)
      window.webContents.send(`terminal:error:${id}`, `Connection failed: ${err.message}`)
      this.remove(id)
    })

    return id
  }

  write(id: string, data: string) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.write(data)
    } else {
      console.warn(`Attempted to write to non-existent terminal: ${id}`)
    }
  }

  resize(id: string, cols: number, rows: number) {
    this.terminals.get(id)?.resize(cols, rows)
  }

  remove(id: string) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.dispose()
      this.terminals.delete(id)
      console.log(`Terminal removed: ${id}`)
    }
  }

  disposeAll() {
    console.log('Disposing all terminals.')
    for (const id of this.terminals.keys()) {
      this.remove(id)
    }
  }
} 