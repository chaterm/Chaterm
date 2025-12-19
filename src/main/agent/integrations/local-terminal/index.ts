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
  stdin: NodeJS.WritableStream | null
  kill: () => void
}

/**
 * Local terminal manager for handling AI agent connections and command execution on local host
 */
export class LocalTerminalManager {
  private terminals: Map<number, LocalTerminalInfo> = new Map()
  private nextTerminalId: number = 1
  private static instance: LocalTerminalManager | null = null

  constructor() {
    // Singleton pattern
    if (LocalTerminalManager.instance) {
      return LocalTerminalManager.instance
    }
    LocalTerminalManager.instance = this
  }

  /**
   * Get singleton instance
   */
  static getInstance(): LocalTerminalManager {
    if (!LocalTerminalManager.instance) {
      LocalTerminalManager.instance = new LocalTerminalManager()
    }
    return LocalTerminalManager.instance
  }

  /**
   * Check if local host is available
   */
  isLocalHostAvailable(): boolean {
    return true // Local host is always available
  }

  /**
   * Get local host information
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
      host: '127.0.0.1', // Local host IP
      uuid: 'localhost', // Special UUID identifier for local host
      connection: 'localhost', // Connection type
      platform: platform,
      defaultShell: defaultShell,
      homeDir: homeDir
    }
  }

  /**
   * Get default shell
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
   * Find executable file
   */
  private findExecutable(commands: string[]): string | null {
    for (const cmd of commands) {
      try {
        if (os.platform() === 'win32') {
          // Windows system search logic
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
          // Unix/Linux/macOS systems
          if (fs.existsSync(cmd) && fs.statSync(cmd).mode & parseInt('111', 8)) {
            return cmd
          }
        }
      } catch {}
    }
    return null
  }

  /**
   * Create local terminal connection
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
   * Run command on local host
   */
  runCommand(terminal: LocalTerminalInfo, command: string, cwd?: string): LocalCommandProcess {
    const commandProcess = new EventEmitter() as LocalCommandProcess
    const workingDir = cwd || os.homedir()

    console.log(`[LocalTerminal ${terminal.id}] Executing command: ${command}`)
    console.log(`[LocalTerminal ${terminal.id}] Working directory: ${workingDir}`)

    // Adjust command execution method based on platform
    let shellCommand: string
    let shellArgs: string[]

    if (os.platform() === 'win32') {
      // Windows platform
      shellCommand = terminal.shell
      if (terminal.shell.includes('cmd.exe')) {
        shellArgs = ['/c', command]
      } else {
        // PowerShell
        shellArgs = ['-Command', command]
      }
    } else {
      // Unix-like platforms
      shellCommand = terminal.shell
      shellArgs = ['-c', command]
    }

    const childProcess = spawn(shellCommand, shellArgs, {
      cwd: workingDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''

    // Handle standard output
    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      output += chunk
      commandProcess.emit('line', chunk)
    })

    // Handle standard error
    childProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      output += chunk
      commandProcess.emit('line', chunk)
    })

    // Handle process exit
    childProcess.on('close', (code: number | null) => {
      console.log(`[LocalTerminal ${terminal.id}] Command completed with code: ${code}`)
      commandProcess.emit('completed', { code, output })
    })

    // Handle process error
    childProcess.on('error', (error: Error) => {
      console.error(`[LocalTerminal ${terminal.id}] Command error:`, error)
      commandProcess.emit('error', error)
    })

    // Add stdin and kill methods to commandProcess
    commandProcess.stdin = childProcess.stdin
    commandProcess.kill = () => {
      childProcess.kill()
    }

    return commandProcess
  }

  /**
   * Execute command and get complete output
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

        // Set timeout
        timeoutHandler = setTimeout(() => {
          process.kill()
          cleanup()
          resolve({
            success: false,
            error: `Command execution timed out (${timeoutMs}ms)`
          })
        }, timeoutMs)

        // Collect output
        process.on('line', (chunk: string) => {
          output += chunk
        })

        // Handle completion
        process.on('completed', ({ code }: { code: number | null }) => {
          cleanup()
          resolve({
            success: code === 0,
            output: output.trim(),
            error: code !== 0 ? `Command failed with exit code: ${code}` : undefined
          })
        })

        // Handle error
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
   * Close terminal
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
   * Get current working directory
   */
  async getCurrentWorkingDirectory(): Promise<string> {
    const result = await this.executeCommand('pwd')
    if (result.success && result.output) {
      return result.output.trim()
    }
    return os.homedir()
  }

  /**
   * Check sudo permission
   */
  async checkSudoPermission(): Promise<boolean> {
    if (os.platform() === 'win32') {
      return false // Windows does not have sudo concept
    }

    const result = await this.executeCommand('sudo -n true', undefined, 5000)
    return result.success
  }

  /**
   * Get system information
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

    // Try to get more detailed system information
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
