import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

const remoteSshExecStreamMock = vi.fn()
const handleRemoteExecInputMock = vi.fn().mockReturnValue({ success: true })

vi.mock('../../../../ssh/agentHandle', () => ({
  remoteSshConnect: vi.fn(),
  remoteSshExecStream: (...args: unknown[]) => remoteSshExecStreamMock(...args),
  remoteSshDisconnect: vi.fn(),
  handleRemoteExecInput: (...args: unknown[]) => handleRemoteExecInputMock(...args)
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
  jumpserverShellStreams: new Map(),
  jumpserverMarkedCommands: new Map()
}))

vi.mock('../../../services/interaction-detector/ipc-handlers', () => ({
  registerCommandContext: vi.fn(),
  unregisterCommandContext: vi.fn(),
  broadcastInteractionNeeded: vi.fn(),
  broadcastInteractionSuppressed: vi.fn(),
  broadcastInteractionClosed: vi.fn(),
  broadcastTuiDetected: vi.fn(),
  broadcastAlternateScreenEntered: vi.fn(),
  generateCommandId: () => 'cmd-1'
}))

type DataCallback = (chunk: string) => void

describe('RemoteTerminalProcess TUI auto-cancel', () => {
  // New implementation requires:
  // 1. Alternate screen entry (detecting '\x1b[?1049h')
  // 2. Silence timeout (tuiCancelSilenceMs, default 6000ms)

  beforeEach(() => {
    vi.useFakeTimers()
    remoteSshExecStreamMock.mockReset()
    handleRemoteExecInputMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends Ctrl+C after silence period for blacklisted TUI commands', async () => {
    let onDataCallback: DataCallback | undefined
    let resolvePromise: (() => void) | undefined

    remoteSshExecStreamMock.mockImplementation(async (_sessionId: string, _command: string, onData: DataCallback) => {
      onDataCallback = onData
      return new Promise<{ success: boolean }>((resolve) => {
        resolvePromise = () => resolve({ success: true })
      })
    })

    const { RemoteTerminalProcess } = await import('../index')
    const process = new RemoteTerminalProcess()

    // Use reduced timeouts for testing
    process.enableInteractionDetection('task-1', 'top', {
      tuiCancelSilenceMs: 500 // Reduced for test
    })
    const runPromise = process.run('session-1', 'top')

    await vi.advanceTimersByTimeAsync(100)

    // Simulate alternate screen entry
    onDataCallback!('\x1b[?1049h')

    // Before silence timeout
    await vi.advanceTimersByTimeAsync(400)
    expect(handleRemoteExecInputMock).toHaveBeenCalledTimes(0)

    // After silence timeout (500ms) + a bit more
    await vi.advanceTimersByTimeAsync(200)
    expect(handleRemoteExecInputMock).toHaveBeenCalledWith('session-1', '\x03')

    // Resolve the promise to end the test
    resolvePromise!()

    await runPromise.catch(() => {})
  }, 10000) // Increase test timeout

  it('auto-cancels after hard timeout even when output continues', async () => {
    let onDataCallback: DataCallback | undefined

    remoteSshExecStreamMock.mockImplementation(async (_sessionId: string, _command: string, onData: DataCallback) => {
      onDataCallback = onData
      return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 5000)
      })
    })

    const { RemoteTerminalProcess } = await import('../index')
    const process = new RemoteTerminalProcess()

    process.enableInteractionDetection('task-2', 'htop', {
      tuiCancelSilenceMs: 5000,
      tuiHardTimeoutMs: 500
    })
    const runPromise = process.run('session-2', 'htop')

    await vi.advanceTimersByTimeAsync(100)

    // Simulate alternate screen entry
    onDataCallback!('\x1b[?1049h')

    // Advance a bit and then emit output (should not affect hard timeout)
    await vi.advanceTimersByTimeAsync(200)
    expect(handleRemoteExecInputMock).toHaveBeenCalledTimes(0)

    // Send new output to reset timer
    onDataCallback!('CPU: 50 percent\n')

    // Advance past hard timeout since command start
    await vi.advanceTimersByTimeAsync(350)
    expect(handleRemoteExecInputMock).toHaveBeenCalledWith('session-2', '\x03')

    // Cleanup
    await vi.advanceTimersByTimeAsync(10000)
    await runPromise.catch(() => {})
  })

  it('does not auto-cancel for non-blacklist commands', async () => {
    let onDataCallback: DataCallback | undefined

    remoteSshExecStreamMock.mockImplementation(async (_sessionId: string, _command: string, onData: DataCallback) => {
      onDataCallback = onData
      return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 3000)
      })
    })

    const { RemoteTerminalProcess } = await import('../index')
    const process = new RemoteTerminalProcess()

    // Use a non-blacklist command
    process.enableInteractionDetection('task-3', 'some-custom-command', {
      tuiCancelSilenceMs: 500
    })
    const runPromise = process.run('session-3', 'some-custom-command')

    await vi.advanceTimersByTimeAsync(100)

    // Simulate alternate screen entry
    onDataCallback!('\x1b[?1049h')

    // Wait well past silence period
    await vi.advanceTimersByTimeAsync(2000)

    // Should NOT have sent Ctrl+C for non-blacklist command
    expect(handleRemoteExecInputMock).not.toHaveBeenCalledWith('session-3', '\x03')

    // Cleanup
    await vi.advanceTimersByTimeAsync(10000)
    await runPromise.catch(() => {})
  })

  it('does not auto-cancel commands with non-interactive arguments', async () => {
    let onDataCallback: DataCallback | undefined

    remoteSshExecStreamMock.mockImplementation(async (_sessionId: string, _command: string, onData: DataCallback) => {
      onDataCallback = onData
      return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 3000)
      })
    })

    const { RemoteTerminalProcess } = await import('../index')
    const process = new RemoteTerminalProcess()

    // top -n 1 has non-interactive argument, should not be treated as TUI
    process.enableInteractionDetection('task-4', 'top -n 1', {
      tuiCancelSilenceMs: 500
    })
    const runPromise = process.run('session-4', 'top -n 1')

    await vi.advanceTimersByTimeAsync(100)

    // Simulate alternate screen entry
    onDataCallback!('\x1b[?1049h')

    // Wait well past silence period
    await vi.advanceTimersByTimeAsync(2000)

    // Should NOT have sent Ctrl+C for command with non-interactive args
    expect(handleRemoteExecInputMock).not.toHaveBeenCalledWith('session-4', '\x03')

    // Cleanup
    await vi.advanceTimersByTimeAsync(10000)
    await runPromise.catch(() => {})
  })
})
