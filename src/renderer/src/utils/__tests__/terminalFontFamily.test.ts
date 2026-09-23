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
})
