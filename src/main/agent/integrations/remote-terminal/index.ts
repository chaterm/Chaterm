import { BrownEventEmitter } from './event'
import { 
  remoteSshConnect, 
  remoteSshExec, 
  remoteSshDisconnect 
} from '../../../ssh/agentHandle';

export interface RemoteTerminalProcessEvents extends Record<string, any[]> {
  line: [line: string]
  continue: []
  completed: []
  error: [error: Error]
  no_shell_integration: []
}

export interface ConnectionInfo {
  id?: string
  host: string
  port: number
  username: string
  /**
   * Password for authentication. If both password and privateKey are provided,
   * privateKey takes precedence over password.
   */
  password?: string
  /**
   * Private key for authentication. Takes precedence over password if both are provided.
   */
  privateKey?: string
  passphrase?: string
}

export interface RemoteTerminalInfo {
  id: number
  sessionId: string
  busy: boolean
  lastCommand: string
  connectionInfo: ConnectionInfo
  terminal: {
    show: () => void
  }
}

// 远程终端进程类，使用自定义事件发射器
export class RemoteTerminalProcess extends BrownEventEmitter<RemoteTerminalProcessEvents> {
  private isListening: boolean = true
  private fullOutput: string = ''
  private lastRetrievedIndex: number = 0
  isHot: boolean = false

  constructor() {
    super()
  }

  async run(sessionId: string, command: string, cwd?: string): Promise<void> {
    try {
      const commandToExecute = cwd ? `cd ${cwd} && ${command}` : command;
      // 执行远程命令
      const execResult = await remoteSshExec(sessionId, commandToExecute)

      console.log(`执行结果: ${JSON.stringify(execResult)}`)
      // 添加详细的调试信息
      if (execResult && execResult.success) {
        const output = execResult.output || ''
        this.fullOutput = output
        
        if (this.isListening) {
          if (output) {
            const lines = output.split('\n')
            for (const line of lines) {
              if (line.trim()) { // 只发送非空行
                this.emit('line', line)
              }
            }
          }
          this.lastRetrievedIndex = this.fullOutput.length
          this.emit('completed')
        }
        this.emit('continue')
      } else {
        console.log('execResult.success:', execResult?.success)
        console.log('execResult.error:', execResult?.error)
        const error = new Error(execResult?.error || '远程命令执行失败')
        this.emit('error', error)
        throw error
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.log('catch中的error事件:', err.message)
      console.log('错误堆栈:', err.stack)
      this.emit('error', err)
      throw err
    }
  }

  continue(): void {
    this.isListening = false
    this.emit('continue')
  }

  getUnretrievedOutput(): string {
    const unretrieved = this.fullOutput.slice(this.lastRetrievedIndex)
    this.lastRetrievedIndex = this.fullOutput.length
    return unretrieved
  }
}

// 远程终端进程结果 Promise 类型
export type RemoteTerminalProcessResultPromise = RemoteTerminalProcess & Promise<void>

// 合并进程和 Promise
export function mergeRemotePromise(
  process: RemoteTerminalProcess,
  promise: Promise<void>
): RemoteTerminalProcessResultPromise {
  const merged = process as RemoteTerminalProcessResultPromise
  
  // 复制 Promise 方法
  merged.then = promise.then.bind(promise)
  merged.catch = promise.catch.bind(promise)
  merged.finally = promise.finally.bind(promise)
  
  return merged
}

// 远程终端管理器类
export class RemoteTerminalManager {
  private terminals: Map<number, RemoteTerminalInfo> = new Map()
  private processes: Map<number, RemoteTerminalProcess> = new Map()
  private nextTerminalId = 1
  private connectionInfo: ConnectionInfo | null = null

  constructor() {
    // 设置默认连接信息
  }

  // 设置 SSH 连接信息
  setConnectionInfo(info: ConnectionInfo): void {
    this.connectionInfo = info
  }

