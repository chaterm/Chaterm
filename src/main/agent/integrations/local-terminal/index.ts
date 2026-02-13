import { spawn, ChildProcess } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import EventEmitter from 'events'
const logger = createLogger('agent')

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
        if (process.env.SHELL) {
          const shellPath = process.env.SHELL
          // If it's just a filename (like 'bash.exe'), try to find the full path
          if (shellPath.includes('\\') || shellPath.includes('/')) {
            // Already a path, check if it exists
            if (fs.existsSync(shellPath)) {
              return shellPath
            }
          } else {
            // Just a filename, try to find it
            const found = this.findExecutable([shellPath])
            if (found) {
              return found
            }
          }
        }
        // Default: try PowerShell, then CMD
        return this.findExecutable(['pwsh.exe', 'powershell.exe', 'cmd.exe']) || 'cmd.exe'
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
          if (cmd === 'bash.exe') {
            // Git Bash search paths
            const searchPaths = [
              path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'bin', cmd),
              path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', cmd),
              path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'usr', 'bin', cmd),
              path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', cmd)
            ]
            for (const fullPath of searchPaths) {
              if (fs.existsSync(fullPath)) {
                return fullPath
              }
            }
            // Try using 'where' command as fallback
            try {
              const { execSync } = require('child_process')
              const result = execSync(`where ${cmd}`, { encoding: 'utf8', stdio: 'pipe' })
              const firstPath = result.trim().split('\n')[0]
              if (firstPath && fs.existsSync(firstPath)) {
                return firstPath
              }
            } catch {}
          } else if (cmd === 'pwsh.exe') {
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
   * @param shell Optional shell path. If not provided, uses default shell detection
   */
  async createTerminal(shell?: string): Promise<LocalTerminalInfo> {
    // Use provided shell, or detect default shell
    const terminalShell = shell || this.getDefaultShell()
    const platform = os.platform()
    const sessionId = `localhost_${Date.now()}_${Math.random().toString(36).substring(2, 14)}`

    const terminal: LocalTerminalInfo = {
      id: this.nextTerminalId++,
      sessionId: sessionId,
      shell: terminalShell,
      platform: platform,
      isAlive: true
    }

    this.terminals.set(terminal.id, terminal)
    return terminal
  }

  /**
   * Translate Unix commands to Windows PowerShell equivalents
   * This ensures Unix-style commands work on Windows PowerShell
   */
  private translateCommandForPowerShell(command: string): string {
    const trimmed = command.trim()

    // ls command translation
    if (trimmed.match(/^ls\b/)) {
      const args = trimmed.substring(2).trim()
      let needsForce = false
      let remainingArgs = args

      // Check for -al or -la (show all files including hidden)
      if (remainingArgs.includes('-al')) {
        needsForce = true
        remainingArgs = remainingArgs.replace(/-al\b/g, '').trim()
      } else if (remainingArgs.includes('-la')) {
        needsForce = true
        remainingArgs = remainingArgs.replace(/-la\b/g, '').trim()
      } else if (remainingArgs.includes('-a')) {
        // Check for -a (but not -al or -la)
        needsForce = true
        remainingArgs = remainingArgs.replace(/-a\b/g, '').trim()
      }

      // Remove -l flag (PowerShell's Get-ChildItem already shows details)
      remainingArgs = remainingArgs.replace(/-l\b/g, '').trim()

      // Build the command
      const forceFlag = needsForce ? ' -Force' : ''
      if (remainingArgs) {
        return `Get-ChildItem${forceFlag} ${remainingArgs}`
      } else {
        return needsForce ? 'Get-ChildItem -Force' : 'Get-ChildItem'
      }
    }

    // cat command translation
    if (trimmed.match(/^cat\s/)) {
      // PowerShell has 'cat' alias for Get-Content, but use explicit cmdlet for reliability
      const args = trimmed.substring(3).trim()
      return args ? `Get-Content ${args}` : 'Get-Content'
    }

    // pwd command translation (already handled in getCurrentWorkingDirectory, but keep for consistency)
    if (trimmed === 'pwd' || trimmed.match(/^pwd\s*$/)) {
      return '$PWD'
    }

    // Return original command if no translation needed
    // PowerShell may have aliases for some commands (like 'ls', 'cat'), so they might work as-is
    return command
  }

  /**
   * Run command on local host
   */
  runCommand(terminal: LocalTerminalInfo, command: string, cwd?: string): LocalCommandProcess {
    const commandProcess = new EventEmitter() as LocalCommandProcess
    const workingDir = cwd || os.homedir()

    // Adjust command execution method based on platform
    let shellCommand: string
    let shellArgs: string[]
    let finalCommand = command

    if (os.platform() === 'win32') {
      // Windows platform
      shellCommand = terminal.shell
      if (terminal.shell.includes('cmd.exe')) {
        shellArgs = ['/c', finalCommand]
      } else if (terminal.shell.includes('bash.exe') || terminal.shell.includes('bash')) {
        // Git Bash or other bash shells on Windows
        shellArgs = ['-c', finalCommand]
      } else {
        // PowerShell - translate Unix commands
        finalCommand = this.translateCommandForPowerShell(command)
        shellArgs = ['-Command', finalCommand]
      }
    } else {
      // Unix-like platforms
      shellCommand = terminal.shell
      shellArgs = ['-c', finalCommand]
    }

    // Prepare environment variables
    const env = { ...process.env }

    // For Git Bash on Windows, ensure proper environment setup
    if (os.platform() === 'win32' && (shellCommand.includes('bash.exe') || shellCommand.includes('bash'))) {
      // Git Bash may need MSYSTEM environment variable
      if (!env.MSYSTEM) {
        env.MSYSTEM = 'MINGW64'
      }
      // Ensure PATH includes Git Bash binaries
      const gitBashPath = shellCommand.replace(/\\bash\.exe$/i, '').replace(/\\bin\\bash\.exe$/i, '\\bin')
      if (gitBashPath && !env.PATH?.includes(gitBashPath)) {
        env.PATH = `${gitBashPath};${env.PATH || ''}`
      }
    }

    const childProcess = spawn(shellCommand, shellArgs, {
      cwd: workingDir,
      env: env,
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
      commandProcess.emit('completed', { code, output })
    })

    // Handle process error
    childProcess.on('error', (error: Error) => {
      logger.error(`[LocalTerminal ${terminal.id}] Command error`, { error: error })
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
    const platform = os.platform()
    let command: string

    if (platform === 'win32') {
      // Windows platform
      const shell = this.getDefaultShell()
      if (shell.includes('cmd.exe')) {
        // CMD: use 'cd' command (outputs current directory without newline)
        command = 'cd'
      } else if (shell.includes('bash.exe') || shell.includes('bash')) {
        // Git Bash or other bash shells: use 'pwd' command
        command = 'pwd'
      } else {
        // PowerShell: use $PWD to get current path as string
        command = '$PWD'
      }
    } else {
      // Unix-like platforms
      command = 'pwd'
    }

    const result = await this.executeCommand(command)
    if (result.success && result.output) {
      // Trim whitespace and newlines
      const path = result.output.trim()
      // For PowerShell, $PWD might include quotes, remove them
      if (platform === 'win32' && !this.getDefaultShell().includes('cmd.exe') && !this.getDefaultShell().includes('bash')) {
        return path.replace(/^["']|["']$/g, '')
      }
      return path
    }
    return os.homedir()
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

    return {
      osVersion,
      defaultShell,
      homeDir,
      hostName,
      userName
    }
  }
}

export default LocalTerminalManager
