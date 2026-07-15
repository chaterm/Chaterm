import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelConnectionOnUnmount, createConnectionCancellationGuard } from '../connectionCancellation'

describe('terminal connection cleanup', () => {
  const cancelKeyboardInteractive = vi.fn()
  const disconnect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    disconnect.mockResolvedValue({ status: 'success' })
  })

  it('cancels authentication and disconnects an in-flight connection', () => {
    const onDisconnectResult = vi.fn()
    cancelConnectionOnUnmount({
      api: { cancelKeyboardInteractive, disconnect },
      id: 'session-1',
      isConnected: false,
      isConnecting: true,
      onDisconnectResult
    })

    expect(disconnect).toHaveBeenCalledWith({ id: 'session-1' })
    return vi.waitFor(() => {
      expect(cancelKeyboardInteractive).toHaveBeenCalledWith('session-1')
      expect(onDisconnectResult).toHaveBeenCalledWith({ status: 'success' })
    })
  })

  it('waits for disconnect before cancelling keyboard-interactive authentication', async () => {
    let resolveDisconnect!: (result: { status: string }) => void
    disconnect.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDisconnect = resolve
        })
    )

    cancelConnectionOnUnmount({
      api: { cancelKeyboardInteractive, disconnect },
      id: 'session-1',
      isConnected: false,
      isConnecting: true
    })

    expect(disconnect).toHaveBeenCalledWith({ id: 'session-1' })
    expect(cancelKeyboardInteractive).not.toHaveBeenCalled()

    resolveDisconnect({ status: 'success' })
    await vi.waitFor(() => {
      expect(cancelKeyboardInteractive).toHaveBeenCalledWith('session-1')
    })
  })

  it('still cancels keyboard-interactive authentication when disconnect fails', async () => {
    disconnect.mockRejectedValue(new Error('disconnect failed'))

    cancelConnectionOnUnmount({
      api: { cancelKeyboardInteractive, disconnect },
      id: 'session-1',
      isConnected: false,
      isConnecting: true
    })

    await vi.waitFor(() => {
      expect(cancelKeyboardInteractive).toHaveBeenCalledWith('session-1')
    })
  })

  it('does nothing for a tab that never started connecting', () => {
    cancelConnectionOnUnmount({
      api: { cancelKeyboardInteractive, disconnect },
      id: 'session-1',
      isConnected: false,
      isConnecting: false
    })

    expect(cancelKeyboardInteractive).not.toHaveBeenCalled()
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('preserves an unmount cancellation across asynchronous connection setup', async () => {
    let finishLookup!: () => void
    const lookup = new Promise<void>((resolve) => {
      finishLookup = resolve
    })
    const connect = vi.fn()
    const guard = createConnectionCancellationGuard()

    const continueConnection = async () => {
      await lookup
      if (!guard.isCancelled()) {
        connect()
      }
    }

    const connection = continueConnection()
    guard.cancel()
    finishLookup()
    await connection

    expect(guard.isCancelled()).toBe(true)
    expect(connect).not.toHaveBeenCalled()
  })
})
