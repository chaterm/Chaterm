import type { Terminal } from 'xterm'

export interface JumpServerStatusData {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp?: string
}

export class JumpServerStatusHandler {
  private removeStatusListener: (() => void) | null = null
  private terminal: Terminal | null = null
  private connectionId: string = ''

  constructor(terminal: Terminal, connectionId: string) {
    this.terminal = terminal
    this.connectionId = connectionId
  }

  /**
   * Format status message
   */
  private formatStatusMessage(message: string, type: string = 'info'): string {
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    let colorCode = '36' // Default cyan
    let prefix = '●'

    switch (type) {
      case 'success':
        colorCode = '32' // Green
        prefix = '✓'
        break
      case 'warning':
        colorCode = '33' // Yellow
        prefix = '⚠'
        break
      case 'error':
        colorCode = '31' // Red
        prefix = '✗'
        break
      case 'info':
      default:
        colorCode = '36' // Cyan
        prefix = '●'
        break
    }

    return `\x1b[90m[${timestamp}]\x1b[0m \x1b[${colorCode}m${prefix}\x1b[0m ${message}`
  }

  /**
   * Setup status listener
   */
  setupStatusListener(api: any): void {
    this.removeStatusListener = api.onJumpServerStatusUpdate((data: JumpServerStatusData) => {
      if (data.id === this.connectionId && this.terminal) {
        const formattedMessage = this.formatStatusMessage(data.message, data.type)
        this.terminal.writeln(formattedMessage)
      }
    })
  }

  /**
   * Cleanup listener
   */
  cleanup(): void {
    if (this.removeStatusListener) {
      this.removeStatusListener()
      this.removeStatusListener = null
    }
  }

  /**
   * Show connection error message
   */
  showConnectionError(error: Error | string): void {
    if (this.terminal) {
      const errorMessage = error instanceof Error ? error.message : error
      const formattedError = this.formatStatusMessage(`Connection error: ${errorMessage}`, 'error')
      this.terminal.writeln(formattedError)
    }
  }

  /**
   * Show connection failure message
   */
  showConnectionFailure(message: string): void {
    if (this.terminal) {
      const formattedMessage = this.formatStatusMessage(`Connection failed: ${message}`, 'error')
      this.terminal.writeln(formattedMessage)
    }
  }
}

/**
 * Factory function to create JumpServer status handler
 */
export function createJumpServerStatusHandler(terminal: Terminal, connectionId: string): JumpServerStatusHandler {
  return new JumpServerStatusHandler(terminal, connectionId)
}

/**
 * Generic status message formatting function (for non-JumpServer connections)
 */
export function formatStatusMessage(message: string, type: string = 'info'): string {
  const timestamp = new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  let colorCode = '36' // Default cyan
  let prefix = '●'

  switch (type) {
    case 'success':
      colorCode = '32' // Green
      prefix = '✓'
      break
    case 'warning':
      colorCode = '33' // Yellow
      prefix = '⚠'
      break
    case 'error':
      colorCode = '31' // Red
      prefix = '✗'
      break
    case 'info':
    default:
      colorCode = '36' // Cyan
      prefix = '●'
      break
  }

  return `\x1b[90m[${timestamp}]\x1b[0m \x1b[${colorCode}m${prefix}\x1b[0m ${message}`
}
