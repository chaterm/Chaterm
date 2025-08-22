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
   * 格式化状态消息
   */
  private formatStatusMessage(message: string, type: string = 'info'): string {
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    let colorCode = '36' // 默认青色
    let prefix = '●'

    switch (type) {
      case 'success':
        colorCode = '32' // 绿色
        prefix = '✓'
        break
      case 'warning':
        colorCode = '33' // 黄色
        prefix = '⚠'
        break
      case 'error':
        colorCode = '31' // 红色
        prefix = '✗'
        break
      case 'info':
      default:
        colorCode = '36' // 青色
        prefix = '●'
        break
    }

    return `\x1b[90m[${timestamp}]\x1b[0m \x1b[${colorCode}m${prefix}\x1b[0m ${message}`
  }

  /**
   * 设置状态监听器
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
   * 清理监听器
   */
  cleanup(): void {
    if (this.removeStatusListener) {
      this.removeStatusListener()
      this.removeStatusListener = null
    }
  }

  /**
   * 显示连接错误信息
   */
  showConnectionError(error: Error | string): void {
    if (this.terminal) {
      const errorMessage = error instanceof Error ? error.message : error
      const formattedError = this.formatStatusMessage(`连接错误: ${errorMessage}`, 'error')
      this.terminal.writeln(formattedError)
    }
  }

  /**
   * 显示连接失败信息
   */
  showConnectionFailure(message: string): void {
    if (this.terminal) {
      const formattedMessage = this.formatStatusMessage(`连接失败: ${message}`, 'error')
      this.terminal.writeln(formattedMessage)
    }
  }
}

/**
 * 创建 JumpServer 状态处理器的工厂函数
 */
export function createJumpServerStatusHandler(terminal: Terminal, connectionId: string): JumpServerStatusHandler {
  return new JumpServerStatusHandler(terminal, connectionId)
}

/**
 * 通用状态消息格式化函数（用于非 JumpServer 连接）
 */
export function formatStatusMessage(message: string, type: string = 'info'): string {
  const timestamp = new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  let colorCode = '36' // 默认青色
  let prefix = '●'

  switch (type) {
    case 'success':
      colorCode = '32' // 绿色
      prefix = '✓'
      break
    case 'warning':
      colorCode = '33' // 黄色
      prefix = '⚠'
      break
    case 'error':
      colorCode = '31' // 红色
      prefix = '✗'
      break
    case 'info':
    default:
      colorCode = '36' // 青色
      prefix = '●'
      break
  }

  return `\x1b[90m[${timestamp}]\x1b[0m \x1b[${colorCode}m${prefix}\x1b[0m ${message}`
}
