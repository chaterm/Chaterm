import { describe, expect, it } from 'vitest'
import { shouldAutoScrollAfterTerminalStateUpdate, shouldAutoScrollAfterTerminalWrite } from '../terminalScroll'

describe('terminal scroll behavior', () => {
  it('keeps following output when the viewport is already at the bottom', () => {
    const terminal = {
      buffer: {
        active: {
          baseY: 120,
          viewportY: 120
        }
      }
    }

    expect(shouldAutoScrollAfterTerminalWrite(terminal)).toBe(true)
  })

  it('does not force scroll to bottom when the user has scrolled into history', () => {
    const terminal = {
      buffer: {
        active: {
          baseY: 120,
          viewportY: 84
        }
      }
    }

    expect(shouldAutoScrollAfterTerminalWrite(terminal)).toBe(false)
  })

  it('preserves the existing auto-scroll behavior when the terminal buffer is unavailable', () => {
    expect(shouldAutoScrollAfterTerminalWrite(null)).toBe(true)
  })

  it('does not let terminal state updates override a user-scrolled viewport', () => {
    expect(
      shouldAutoScrollAfterTerminalStateUpdate({
        isUserCall: false,
        shouldAutoScrollAfterWrite: false
      })
    ).toBe(false)
  })

  it('does not auto-scroll terminal state updates caused by user calls', () => {
    expect(
      shouldAutoScrollAfterTerminalStateUpdate({
        isUserCall: true,
        shouldAutoScrollAfterWrite: true
      })
    ).toBe(false)
  })
})
