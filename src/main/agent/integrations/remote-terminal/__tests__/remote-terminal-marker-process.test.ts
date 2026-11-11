import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { spawn, spawnSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { createRequire, Module } from 'module'

const require = createRequire(import.meta.url)
const electronPath = require.resolve('electron')
const mockElectronModule = new Module(electronPath)
mockElectronModule.filename = electronPath
mockElectronModule.loaded = true
mockElectronModule.exports = {
  app: { getAppPath: () => process.cwd() },
  webContents: { getFocusedWebContents: vi.fn() }
}
require.cache[electronPath] = mockElectronModule

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  webContents: { getFocusedWebContents: vi.fn() }
}))

const mocks = vi.hoisted(() => ({
  shellStreams: new Map<string, unknown>(),
  jumpServerDisconnect: vi.fn(),
  broadcastCommandActivity: vi.fn()
}))

vi.mock('../../../../ssh/agentHandle', () => ({
  remoteSshConnect: vi.fn(),
  remoteSshExecStream: vi.fn(),
  remoteSshDisconnect: vi.fn(),
  handleRemoteExecInput: vi.fn(),
  isRemoteConnectionAlive: vi.fn(),
  isWakeupSession: vi.fn().mockReturnValue(false),
  openWakeupShell: vi.fn()
}))

vi.mock('../../../../ssh/capabilityRegistry', () => ({
  capabilityRegistry: { getBastion: vi.fn() },
  BastionErrorCode: {
    CAPABILITY_NOT_FOUND: 'BASTION_CAPABILITY_NOT_FOUND',
    AGENT_EXEC_UNAVAILABLE: 'BASTION_AGENT_EXEC_UNAVAILABLE'
  }
}))

vi.mock('../jumpserverHandle', () => ({
  handleJumpServerConnection: vi.fn(),
  jumpserverShellStreams: mocks.shellStreams,
  jumpserverMarkedCommands: new Map(),
  jumpServerDisconnect: mocks.jumpServerDisconnect
}))

vi.mock('../../../services/interaction-detector/ipc-handlers', () => ({
  registerCommandContext: vi.fn(),
  unregisterCommandContext: vi.fn(),
  broadcastInteractionNeeded: vi.fn(),
  broadcastInteractionSuppressed: vi.fn(),
  broadcastInteractionClosed: vi.fn(),
  broadcastTuiDetected: vi.fn(),
  broadcastAlternateScreenEntered: vi.fn(),
  broadcastCommandActivity: mocks.broadcastCommandActivity,
  generateCommandId: () => 'cmd-1'
}))

type FakeShellStream = EventEmitter & {
  write: ReturnType<typeof vi.fn>
  writable: boolean
  emitData: (data: string) => void
}

const createShellStream = (): FakeShellStream => {
  const stream = new EventEmitter() as FakeShellStream
  stream.write = vi.fn().mockReturnValue(true)
  stream.writable = true
  stream.emitData = (data: string) => stream.emit('data', Buffer.from(data, 'utf8'))
  mocks.shellStreams.set('js-1', stream)
  return stream
}

const markersOf = (stream: FakeShellStream) => {
  const written = stream.write.mock.calls[0][0] as string
  return {
    start: written.match(/===CHATERM_START_[^=]+===/)![0],
    end: written.match(/===CHATERM_END_[^=]+===/)![0]
  }
}

const loadModule = () => import('../index')