  // 创建新的远程终端
  async createTerminal(): Promise<RemoteTerminalInfo> {
    // 如果没有设置连接信息，使用默认值
    if (!this.connectionInfo) {
      throw new Error('未设置 SSH 连接信息，请先调用 setConnectionInfo()')
    }

    // 检查是否已有相同连接信息的终端
    const existingTerminal = Array.from(this.terminals.values()).find(terminal => {
      return terminal.connectionInfo.host === this.connectionInfo?.host &&
             terminal.connectionInfo.port === this.connectionInfo?.port &&
             terminal.connectionInfo.username === this.connectionInfo?.username
    })

    if (existingTerminal) {
      console.log('发现现有终端连接，返回现有连接')
      return existingTerminal
    }

    try {
      const connectResult = await remoteSshConnect(this.connectionInfo)
      
      if (!connectResult || !connectResult.id) {
        throw new Error('SSH 连接失败: ' + (connectResult?.error || '未知错误'))
      }

      const terminalInfo: RemoteTerminalInfo = {
        id: this.nextTerminalId++,
        sessionId: connectResult.id,
        busy: false,
        lastCommand: '',
        connectionInfo: this.connectionInfo,
        terminal: {
          show: () => {} // 远程终端的 show 方法为空操作
        }
      }

      this.terminals.set(terminalInfo.id, terminalInfo)
      return terminalInfo
    } catch (error) {
      throw new Error('创建远程终端失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // 运行远程命令
  runCommand(terminalInfo: RemoteTerminalInfo, command: string, cwd?: string): RemoteTerminalProcessResultPromise {
    terminalInfo.busy = true
    terminalInfo.lastCommand = command

    const process = new RemoteTerminalProcess()
    this.processes.set(terminalInfo.id, process)


    process.once('error', (error) => {
      terminalInfo.busy = false
      console.error(`远程终端 ${terminalInfo.id} 出错:`, error)
    })

    const promise = new Promise<void>((resolve, reject) => {
      console.log(`Promise构造函数执行中...`)
      
      process.once('continue', () => {
        console.log(`Promise: 收到continue事件，即将resolve`)
        resolve() 
      })
      process.once('error', (error) => {
        console.log(`Promise: 收到error事件，即将reject`)
        reject(error)
      })

      // 立即执行远程命令
      process.run(terminalInfo.sessionId, command, cwd).catch(reject)
    })

    const result = mergeRemotePromise(process, promise)
    return result
  }

  // 获取未检索的输出
  getUnretrievedOutput(terminalId: number): string {
    const process = this.processes.get(terminalId)
    return process ? process.getUnretrievedOutput() : ''
  }

  // 检查进程是否处于热状态
  isProcessHot(terminalId: number): boolean {
    const process = this.processes.get(terminalId)
    return process ? process.isHot : false
  }

  // 获取终端信息
  getTerminals(busy: boolean): { id: number; lastCommand: string }[] {
    return Array.from(this.terminals.values())
      .filter(t => t.busy === busy)
      .map(t => ({ id: t.id, lastCommand: t.lastCommand }))
  }

  // 检查是否已连接
  isConnected(): boolean {
    return this.terminals.size > 0
  }

  // 获取连接状态
  getConnectionStatus(): { connected: boolean; terminalCount: number; busyCount: number } {
    const terminals = Array.from(this.terminals.values())
    return {
      connected: terminals.length > 0,
      terminalCount: terminals.length,
      busyCount: terminals.filter(t => t.busy).length
    }
  }

  // 测试连接
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.connectionInfo) {
      return { success: false, message: '未设置连接信息' }
    }

    try {
      const connectResult = await remoteSshConnect(this.connectionInfo)
      
      if (!connectResult || !connectResult.id) {
        return { 
          success: false, 
          message: 'SSH 连接失败: ' + (connectResult?.error || '未知错误') 
        }
      }

      // 测试执行一个简单命令
      const execResult = await remoteSshExec(connectResult.id, 'echo "test"')
      
      // 断开测试连接
      await remoteSshDisconnect(connectResult.id)
      
      if (execResult && execResult.success) {
        return { success: true, message: '连接测试成功' }
      } else {
        return { 
          success: false, 
          message: '命令执行测试失败: ' + (execResult?.error || '未知错误') 
        }
      }
    } catch (error) {
      return { 
        success: false, 
        message: '连接测试失败: ' + (error instanceof Error ? error.message : String(error)) 
      }
    }
  }

  // 清理所有连接
  async disposeAll(): Promise<void> {
    for (const terminal of this.terminals.values()) {
      try {
        await remoteSshDisconnect(terminal.sessionId)
      } catch (error) {
        console.error(`断开 SSH 连接失败 (${terminal.sessionId}):`, error)
      }
    }
    this.terminals.clear()
    this.processes.clear()
  }

  // 断开特定终端的连接
  async disconnectTerminal(terminalId: number): Promise<void> {
    const terminal = this.terminals.get(terminalId)
    if (terminal) {
      try {
        await remoteSshDisconnect(terminal.sessionId)
      } catch (error) {
        console.error(`断开 SSH 连接失败 (${terminal.sessionId}):`, error)
      } finally {
        this.terminals.delete(terminalId)
        this.processes.delete(terminalId)
      }
    }
  }
} 