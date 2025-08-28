import { spawn, ChildProcess } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import EventEmitter from 'events'

export interface LocalTerminalInfo {
  id: number
  sessionId: string
  shell: string
  platform: string
  isAlive: boolean
  process?: ChildProcess
}

export interface LocalCommandProcess extends EventEmitter {
  stdin: NodeJS.WriteStream | null
  kill: () => void
}

/**
 * 本地终端管理器，专门处理AI代理与本地主机的连接和命令执行
 */
export class LocalTerminalManager {
  private terminals: Map<number, LocalTerminalInfo> = new Map()
  private nextTerminalId: number = 1
  private static instance: LocalTerminalManager | null = null

  constructor() {
    // 单例模式
    if (LocalTerminalManager.instance) {
      return LocalTerminalManager.instance
    }
    LocalTerminalManager.instance = this
  }

  /**
   * 获取单例实例
   */
  static getInstance(): LocalTerminalManager {
    if (!LocalTerminalManager.instance) {
      LocalTerminalManager.instance = new LocalTerminalManager()
    }
    return LocalTerminalManager.instance
  }

  /**
   * 检测本地主机是否可用
   */
  isLocalHostAvailable(): boolean {
    return true // 本地主机总是可用的
  }

  /**
   * 获取本地主机信息
   */
  getLocalHostInfo(): {
    host: string
    uuid: string
    connection: string
    platform: string
    defaultShell: string
    homeDir: string
  } {
    const platform = os.platform()
    const homeDir = os.homedir()
    const defaultShell = this.getDefaultShell()

    return {
      host: '127.0.0.1', // 本地主机IP
      uuid: 'localhost', // 特殊UUID标识本地主机
      connection: 'localhost', // 连接类型
      platform: platform,
      defaultShell: defaultShell,
      homeDir: homeDir
    }
  }

  /**
   * 获取默认Shell
   */
  private getDefaultShell(): string {
    const platform = os.platform()
    switch (platform) {
      case 'win32':
        return process.env.SHELL || this.findExecutable(['pwsh.exe', 'powershell.exe', 'cmd.exe']) || 'cmd.exe'
      case 'darwin':
        return process.env.SHELL || this.findExecutable(['/bin/zsh', '/bin/bash']) || '/bin/bash'
      case 'linux':
      default:
        return process.env.SHELL || '/bin/bash'
    }
  }

