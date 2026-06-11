import { describe, expect, it } from 'vitest'
import { applyTerminalRuntimeConfig, diffTerminalRuntimeConfig, hasTerminalRuntimeConfig, pickTerminalRuntimeConfig } from '../terminalRuntimeConfig'

describe('terminalRuntimeConfig', () => {
  it('diffs only changed runtime terminal fields', () => {
    const changed = diffTerminalRuntimeConfig(
      {
        fontSize: 12,
        scrollBack: 1000,
        cursorStyle: 'block',
        terminalType: 'xterm-256color'
      },
      {
        fontSize: 14,
        scrollBack: 1000,
        cursorStyle: 'underline',
        terminalType: 'xterm-256color',
        rightMouseEvent: 'paste'
      }
    )

    expect(changed).toEqual({
      fontSize: 14,
      cursorStyle: 'underline',
      rightMouseEvent: 'paste'
    })
  })

  it('picks only runtime terminal fields from config payloads', () => {
    const picked = pickTerminalRuntimeConfig({
      theme: 'dark',
      fontFamily: 'Monaco',
      scrollBack: 5000,
      lineHeight: 1.6
    })

    expect(picked).toEqual({
      fontFamily: 'Monaco',
      scrollBack: 5000,
      lineHeight: 1.6
    })
  })

  it('applies xterm runtime options and reports whether a resize is needed', () => {
    const terminal = {
      options: {
        scrollback: 1000,
        fontSize: 12,
        fontFamily: 'Menlo',
        cursorStyle: 'block' as const,
        cursorBlink: true,
        lineHeight: 1
      }
    }

    const result = applyTerminalRuntimeConfig(terminal, {
      scrollBack: 8000,
      fontSize: 15,
      fontFamily: 'Monaco',
      cursorStyle: 'underline',
      cursorBlink: false,
      lineHeight: 1.4,
      rightMouseEvent: 'paste'
    })

    expect(result).toEqual({ requiresResize: true })
    expect(terminal.options).toEqual({
      scrollback: 8000,
      fontSize: 15,
      fontFamily: 'Monaco',
      cursorStyle: 'underline',
      cursorBlink: false,
      lineHeight: 1.4
    })
  })

  it('reports whether a payload contains runtime terminal config', () => {
    expect(hasTerminalRuntimeConfig({})).toBe(false)
    expect(hasTerminalRuntimeConfig({ scrollBack: 4000 })).toBe(true)
  })
})
