import { describe, expect, it, vi } from 'vitest'
import { LocalEchoController } from '../localEcho'

const interactiveContext = {
  isConnected: true,
  terminalMode: 'none' as const
}

describe('LocalEchoController', () => {
  it('predicts printable input and suppresses matching remote echo', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    expect(localEcho.predict('a', interactiveContext)).toBe(true)
    expect(write).toHaveBeenCalledWith('a')
    expect(localEcho.reconcile('a')).toBe('')
  })

  it('preserves non-echo output after confirming predicted characters', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    localEcho.predict('l', interactiveContext)
    localEcho.predict('s', interactiveContext)

    expect(localEcho.reconcile('ls\r\nfile.txt\r\n')).toBe('\r\nfile.txt\r\n')
  })

  it('handles remote echo split across chunks', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    localEcho.predict('a', interactiveContext)
    localEcho.predict('b', interactiveContext)

    expect(localEcho.reconcile('a')).toBe('')
    expect(localEcho.reconcile('boutput')).toBe('output')
  })

  it('does not swallow mismatched remote output', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    localEcho.predict('a', interactiveContext)

    expect(localEcho.reconcile('server-output')).toBe('server-output')
  })

  it('skips prediction for password prompts', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    expect(
      localEcho.predict('s', {
        ...interactiveContext,
        currentLine: 'Password:'
      })
    ).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  it('skips paste-sized input and alternate screen mode', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    expect(localEcho.predict('abcdef', interactiveContext)).toBe(false)
    expect(localEcho.predict('a', { isConnected: true, terminalMode: 'alternate' })).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  it('predicts backspace only for tracked single-width input', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    localEcho.predict('a', interactiveContext)
    expect(localEcho.reconcile('a')).toBe('')

    expect(localEcho.predict('\x7f', interactiveContext)).toBe(true)
    expect(write).toHaveBeenLastCalledWith('\b \b')
    expect(localEcho.reconcile('\b \b')).toBe('')
  })

  it('keeps wide-character backspace remote-driven', () => {
    const write = vi.fn()
    const localEcho = new LocalEchoController({ enabled: true })
    localEcho.setTerminal({ write })

    expect(localEcho.predict('你', interactiveContext)).toBe(true)
    expect(localEcho.reconcile('你')).toBe('')

    expect(localEcho.predict('\x7f', interactiveContext)).toBe(false)
  })
})