  /**
   * 查找可执行文件
   */
  private findExecutable(commands: string[]): string | null {
    for (const cmd of commands) {
      try {
        if (os.platform() === 'win32') {
          // Windows 系统的查找逻辑
          if (cmd === 'pwsh.exe') {
            const searchPaths = [
              path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '7', cmd),
              path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'PowerShell', '7', cmd),
              path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '6', cmd)
            ]
            for (const fullPath of searchPaths) {
              if (fs.existsSync(fullPath)) {
                return fullPath
              }
            }
          } else if (cmd === 'powershell.exe') {
            const searchPaths = [
              path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', cmd),
              path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', cmd)
            ]
            for (const fullPath of searchPaths) {
              if (fs.existsSync(fullPath)) {
                return fullPath
              }
            }
          } else if (cmd === 'cmd.exe') {
            const fullPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', cmd)
            if (fs.existsSync(fullPath)) {
              return fullPath
            }
          }
        } else {
          // Unix/Linux/macOS 系统
          if (fs.existsSync(cmd) && fs.statSync(cmd).mode & parseInt('111', 8)) {
            return cmd
          }
        }
      } catch {}
    }
    return null
  }

  /**
   * 创建本地终端连接
   */
  async createTerminal(): Promise<LocalTerminalInfo> {
    const shell = this.getDefaultShell()
    const platform = os.platform()
    const sessionId = `localhost_${Date.now()}_${Math.random().toString(36).substring(2, 14)}`

    const terminal: LocalTerminalInfo = {
      id: this.nextTerminalId++,
      sessionId: sessionId,
      shell: shell,
      platform: platform,
      isAlive: true
    }

    this.terminals.set(terminal.id, terminal)
    return terminal
  }

  /**
   * 在本地主机上运行命令
   */
  runCommand(terminal: LocalTerminalInfo, command: string, cwd?: string): LocalCommandProcess {
    const process = new EventEmitter() as LocalCommandProcess
    const workingDir = cwd || os.homedir()

    console.log(`[LocalTerminal ${terminal.id}] Executing command: ${command}`)
    console.log(`[LocalTerminal ${terminal.id}] Working directory: ${workingDir}`)

    // 根据平台调整命令执行方式
    let shellCommand: string
    let shellArgs: string[]

    if (os.platform() === 'win32') {
      // Windows 平台
      shellCommand = terminal.shell
      if (terminal.shell.includes('cmd.exe')) {
        shellArgs = ['/c', command]
      } else {
        // PowerShell
        shellArgs = ['-Command', command]
      }
    } else {
      // Unix-like 平台
      shellCommand = terminal.shell
      shellArgs = ['-c', command]
    }

    const childProcess = spawn(shellCommand, shellArgs, {
      cwd: workingDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''

    // 处理标准输出
    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      output += chunk
      process.emit('line', chunk)
    })

    // 处理标准错误
    childProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      output += chunk
      process.emit('line', chunk)
    })

    // 处理进程退出
    childProcess.on('close', (code: number | null) => {
      console.log(`[LocalTerminal ${terminal.id}] Command completed with code: ${code}`)
      process.emit('completed', { code, output })
    })

    // 处理进程错误
    childProcess.on('error', (error: Error) => {
      console.error(`[LocalTerminal ${terminal.id}] Command error:`, error)
      process.emit('error', error)
    })

    // 为process添加stdin和kill方法
    process.stdin = childProcess.stdin
    process.kill = () => {
      childProcess.kill()
    }

    return process
  }

  /**
   * 执行命令并获取完整输出
   */
  async executeCommand(
    command: string,
    cwd?: string,
    timeoutMs: number = 30000
  ): Promise<{
    success: boolean
    output?: string
    error?: string
  }> {
    try {
      const terminal = await this.createTerminal()
      const workingDir = cwd || os.homedir()

      return new Promise((resolve) => {
        const process = this.runCommand(terminal, command, workingDir)
        let output = ''
        let timeoutHandler: NodeJS.Timeout

        const cleanup = () => {
          if (timeoutHandler) {
            clearTimeout(timeoutHandler)
          }
          this.terminals.delete(terminal.id)
        }

        // 设置超时
        timeoutHandler = setTimeout(() => {
          process.kill()
          cleanup()
          resolve({
            success: false,
            error: `Command execution timed out (${timeoutMs}ms)`
          })
        }, timeoutMs)

        // 收集输出
        process.on('line', (chunk: string) => {
          output += chunk
        })

        // 处理完成
        process.on('completed', ({ code }: { code: number | null }) => {
          cleanup()
          resolve({
            success: code === 0,
            output: output.trim(),
            error: code !== 0 ? `Command failed with exit code: ${code}` : undefined
          })
        })

        // 处理错误
        process.on('error', (error: Error) => {
          cleanup()
          resolve({
            success: false,
            error: error.message
          })
        })
      })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 关闭终端
   */
  closeTerminal(terminalId: number): boolean {
    const terminal = this.terminals.get(terminalId)
    if (terminal) {
      terminal.isAlive = false
      if (terminal.process) {
        terminal.process.kill()
      }
      this.terminals.delete(terminalId)
      return true
    }
    return false
  }

  /**
   * 获取当前工作目录
   */
  async getCurrentWorkingDirectory(): Promise<string> {
    const result = await this.executeCommand('pwd')
    if (result.success && result.output) {
      return result.output.trim()
    }
    return os.homedir()
  }

  /**
   * 检查sudo权限
   */
  async checkSudoPermission(): Promise<boolean> {
    if (os.platform() === 'win32') {
      return false // Windows没有sudo概念
    }

    const result = await this.executeCommand('sudo -n true', undefined, 5000)
    return result.success
  }

  /**
   * 获取系统信息
   */
  async getSystemInfo(): Promise<{
    osVersion: string
    defaultShell: string
    homeDir: string
    hostName: string
    userName: string
    sudoCheck: string
  }> {
    const platform = os.platform()
    const homeDir = os.homedir()
    const hostName = os.hostname()
    const userName = os.userInfo().username
    const defaultShell = this.getDefaultShell()

    let osVersion = `${platform} ${os.release()}`

    // 尝试获取更详细的系统信息
    if (platform !== 'win32') {
      const unameResult = await this.executeCommand('uname -a')
      if (unameResult.success && unameResult.output) {
        osVersion = unameResult.output.trim()
      }
    }

    const hasSudo = await this.checkSudoPermission()
    const sudoCheck = hasSudo ? 'has sudo permission' : 'no sudo permission'

    return {
      osVersion,
      defaultShell,
      homeDir,
      hostName,
      userName,
      sudoCheck
    }
  }
}

export default LocalTerminalManager
