import { BrownEventEmitter } from './event'
import { remoteSshConnect, remoteSshExecStream, remoteSshDisconnect } from '../../../ssh/agentHandle'
import { remoteWsConnect, remoteWsExec, remoteWsDisconnect, RemoteWsConnectionInfo } from './ws'

export interface RemoteTerminalProcessEvents extends Record<string, any[]> {
  line: [line: string]
  continue: []
  completed: []
  error: [error: Error]
  no_shell_integration: []
}

export interface ConnectionInfo {
  id?: string
  host?: string
  port?: number
  username?: string
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
  // For WebSocket connections, these are required.
  type?: 'ssh' | 'websocket'
  wsUrl?: string
  token?: string
  terminalId?: string
  email?: string
  organizationId?: string
  uid?: number | string
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
      // 清理cwd中的ANSI转义序列
      const cleanCwd = cwd ? cwd.replace(/\x1B\[[^m]*m/g, '').replace(/\x1B\[[?][0-9]*[hl]/g, '') : undefined
      const commandToExecute = cleanCwd ? `cd ${cleanCwd} && ${command}` : command

      // 用于处理跨 chunk 的残余行
      let lineBuffer = ''

      // 通过流式方法执行远程命令
      const execResult = await remoteSshExecStream(sessionId, commandToExecute, (chunk: string) => {
        // 累积完整输出
        this.fullOutput += chunk

        if (!this.isListening) return

        // 处理行切分，保留末尾不完整部分
        let data = lineBuffer + chunk
        const lines = data.split(/\r?\n/)
        lineBuffer = lines.pop() || '' // 最后一个可能是不完整行，缓存起来

        for (const line of lines) {
          if (line.trim()) this.emit('line', line)
        }
        // 更新检索索引
        this.lastRetrievedIndex = this.fullOutput.length
      })

      // 处理命令结束后的残余行
      if (lineBuffer && this.isListening) {
        this.emit('line', lineBuffer)
      }

      if (execResult && execResult.success) {
        this.emit('completed')
      } else {
        const error = new Error(execResult?.error || '远程命令执行失败')
        this.emit('error', error)
        throw error
      }

      // 触发 continue，以便外部 promise 解析
      this.emit('continue')
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
export function mergeRemotePromise(process: RemoteTerminalProcess, promise: Promise<void>): RemoteTerminalProcessResultPromise {
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
  private wsConnections: Map<string, string> = new Map() // connectionKey -> sessionId
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
    if (!this.connectionInfo) {
      throw new Error('未设置连接信息，请先调用 setConnectionInfo()')
    }

    // WebSocket 连接逻辑
    if (this.connectionInfo.type === 'websocket') {
      const { wsUrl, token, terminalId, host, organizationId, uid } = this.connectionInfo
      if (!wsUrl || !terminalId || !host || !organizationId || uid === undefined) {
        throw new Error('WebSocket 连接缺少 wsUrl, terminalId, host, organizationId, 或 uid')
      }

      // 使用 IP, organizationId, 和 uid 创建唯一键
      const connectionKey = `${host}:${organizationId}:${uid}`

      // 检查是否已有此连接
      const existingSessionId = this.wsConnections.get(connectionKey)
      if (existingSessionId) {
        const existingTerminal = Array.from(this.terminals.values()).find((t) => t.sessionId === existingSessionId)
        if (existingTerminal) {
          console.log(`复用现有的 WebSocket 连接: ${connectionKey}`)
          return existingTerminal
        } else {
          // 如果连接池中有记录，但终端列表中没有，说明状态不一致，移除无效记录
          this.wsConnections.delete(connectionKey)
        }
      }

      const wsInfo: RemoteWsConnectionInfo = {
        wsUrl: wsUrl,
        token: token,
        terminalId: terminalId
      }
      const connectResult = await remoteWsConnect(wsInfo)
      if (!('id' in connectResult)) {
        throw new Error('WebSocket连接失败: ' + (connectResult.error || '未知错误'))
      }

      const newSessionId = connectResult.id
      this.wsConnections.set(connectionKey, newSessionId) // 存储新连接

      const terminalInfo: RemoteTerminalInfo = {
        id: this.nextTerminalId++,
        sessionId: newSessionId,
        busy: false,
        lastCommand: '',
        connectionInfo: this.connectionInfo,
        terminal: { show: () => {} }
      }
      this.terminals.set(terminalInfo.id, terminalInfo)
      return terminalInfo
    }

    // SSH 连接逻辑
    const existingTerminal = Array.from(this.terminals.values()).find(
      (terminal) =>
        terminal.connectionInfo.host === this.connectionInfo?.host &&
        terminal.connectionInfo.port === this.connectionInfo?.port &&
        terminal.connectionInfo.username === this.connectionInfo?.username
    )

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
      process.once('continue', () => {
        resolve()
      })
      process.once('error', (error) => {
        reject(error)
      })
      if (terminalInfo.connectionInfo.type === 'websocket') {
        remoteWsExec(terminalInfo.sessionId, command)
          .then((execResult) => {
            if (execResult.success) {
              const output = execResult.output || ''
              process['fullOutput'] = output
              if (output) {
                const lines = output.split('\n')
                for (const line of lines) {
                  if (line.trim()) process.emit('line', line)
                }
              }
              console.log('WebSocket 命令执行成功')
              process.emit('completed')
              process.emit('continue')
            } else {
              const error = new Error(execResult.error || 'WebSocket命令执行失败')
              process.emit('error', error)
              reject(error)
            }
          })
          .catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err))
            process.emit('error', error)
            reject(error)
          })
      } else {
        process.run(terminalInfo.sessionId, command, cwd).catch(reject)
      }
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
      .filter((t) => t.busy === busy)
      .map((t) => ({ id: t.id, lastCommand: t.lastCommand }))
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
      busyCount: terminals.filter((t) => t.busy).length
    }
  }

  // 清理所有连接
  async disposeAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = []
    for (const terminalInfo of this.terminals.values()) {
      disconnectPromises.push(this.disconnectTerminal(terminalInfo.id))
    }
    await Promise.all(disconnectPromises)
    this.terminals.clear()
    this.processes.clear()
    this.wsConnections.clear() // 清空 WebSocket 连接池
    console.log('所有远程终端已关闭。')
  }

  // 断开指定终端连接
  async disconnectTerminal(terminalId: number): Promise<void> {
    const terminalInfo = this.terminals.get(terminalId)
    if (terminalInfo) {
      this.processes.delete(terminalId)
      this.terminals.delete(terminalId)
      try {
        if (terminalInfo.connectionInfo.type === 'websocket') {
          const { host, organizationId, uid } = terminalInfo.connectionInfo
          if (host && organizationId && uid !== undefined) {
            const connectionKey = `${host}:${organizationId}:${uid}`
            this.wsConnections.delete(connectionKey)
          }
          await remoteWsDisconnect(terminalInfo.sessionId)
          console.log(`WebSocket 终端 ${terminalId} (Session: ${terminalInfo.sessionId}) 已断开.`)
        } else {
          await remoteSshDisconnect(terminalInfo.sessionId)
          console.log(`SSH 终端 ${terminalId} (Session: ${terminalInfo.sessionId}) 已断开.`)
        }
      } catch (error) {
        console.error(`断开终端 ${terminalId} 时出错:`, error)
      }
    }
  }
}