describe('RemoteTerminalProcess marker-based execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.shellStreams.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the command in a subshell and traps Ctrl+C in the wrapper', async () => {
    const { RemoteTerminalProcess } = await loadModule()
    const stream = createShellStream()
    const proc = new RemoteTerminalProcess()

    const done = proc.run('js-1', 'exit 1', undefined, 'jumpserver')

    expect(stream.write.mock.calls[0][0]).toMatch(
      /^ bash -l -c 'trap ":" INT; echo "===CHATERM_START_[^"]+==="; \( trap - INT; eval "\$\(echo [A-Za-z0-9+/=]+ \| base64 -d\)" \); EXIT_CODE=\$\?; echo "===CHATERM_END_[^"]+===:\$EXIT_CODE"'\r$/
    )

    const { start, end } = markersOf(stream)
    stream.emitData(`${start}\r\n${end}:1\r\n`)
    await done
  })

  it('appends a non-zero exit code to the output before completing', async () => {
    const { RemoteTerminalProcess } = await loadModule()
    const stream = createShellStream()
    const proc = new RemoteTerminalProcess()
    const events: string[] = []
    proc.on('line', (line) => events.push(`line:${line}`))
    proc.on('exitCode', (code) => events.push(`exitCode:${code}`))
    proc.once('completed', () => events.push('completed'))

    const done = proc.run('js-1', 'false', undefined, 'jumpserver')
    const { start, end } = markersOf(stream)
    stream.emitData(`${start}\r\noops\r\n${end}:2\r\n`)
    await done

    expect(events).toEqual(['line:oops', 'line:[Exit Code: 2]', 'exitCode:2', 'completed'])
  })

  it('does not add an exit code line for a successful command', async () => {
    const { RemoteTerminalProcess } = await loadModule()
    const stream = createShellStream()
    const proc = new RemoteTerminalProcess()
    const lines: string[] = []
    proc.on('line', (line) => lines.push(line))

    const done = proc.run('js-1', 'true', undefined, 'jumpserver')
    const { start, end } = markersOf(stream)
    stream.emitData(`${start}\r\nok\r\n${end}:0\r\n`)
    await done

    expect(lines).toEqual(['ok'])
  })

  it('broadcasts the running status on start, throttled on output, and on end', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const { RemoteTerminalProcess } = await loadModule()
    const stream = createShellStream()
    const proc = new RemoteTerminalProcess()
    const status = { commandId: 'cmd-1', taskId: 'task-1', startedAt: 10_000 }

    proc.enableInteractionDetection('task-1', 'sleep 5')
    expect(mocks.broadcastCommandActivity).toHaveBeenLastCalledWith({ ...status, lastOutputAt: null, running: true })

    const done = proc.run('js-1', 'sleep 5', undefined, 'jumpserver')
    const { start, end } = markersOf(stream)
    stream.emitData(`${start}\r\n`)

    // Output right after the start broadcast is throttled, then sent on the trailing edge
    vi.setSystemTime(10_300)
    stream.emitData('first\r\n')
    vi.setSystemTime(10_600)
    stream.emitData('more\r\n')
    expect(mocks.broadcastCommandActivity).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(700)
    expect(mocks.broadcastCommandActivity).toHaveBeenCalledTimes(2)
    expect(mocks.broadcastCommandActivity).toHaveBeenLastCalledWith({ ...status, lastOutputAt: 10_600, running: true })

    // Output after the interval is broadcast immediately
    vi.setSystemTime(12_500)
    stream.emitData('second\r\n')
    expect(mocks.broadcastCommandActivity).toHaveBeenCalledTimes(3)
    expect(mocks.broadcastCommandActivity).toHaveBeenLastCalledWith({ ...status, lastOutputAt: 12_500, running: true })

    // A pending trailing broadcast is dropped once the command ends
    vi.setSystemTime(12_800)
    stream.emitData('last\r\n')
    stream.emitData(`${end}:0\r\n`)
    await done
    await vi.advanceTimersByTimeAsync(2000)

    expect(mocks.broadcastCommandActivity).toHaveBeenCalledTimes(4)
    expect(mocks.broadcastCommandActivity).toHaveBeenLastCalledWith({ ...status, lastOutputAt: 12_800, running: false })
  })

  it('stops tracking the marker run when force-terminated', async () => {
    const { RemoteTerminalProcess } = await loadModule()
    const stream = createShellStream()
    const proc = new RemoteTerminalProcess()
    const onContinue = vi.fn()
    const lines: string[] = []
    proc.on('continue', onContinue)
    proc.on('line', (line) => lines.push(line))

    const done = proc.run('js-1', 'sleep 100', undefined, 'jumpserver')
    const { start, end } = markersOf(stream)
    stream.emitData(`${start}\r\n`)

    proc.forceTerminate()
    await done
    stream.emitData(`late\r\n${end}:130\r\n`)

    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(lines).toEqual([])
    expect(stream.listenerCount('data')).toBe(0)
  })
})

