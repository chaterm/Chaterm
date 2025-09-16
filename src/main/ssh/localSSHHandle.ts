import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { getUserConfig } from '../agent/core/storage/state'

// Import language translations
const translations = {
  'zh-CN': {
    localhost: '本地连接'
  },
  'en-US': {
    localhost: 'Localhost'
  }
}

// Function to get user's language preference
const getUserLanguage = async (): Promise<string> => {
  try {
    const userConfig = await getUserConfig()
    return userConfig?.language || 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

// Function to get translated text
const getTranslation = async (key: string, lang?: string): Promise<string> => {
  const language = lang || (await getUserLanguage())
  return translations[language]?.[key] || translations['zh-CN'][key] || key
}

interface LocalTerminalConfig {
  id: string
  shell?: string
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
  termType?: string
}

interface LocalTerminal {
  id: string
  pty: pty.IPty
  isAlive: boolean
}

interface ShellItem {
  key: string
  title: string
  ip: string
  uuid: string
  group_name: string
  label: string
  authType: string
  port: number
  username: string
  password: string
  key_chain_id: number
  asset_type: string
  organizationId: string
}

interface LocalShellsResult {
  key: string
  title: string
  children: ShellItem[]
}

const terminals: Map<string, LocalTerminal> = new Map()

const sendToRenderer = (channel: string, data: unknown) => {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((window) => {
    window.webContents.send(channel, data)
  })
}

const getDefaultShell = (): string => {
  const platform = os.platform()
  switch (platform) {
    case 'win32':
      return process.env.SHELL || findExecutable(['pwsh.exe', 'powershell.exe', 'cmd.exe']) || 'cmd.exe'
    case 'darwin':
      return process.env.SHELL || findExecutable(['/bin/zsh', '/bin/bash']) || '/bin/bash'
    case 'linux':
    default:
      return process.env.SHELL || '/bin/bash'
  }
}

const createTerminal = async (config: LocalTerminalConfig): Promise<LocalTerminal> => {
  const shell = config.shell || getDefaultShell()
  const cwd = config.cwd || os.homedir()
  const env = { ...process.env, ...config.env }
  let args: string[] = []

  const ptyProcess = pty.spawn(shell, args, {
    name: config.termType || 'xterm',
    cols: config.cols || 80,
    rows: config.rows || 24,
    cwd,
    env
  })
  const terminal: LocalTerminal = {
    id: config.id,
    pty: ptyProcess,
    isAlive: true
  }

  ptyProcess.onData((data) => {
    if (data.includes('command not found') || data.includes('error') || data.includes('Error')) {
      sendToRenderer(`local:error:${config.id}`, data)
    }
    sendToRenderer(`local:data:${config.id}`, data)
  })

  ptyProcess.onExit((exitCode) => {
    console.log(`Local terminal ${config.id} exited with code: ${exitCode?.exitCode}`)
    terminal.isAlive = false
    sendToRenderer(`local:exit:${config.id}`, exitCode)
    terminals.delete(config.id)
  })

  terminals.set(config.id, terminal)
  return terminal
}

const closeTerminal = (terminalId: string) => {
  const terminal = terminals.get(terminalId)
  if (terminal) {
    try {
      terminal.pty.kill()
      terminal.isAlive = false
      terminals.delete(terminalId)
      return { success: true }
    } catch (error: unknown) {
      const e = error as Error
      return { success: false, message: e.message }
    }
  }
  return { success: false, message: 'Terminal not found' }
}

const getAvailableShells = async (): Promise<LocalShellsResult> => {
  const platform = os.platform()
  const shells: ShellItem[] = []

  const candidates =
    platform === 'win32'
      ? [
          { name: 'Command Prompt (CMD)', path: 'cmd.exe' },
          { name: 'PowerShell Core 7+', path: 'pwsh.exe' },
          { name: 'Windows PowerShell', path: 'powershell.exe' },
          { name: 'Git Bash Terminal', path: 'bash.exe' }
        ]
      : platform === 'darwin'
        ? [
            { name: 'Zsh Shell (Default)', path: '/bin/zsh' }
            // { name: 'Bash Shell', path: '/bin/bash' },
            // { name: 'Fish Shell', path: '/usr/local/bin/fish' }
          ]
        : [
            { name: 'Bash Shell (Default)', path: '/bin/bash' },
            { name: 'Zsh Shell', path: '/bin/zsh' },
            { name: 'Fish Shell', path: '/usr/bin/fish' }
          ]

  for (const candidate of candidates) {
    const actualPath = platform === 'win32' ? findExecutable([candidate.path]) || candidate.path : candidate.path

    if (isShellAvailable(actualPath)) {
      shells.push({
        key: `local-shell-${candidate.name.toLowerCase().replace(/\s+/g, '-')}`,
        title: candidate.name,
        ip: '127.0.0.1',
        uuid: actualPath, // 使用shell路径作为uuid
        group_name: await getTranslation('localhost'),
        label: await getTranslation('localhost'),
        authType: '',
        port: 0,
        username: '',
        password: '',
        key_chain_id: 0,
        asset_type: 'shell',
        organizationId: 'person'
      })
    }
  }

  return {
    key: 'localTerm',
    title: await getTranslation('localhost'),
    children: shells
  }
}

const findExecutable = (commands: string[]): string | null => {
  for (const cmd of commands) {
    try {
      if (os.platform() === 'win32') {
        const searchPaths: string[] = []

        if (cmd === 'pwsh.exe') {
          //查找 PowerShell 7+路径
          searchPaths.push(
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '7', cmd),
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'PowerShell', '7', cmd),
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '6', cmd)
          )
        } else if (cmd === 'powershell.exe') {
          // 查找PowerShell路径
          searchPaths.push(
            path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', cmd),
            path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', cmd)
          )
        } else if (cmd === 'cmd.exe') {
          // 查找Command路径
          searchPaths.push(path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', cmd))
        } else if (cmd === 'bash.exe') {
          // 查找Git Bash路径
          searchPaths.push(
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'bin', cmd),
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', cmd),
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'usr', 'bin', cmd)
          )
        }

        for (const fullPath of searchPaths) {
          if (fs.existsSync(fullPath)) {
            return fullPath
          }
        }

        try {
          const { execSync } = require('child_process')
          const result = execSync(`where ${cmd}`, { encoding: 'utf8', stdio: 'pipe' })
          const firstPath = result.trim().split('\n')[0]
          if (firstPath && fs.existsSync(firstPath)) {
            return firstPath
          }
        } catch {}
      } else {
        // Unix/Linux/macOS 系统
        if (fs.existsSync(cmd) && fs.statSync(cmd).mode & parseInt('111', 8)) {
          return cmd
        }

        try {
          const { execSync } = require('child_process')
          const result = execSync(`which ${cmd}`, { encoding: 'utf8', stdio: 'pipe' })
          const foundPath = result.trim()
          if (foundPath && fs.existsSync(foundPath)) {
            return foundPath
          }
        } catch {}
      }
    } catch {}
  }
  return null
}
const isShellAvailable = (shellPath: string): boolean => {
  try {
    return fs.existsSync(shellPath)
  } catch {
    return false
  }
}
export const registerLocalSSHHandlers = () => {
  ipcMain.handle('local:connect', async (_event, config: LocalTerminalConfig) => {
    try {
      await createTerminal(config)
      return { success: true, message: 'Local terminal connected successfully' }
    } catch (error: unknown) {
      console.error('Local terminal connection failed:', error)
      const e = error as Error
      return { success: false, message: e.message }
    }
  })

  ipcMain.handle('local:send:data', (_event, terminalId: string, data: string) => {
    const terminal = terminals.get(terminalId)
    if (terminal && terminal.isAlive) {
      terminal.pty.write(data)
      return { success: true }
    }
    return { success: false, message: 'Terminal not found or not alive' }
  })

  ipcMain.handle('local:resize', (_event, terminalId: string, cols: number, rows: number) => {
    const terminal = terminals.get(terminalId)
    if (terminal && terminal.isAlive) {
      terminal.pty.resize(cols, rows)
      return { success: true }
    }
    return { success: false, message: 'Terminal not found or not alive' }
  })

  ipcMain.handle('local:close', (_event, terminalId: string) => {
    return closeTerminal(terminalId)
  })

  ipcMain.handle('local:get:shells', async () => {
    return getAvailableShells()
  })

  ipcMain.handle('local:get-working-directory', async () => {
    try {
      const cwd = process.cwd()
      return { success: true, cwd }
    } catch (error: unknown) {
      const e = error as Error
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('local:execute-command', async (_event, command: string) => {
    try {
      const { execSync } = require('child_process')
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024
      })
      return {
        success: true,
        output: output.toString()
      }
    } catch (error: unknown) {
      let errorMessage = '未知错误'
      let outputMessage = ''
      if (error instanceof Error) {
        errorMessage = error.message
        const execError = error as Error & {
          stdout?: Buffer | string
          stderr?: Buffer | string
          status?: number
          signal?: string
        }

        if (execError.stdout) {
          outputMessage = execError.stdout.toString()
        }
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        errorMessage = (error as any).message || '命令执行失败'

        if ('stdout' in error) {
          const stdout = (error as any).stdout
          outputMessage = stdout ? stdout.toString() : ''
        }
      }

      return {
        success: false,
        error: errorMessage,
        output: outputMessage
      }
    }
  })
}
