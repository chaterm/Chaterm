// src/shared/themes/__tests__/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolveEffectiveThemeId, resolveThemeAppearance, resolveThemePreset } from '../resolve'
import type { ThemeId } from '../types'

describe('resolveEffectiveThemeId', () => {
  it('maps auto to dark when system is dark', () => {
    expect(resolveEffectiveThemeId('auto', 'dark')).toBe('dark')
  })
  it('maps auto to light when system is light', () => {
    expect(resolveEffectiveThemeId('auto', 'light')).toBe('light')
  })
  it('returns themeId unchanged for any concrete theme', () => {
    expect(resolveEffectiveThemeId('kanagawa-wave', 'light')).toBe('kanagawa-wave')
    expect(resolveEffectiveThemeId('flexoki-dark', 'dark')).toBe('flexoki-dark')
  })
  it('falls back to dark when themeId is unknown', () => {
    expect(resolveEffectiveThemeId('not-a-theme' as ThemeId, 'light')).toBe('dark')
  })
})

describe('resolveThemeAppearance', () => {
  it('returns dark for dark-appearance presets', () => {
    expect(resolveThemeAppearance('kanagawa-dragon', 'light')).toBe('dark')
  })
  it('returns light for light-appearance presets', () => {
    expect(resolveThemeAppearance('kanagawa-lotus', 'dark')).toBe('light')
  })
  it('resolves auto via system theme', () => {
    expect(resolveThemeAppearance('auto', 'dark')).toBe('dark')
    expect(resolveThemeAppearance('auto', 'light')).toBe('light')
  })
})

describe('resolveThemePreset', () => {
  it('returns a preset with the expected id for auto+dark', () => {
    const preset = resolveThemePreset('auto', 'dark')
    expect(preset.id).toBe('dark')
  })
  it('returns the matching preset for a concrete theme', () => {
    const preset = resolveThemePreset('termius-dark', 'light')
    expect(preset.id).toBe('termius-dark')
    expect(preset.appearance).toBe('dark')
  })
  it('unknown id falls back to dark preset', () => {
    const preset = resolveThemePreset('garbage' as ThemeId, 'light')
    expect(preset.id).toBe('dark')
  })
})