describe('RemoteTerminalManager interrupt failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.shellStreams.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops the session when a timed-out command ignores Ctrl+C', async () => {
    vi.useFakeTimers()
    const { RemoteTerminalManager } = await loadModule()
    const stream = createShellStream()
    const manager = new RemoteTerminalManager(true)
    const terminalInfo = {
      id: 7,
      sessionId: 'js-1',
      busy: false,
      lastCommand: '',
      connectionInfo: { sshType: 'jumpserver', needProxy: false },
      terminal: { show: () => {} }
    }
    ;(manager as any).terminals.set(terminalInfo.id, terminalInfo)

    const done = manager.runCommand(terminalInfo, 'cat /dev/zero > /dev/null')
    stream.emitData(`${markersOf(stream).start}\r\n`)

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(stream.write).toHaveBeenLastCalledWith('\x03')
    expect((manager as any).terminals.has(terminalInfo.id)).toBe(true)

    await vi.advanceTimersByTimeAsync(10_000)
    await done

    expect((manager as any).terminals.has(terminalInfo.id)).toBe(false)
    await vi.waitFor(() => expect(mocks.jumpServerDisconnect).toHaveBeenCalledWith('js-1'))
  })
})

describe.skipIf(process.platform === 'win32')('JumpServer wrapper in a real shell', () => {
  const shellEnv = () => ({ PATH: process.env.PATH, HOME: mkdtempSync(join(tmpdir(), 'chaterm-wrapper-home-')) })

  const build = async (command: string, cwd?: string) => {
    const { RemoteTerminalProcess } = await loadModule()
    return (new RemoteTerminalProcess() as any).buildJumpServerWrappedCommand(command, cwd) as {
      wrappedCommand: string
      startMarker: string
      endMarker: string
    }
  }

  it.each([
    ['exit', 'echo before; exit 3; echo after', 3],
    ['set -e', 'set -e; false; echo after', 1],
    ['exec', 'exec false; echo after', 1]
  ])('still reports the end marker after %s', async (_name, command, code) => {
    const { wrappedCommand, endMarker } = await build(command)
    const { stdout } = spawnSync('bash', ['-c', wrappedCommand], { encoding: 'utf8', env: shellEnv() })

    expect(stdout).toContain(`${endMarker}:${code}`)
    expect(stdout).not.toContain('after')
  })

  it('runs the command inside the working directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chaterm-wrapper-cwd-'))
    const { wrappedCommand, endMarker } = await build('pwd; exit 4', dir)
    const { stdout } = spawnSync('bash', ['-c', wrappedCommand], { encoding: 'utf8', env: shellEnv() })

    expect(stdout).toContain(basename(dir))
    expect(stdout).toContain(`${endMarker}:4`)
  })

  it('reports exit code 130 when the command is interrupted with Ctrl+C', async () => {
    const { wrappedCommand, startMarker, endMarker } = await build('sleep 30; echo after')
    const child = spawn('bash', ['-c', wrappedCommand], { detached: true, env: shellEnv() })
    let stdout = ''
    child.stdout.on('data', (data) => (stdout += data))
    const closed = new Promise((resolve) => child.on('close', resolve))

    await vi.waitFor(() => expect(stdout).toContain(startMarker), { timeout: 5000 })
    // Let the subshell reach sleep before interrupting the whole process group, as a terminal would
    await new Promise((resolve) => setTimeout(resolve, 300))
    process.kill(-child.pid!, 'SIGINT')
    await closed

    expect(stdout).toContain(`${endMarker}:130`)
    expect(stdout).not.toContain('after')
  })
})
