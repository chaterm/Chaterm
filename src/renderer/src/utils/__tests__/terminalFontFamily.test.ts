import { describe, expect, it } from 'vitest'
import { DEFAULT_TERMINAL_FONT_STACK, resolveTerminalFontFamily } from '../terminalFontFamily'

const LEGACY_DEFAULT = 'Menlo, Monaco, "Courier New", Consolas, Courier, monospace'

describe('resolveTerminalFontFamily', () => {
  it('keeps the legacy default stack as the no-preference default', () => {
    expect(DEFAULT_TERMINAL_FONT_STACK).toBe(LEGACY_DEFAULT)
  })

  it('always ends in the generic monospace keyword', () => {
    const cases = ['Monaco', 'Menlo', 'My Local Mono', '', '   ', undefined, null, 42]
    for (const value of cases) {
      expect(resolveTerminalFontFamily(value).endsWith('monospace')).toBe(true)
    }
  })

  it('resolves the stored Menlo default to the legacy stack', () => {
    expect(resolveTerminalFontFamily('Menlo')).toBe(LEGACY_DEFAULT)
  })

  it('keeps a bare family first, then appends the fallback chain', () => {
    expect(resolveTerminalFontFamily('Monaco')).toBe('Monaco, Menlo, "Courier New", Consolas, Courier, monospace')
  })

  it('falls back to the default stack when the value is blank or not a string', () => {
    expect(resolveTerminalFontFamily('')).toBe(DEFAULT_TERMINAL_FONT_STACK)
    expect(resolveTerminalFontFamily('   ')).toBe(DEFAULT_TERMINAL_FONT_STACK)
    expect(resolveTerminalFontFamily(undefined)).toBe(DEFAULT_TERMINAL_FONT_STACK)
    expect(resolveTerminalFontFamily(null)).toBe(DEFAULT_TERMINAL_FONT_STACK)
  })

  it('quotes families that need it and leaves simple names bare', () => {
    expect(resolveTerminalFontFamily('Intel One Mono')).toBe('"Intel One Mono", Menlo, Monaco, "Courier New", Consolas, Courier, monospace')
    expect(resolveTerminalFontFamily('Monaco').startsWith('Monaco,')).toBe(true)
  })

  it('keeps a custom installed font first so the user choice wins', () => {
    expect(resolveTerminalFontFamily('My Local Mono').startsWith('"My Local Mono",')).toBe(true)
  })

  it('does not repeat the chosen family inside the fallback chain', () => {
    expect(resolveTerminalFontFamily('Consolas').match(/Consolas/g)).toHaveLength(1)
  })

  it('passes legacy comma-separated stacks through', () => {
    const legacy = 'Monaco, "Courier New", Consolas, Courier, monospace'
    expect(resolveTerminalFontFamily(legacy)).toBe(legacy)
  })

  it('appends monospace to a stack that lacks a generic family', () => {
    expect(resolveTerminalFontFamily('Monaco, Consolas')).toBe('Monaco, Consolas, monospace')
  })

  it('round-trips the legacy stored stacks unchanged', () => {
    const stacks = [
      LEGACY_DEFAULT,
      'Monaco, "Courier New", Consolas, Courier, monospace',
      '"MesloLGS NF", "MesloLGS NF", "Courier New", Courier, monospace',
      '"DejaVu Sans Mono", "Bitstream Vera Sans Mono", Monaco, "Courier New", Courier, monospace'
    ]
    for (const stack of stacks) {
      expect(resolveTerminalFontFamily(stack)).toBe(stack)
    }
  })

  it('falls back when a stack has no usable families', () => {
    expect(resolveTerminalFontFamily(',,,')).toBe(DEFAULT_TERMINAL_FONT_STACK)
  })

  describe('escaping', () => {
    // Every opening quote must reach a real closing quote, otherwise the rest
    // of the stack is swallowed into an unterminated string.
    const quotesBalanced = (css: string): boolean => {
      let i = 0
      while (i < css.length) {
        if (css[i] !== '"') {
          i++
          continue
        }
        i++
        let closed = false
        while (i < css.length) {
          if (css[i] === '\\') {
            i += 2
            continue
          }
          if (css[i] === '"') {
            i++
            closed = true
            break
          }
          i++
        }
        if (!closed) return false
      }
      return true
    }

    const hostile = [
      'My\\',
      'a\\"',
      'x\\\\',
      'Font", monospace; color: red; x: "y',
      'a", b',
      'evil", monospace} body{display:none',
      'a"b',
      'C:\\Windows\\Fonts\\my',
      '\\',
      'Fira\\Code'
    ]

    it('escapes backslashes so a trailing one cannot escape the closing quote', () => {
      expect(resolveTerminalFontFamily('My\\')).toBe('"My\\\\", Menlo, Monaco, "Courier New", Consolas, Courier, monospace')
    })

    it('keeps quotes balanced and the fallback chain intact for hostile names', () => {
      for (const name of hostile) {
        const css = resolveTerminalFontFamily(name)
        expect(quotesBalanced(css)).toBe(true)
        expect(css.endsWith('monospace')).toBe(true)
      }
    })

    it('never leaves CSS syntax characters outside a quoted family', () => {
      for (const name of hostile) {
        const outsideQuotes = resolveTerminalFontFamily(name).replace(/"(?:[^"\\]|\\.)*"/g, '')
        expect(outsideQuotes).not.toMatch(/[;{}]/)
      }
    })
  })
})
