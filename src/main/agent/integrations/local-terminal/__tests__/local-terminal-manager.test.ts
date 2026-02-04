import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawn } from 'child_process'
import * as os from 'os'
import * as fs from 'fs'
import EventEmitter from 'events'
import { LocalTerminalManager, LocalTerminalInfo } from '../index'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}))

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn()
  }
})

// Mock os
vi.mock('os', async () => {
  const actual = await vi.importActual('os')
  return {
    ...actual,
    platform: vi.fn(),
    homedir: vi.fn(() => '/home/test'),
    hostname: vi.fn(() => 'test-host'),
    userInfo: vi.fn(() => ({ username: 'testuser' })),
    release: vi.fn(() => '10.0.0')
  }
})

describe('LocalTerminalManager', () => {
  let manager: LocalTerminalManager
  let mockChildProcess: any
  let mockStdout: EventEmitter
  let mockStderr: EventEmitter

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset singleton instance
    ;(LocalTerminalManager as any).instance = null

    // Create mock child process
    mockStdout = new EventEmitter()
    mockStderr = new EventEmitter()
    mockChildProcess = {
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: { write: vi.fn() },
      kill: vi.fn(),
      on: vi.fn((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10)
        }
      })
    }
    ;(spawn as any).mockReturnValue(mockChildProcess)
    ;(os.platform as any).mockReturnValue('win32')
    ;(fs.existsSync as any).mockReturnValue(true)
    ;(fs.statSync as any).mockReturnValue({ mode: parseInt('755', 8) })

    manager = LocalTerminalManager.getInstance()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = LocalTerminalManager.getInstance()
      const instance2 = LocalTerminalManager.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should return existing instance in constructor', () => {
      const instance1 = LocalTerminalManager.getInstance()
      const instance2 = new LocalTerminalManager()
      expect(instance1).toBe(instance2)
    })
  })

  describe('isLocalHostAvailable', () => {
    it('should always return true', () => {
      expect(manager.isLocalHostAvailable()).toBe(true)
    })
  })

  describe('getLocalHostInfo', () => {
    it('should return local host information', () => {
      const info = manager.getLocalHostInfo()
      expect(info.host).toBe('127.0.0.1')
      expect(info.uuid).toBe('localhost')
      expect(info.connection).toBe('localhost')
      expect(info.platform).toBe('win32')
      expect(info.homeDir).toBe('/home/test')
    })
  })

  describe('createTerminal', () => {
    it('should create a terminal with default shell', async () => {
      const terminal = await manager.createTerminal()
      expect(terminal).toBeDefined()
      expect(terminal.id).toBeGreaterThan(0)
      expect(terminal.sessionId).toContain('localhost_')
      expect(terminal.platform).toBe('win32')
      expect(terminal.isAlive).toBe(true)
    })

    it('should create a terminal with specified shell', async () => {
      const customShell = 'C:\\Program Files\\Git\\bin\\bash.exe'
      const terminal = await manager.createTerminal(customShell)
      expect(terminal.shell).toBe(customShell)
    })

    it('should generate unique terminal IDs', async () => {
      const terminal1 = await manager.createTerminal()
      const terminal2 = await manager.createTerminal()
      expect(terminal1.id).not.toBe(terminal2.id)
    })
  })

  describe('runCommand', () => {
    let terminal: LocalTerminalInfo

    beforeEach(async () => {
      terminal = await manager.createTerminal()
    })

    it('should execute command on Windows CMD', () => {
      terminal.shell = 'C:\\Windows\\System32\\cmd.exe'
      const process = manager.runCommand(terminal, 'dir')

      expect(spawn).toHaveBeenCalledWith(
        'C:\\Windows\\System32\\cmd.exe',
        ['/c', 'dir'],
        expect.objectContaining({
          cwd: '/home/test',
          env: expect.any(Object),
          stdio: ['pipe', 'pipe', 'pipe']
        })
      )
      expect(process).toBeDefined()
      expect(process.stdin).toBeDefined()
      expect(process.kill).toBeDefined()
    })

    it('should execute command on Windows PowerShell', () => {
      terminal.shell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      manager.runCommand(terminal, 'ls -al')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', 'Get-ChildItem -Force'], expect.any(Object))
    })

    it('should execute command on Git Bash', () => {
      terminal.shell = 'C:\\Program Files\\Git\\bin\\bash.exe'
      manager.runCommand(terminal, 'ls -al')

      expect(spawn).toHaveBeenCalledWith(
        'C:\\Program Files\\Git\\bin\\bash.exe',
        ['-c', 'ls -al'],
        expect.objectContaining({
          env: expect.objectContaining({
            MSYSTEM: 'MINGW64'
          })
        })
      )
    })

    it('should emit line events on stdout', () => {
      return new Promise<void>((resolve) => {
        const process = manager.runCommand(terminal, 'echo test')
        const chunks: string[] = []

        process.on('line', (chunk: string) => {
          chunks.push(chunk)
          if (chunks.length === 1) {
            expect(chunks[0]).toBe('test output')
            resolve()
          }
        })

        mockStdout.emit('data', Buffer.from('test output'))
      })
    })

    it('should emit line events on stderr', () => {
      return new Promise<void>((resolve) => {
        const process = manager.runCommand(terminal, 'invalid-command')
        const chunks: string[] = []

        process.on('line', (chunk: string) => {
          chunks.push(chunk)
          if (chunks.length === 1) {
            expect(chunks[0]).toBe('error output')
            resolve()
          }
        })

        mockStderr.emit('data', Buffer.from('error output'))
      })
    })

    it('should emit completed event on process close', () => {
      return new Promise<void>((resolve) => {
        const process = manager.runCommand(terminal, 'test-command')
        let output = ''

        process.on('line', (chunk: string) => {
          output += chunk
        })

        process.on('completed', ({ code, output: completedOutput }) => {
          expect(code).toBe(0)
          expect(completedOutput).toBe(output)
          resolve()
        })

        mockStdout.emit('data', Buffer.from('test output'))
        mockChildProcess.on.mock.calls.find((call: any[]) => call[0] === 'close')?.[1](0)
      })
    })

    it('should emit error event on process error', () => {
      return new Promise<void>((resolve) => {
        const process = manager.runCommand(terminal, 'test-command')
        const testError = new Error('Process error')

        process.on('error', (error: Error) => {
          expect(error).toBe(testError)
          resolve()
        })

        mockChildProcess.on.mock.calls.find((call: any[]) => call[0] === 'error')?.[1](testError)
      })
    })
  })

  describe('executeCommand', () => {
    it('should execute command and return success result', async () => {
      const testStdout = new EventEmitter()
      const testStderr = new EventEmitter()
      let closeCallback: ((code: number | null) => void) | undefined

      const testChildProcess = {
        stdout: testStdout,
        stderr: testStderr,
        stdin: { write: vi.fn() },
        kill: vi.fn(),
        on: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'close') {
            closeCallback = callback as (code: number | null) => void
          }
        })
      }

      ;(spawn as any).mockReturnValue(testChildProcess)

      const resultPromise = manager.executeCommand('echo test')

      // Emit data after a short delay to ensure listeners are set up
      setTimeout(() => {
        testStdout.emit('data', Buffer.from('command output'))
        // Trigger close event after data is emitted
        setTimeout(() => {
          if (closeCallback) {
            closeCallback(0)
          }
        }, 10)
      }, 10)

      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(result.output).toBe('command output')
      expect(result.error).toBeUndefined()
    })

    it('should return error result on command failure', async () => {
      const testStdout = new EventEmitter()
      const testStderr = new EventEmitter()
      let closeCallback: ((code: number | null) => void) | undefined

      const testChildProcess = {
        stdout: testStdout,
        stderr: testStderr,
        stdin: { write: vi.fn() },
        kill: vi.fn(),
        on: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'close') {
            closeCallback = callback as (code: number | null) => void
          }
        })
      }

      ;(spawn as any).mockReturnValue(testChildProcess)

      // Emit error data first
      testStderr.emit('data', Buffer.from('error message'))

      const resultPromise = manager.executeCommand('invalid-command')

      // Trigger close event with error code after a short delay
      setTimeout(() => {
        if (closeCallback) {
          closeCallback(1)
        }
      }, 10)

      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error).toContain('exit code: 1')
    })

    it('should handle timeout', async () => {
      mockChildProcess.on.mockImplementation(() => {
        // Don't call completed, let it timeout
      })

      const result = await manager.executeCommand('sleep 10', undefined, 100)

      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')
    })

    it('should handle process error', async () => {
      const testError = new Error('Spawn error')
      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(testError), 10)
        }
      })

      const result = await manager.executeCommand('test-command')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Spawn error')
    })
  })

  describe('closeTerminal', () => {
    it('should close terminal and return true', async () => {
      const terminal = await manager.createTerminal()
      const result = manager.closeTerminal(terminal.id)

      expect(result).toBe(true)
    })

    it('should return false for non-existent terminal', () => {
      const result = manager.closeTerminal(999)
      expect(result).toBe(false)
    })

    it('should kill process if terminal has process', async () => {
      const terminal = await manager.createTerminal()
      const mockProcess = { kill: vi.fn() } as any
      terminal.process = mockProcess

      manager.closeTerminal(terminal.id)

      expect(mockProcess.kill).toHaveBeenCalled()
    })
  })

  describe('getCurrentWorkingDirectory', () => {
    it('should return current directory for Windows CMD', async () => {
      ;(os.platform as any).mockReturnValue('win32')
      const mockExecuteCommand = vi.spyOn(manager as any, 'executeCommand')
      mockExecuteCommand.mockResolvedValue({
        success: true,
        output: 'C:\\Users\\test'
      })

      // Mock getDefaultShell to return cmd.exe
      vi.spyOn(manager as any, 'getDefaultShell').mockReturnValue('C:\\Windows\\System32\\cmd.exe')

      const cwd = await manager.getCurrentWorkingDirectory()

      expect(mockExecuteCommand).toHaveBeenCalledWith('cd')
      expect(cwd).toBe('C:\\Users\\test')
    })

    it('should return current directory for Windows PowerShell', async () => {
      ;(os.platform as any).mockReturnValue('win32')
      const mockExecuteCommand = vi.spyOn(manager as any, 'executeCommand')
      mockExecuteCommand.mockResolvedValue({
        success: true,
        output: '"C:\\Users\\test"'
      })

      vi.spyOn(manager as any, 'getDefaultShell').mockReturnValue('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')

      const cwd = await manager.getCurrentWorkingDirectory()

      expect(mockExecuteCommand).toHaveBeenCalledWith('$PWD')
      expect(cwd).toBe('C:\\Users\\test')
    })

    it('should return current directory for Git Bash', async () => {
      ;(os.platform as any).mockReturnValue('win32')
      const mockExecuteCommand = vi.spyOn(manager as any, 'executeCommand')
      mockExecuteCommand.mockResolvedValue({
        success: true,
        output: '/c/Users/test'
      })

      vi.spyOn(manager as any, 'getDefaultShell').mockReturnValue('C:\\Program Files\\Git\\bin\\bash.exe')

      const cwd = await manager.getCurrentWorkingDirectory()

      expect(mockExecuteCommand).toHaveBeenCalledWith('pwd')
      expect(cwd).toBe('/c/Users/test')
    })

    it('should return home directory on failure', async () => {
      const mockExecuteCommand = vi.spyOn(manager as any, 'executeCommand')
      mockExecuteCommand.mockResolvedValue({
        success: false
      })

      const cwd = await manager.getCurrentWorkingDirectory()

      expect(cwd).toBe('/home/test')
    })
  })

  describe('getSystemInfo', () => {
    it('should return system information', async () => {
      const mockExecuteCommand = vi.spyOn(manager as any, 'executeCommand')
      mockExecuteCommand.mockResolvedValue({
        success: true,
        output: 'Linux test-host 5.10.0'
      })

      const info = await manager.getSystemInfo()

      expect(info.osVersion).toBeDefined()
      expect(info.defaultShell).toBeDefined()
      expect(info.homeDir).toBe('/home/test')
      expect(info.hostName).toBe('test-host')
      expect(info.userName).toBe('testuser')
      expect('sudoCheck' in info).toBe(false)
    })

    it('should get detailed OS version on Unix', async () => {
      ;(os.platform as any).mockReturnValue('linux')
      const mockExecuteCommand = vi.spyOn(manager as any, 'executeCommand')
      mockExecuteCommand.mockResolvedValue({
        success: true,
        output: 'Linux test-host 5.10.0'
      })

      const info = await manager.getSystemInfo()

      expect(info.osVersion).toBe('Linux test-host 5.10.0')
    })
  })

  describe('Command translation for PowerShell', () => {
    it('should translate ls -al to Get-ChildItem -Force', () => {
      const terminal: LocalTerminalInfo = {
        id: 1,
        sessionId: 'test',
        shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        platform: 'win32',
        isAlive: true
      }

      manager.runCommand(terminal, 'ls -al')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', 'Get-ChildItem -Force'], expect.any(Object))
    })

    it('should translate ls -la to Get-ChildItem -Force', () => {
      const terminal: LocalTerminalInfo = {
        id: 1,
        sessionId: 'test',
        shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        platform: 'win32',
        isAlive: true
      }

      manager.runCommand(terminal, 'ls -la')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', 'Get-ChildItem -Force'], expect.any(Object))
    })

    it('should translate ls -a to Get-ChildItem -Force', () => {
      const terminal: LocalTerminalInfo = {
        id: 1,
        sessionId: 'test',
        shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        platform: 'win32',
        isAlive: true
      }

      manager.runCommand(terminal, 'ls -a')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', 'Get-ChildItem -Force'], expect.any(Object))
    })

    it('should translate ls -l to Get-ChildItem', () => {
      const terminal: LocalTerminalInfo = {
        id: 1,
        sessionId: 'test',
        shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        platform: 'win32',
        isAlive: true
      }

      manager.runCommand(terminal, 'ls -l')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', 'Get-ChildItem'], expect.any(Object))
    })

    it('should translate cat to Get-Content', () => {
      const terminal: LocalTerminalInfo = {
        id: 1,
        sessionId: 'test',
        shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        platform: 'win32',
        isAlive: true
      }

      manager.runCommand(terminal, 'cat file.txt')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', 'Get-Content file.txt'], expect.any(Object))
    })

    it('should translate pwd to $PWD', () => {
      const terminal: LocalTerminalInfo = {
        id: 1,
        sessionId: 'test',
        shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        platform: 'win32',
        isAlive: true
      }

      manager.runCommand(terminal, 'pwd')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', '$PWD'], expect.any(Object))
    })

    it('should not translate non-Unix commands', () => {
      const terminal: LocalTerminalInfo = {
        id: 1,
        sessionId: 'test',
        shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        platform: 'win32',
        isAlive: true
      }

      manager.runCommand(terminal, 'Get-Process')

      expect(spawn).toHaveBeenCalledWith(expect.any(String), ['-Command', 'Get-Process'], expect.any(Object))
    })
  })
})
