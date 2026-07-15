import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelOtp, handleOtpRequest, resetOtpDialog } from '../mfaState'

describe('MFA cancellation', () => {
  const cancelKeyboardInteractive = vi.fn()
  const disconnect = vi.fn()
  const log = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    disconnect.mockResolvedValue({ status: 'success' })
    ;(window as any).api = {
      cancelKeyboardInteractive,
      disconnect,
      log
    }
    handleOtpRequest({ id: 'session-1', prompts: ['Verification code:'] })
    log.mockClear()
  })

  afterEach(() => {
    resetOtpDialog()
  })

  it('cancels authentication and records the disconnect lifecycle', async () => {
    cancelOtp('user')

    expect(disconnect).toHaveBeenCalledWith({ id: 'session-1' })
    expect(log).toHaveBeenCalledWith({
      level: 'info',
      process: 'renderer',
      module: 'mfa',
      message: 'MFA cancellation requested',
      meta: {
        event: 'ssh.mfa.cancel.requested',
        connectionId: 'session-1',
        reason: 'user'
      }
    })
    await vi.waitFor(() => {
      expect(cancelKeyboardInteractive).toHaveBeenCalledWith('session-1')
      expect(log).toHaveBeenCalledWith({
        level: 'info',
        process: 'renderer',
        module: 'mfa',
        message: 'MFA cancellation disconnect completed',
        meta: {
          event: 'ssh.mfa.cancel.disconnect.result',
          connectionId: 'session-1',
          reason: 'user',
          status: 'success'
        }
      })
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

    cancelOtp('user')

    expect(disconnect).toHaveBeenCalledWith({ id: 'session-1' })
    expect(cancelKeyboardInteractive).not.toHaveBeenCalled()

    resolveDisconnect({ status: 'success' })
    await vi.waitFor(() => {
      expect(cancelKeyboardInteractive).toHaveBeenCalledWith('session-1')
    })
  })

  it('still cancels keyboard-interactive authentication when disconnect fails', async () => {
    disconnect.mockRejectedValue(new Error('disconnect failed'))

    cancelOtp('user')

    await vi.waitFor(() => {
      expect(cancelKeyboardInteractive).toHaveBeenCalledWith('session-1')
    })
  })
})
