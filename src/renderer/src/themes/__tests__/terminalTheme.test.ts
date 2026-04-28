import { describe, it, expect } from 'vitest'
import { getResolvedTerminalTheme } from '../terminalTheme'

describe('getResolvedTerminalTheme', () => {
  it('returns preset background when no custom bg', () => {
    const theme = getResolvedTerminalTheme('kanagawa-wave', { hasCustomBg: false }, 'dark')
    expect(theme.background).toBe('#1F1F28')
  })
  it('returns transparent for dark preset with custom bg', () => {
    const theme = getResolvedTerminalTheme('kanagawa-wave', { hasCustomBg: true }, 'dark')
    expect(theme.background).toBe('transparent')
  })
  it('returns rgba half-transparent for light preset with custom bg', () => {
    const theme = getResolvedTerminalTheme('flexoki-light', { hasCustomBg: true }, 'light')
    expect(theme.background).toMatch(/^rgba\(/)
  })
  it('auto resolves by provided system theme', () => {
    const dark = getResolvedTerminalTheme('auto', { hasCustomBg: false }, 'dark')
    const light = getResolvedTerminalTheme('auto', { hasCustomBg: false }, 'light')
    expect(dark.background).not.toBe(light.background)
  })
})
