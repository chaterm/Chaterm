import { describe, it, expect, beforeEach } from 'vitest'
import { applyThemeToDocument } from '../applyTheme'
import { THEME_PRESETS } from '../../../../shared/themes/presets'

describe('applyThemeToDocument', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme-id')
    document.documentElement.style.cssText = ''
    document.body.className = ''
    document.body.style.cssText = ''
  })

  it('sets appearance class and data-theme-id', () => {
    applyThemeToDocument(THEME_PRESETS['kanagawa-wave'])
    expect(document.documentElement.className).toBe('theme-dark')
    expect(document.documentElement.dataset.themeId).toBe('kanagawa-wave')
  })

  it('writes uiTokens as CSS variables', () => {
    applyThemeToDocument(THEME_PRESETS['flexoki-light'])
    expect(document.documentElement.style.getPropertyValue('--bg-color')).toBe('#f7efdf')
    expect(document.documentElement.style.getPropertyValue('--text-color')).toBe('#372e25')
  })

  it('rewrites large-surface backgrounds as rgba when hasCustomBg is true', () => {
    applyThemeToDocument(THEME_PRESETS['flexoki-light'], true)
    const bg = document.documentElement.style.getPropertyValue('--bg-color')
    expect(bg).toMatch(/^rgba\(\d+, \d+, \d+, var\(--custom-opacity, 0\.8\)\)$/)
    // text stays opaque so content remains readable over the background image
    expect(document.documentElement.style.getPropertyValue('--text-color')).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('mirrors translucent bg vars onto <body> so body.has-custom-bg selectors do not win', () => {
    applyThemeToDocument(THEME_PRESETS['kanagawa-wave'], true)
    const bodyBg = document.body.style.getPropertyValue('--bg-color')
    expect(bodyBg).toMatch(/^rgba\(\d+, \d+, \d+, var\(--custom-opacity, 0\.8\)\)$/)
    // text tokens are NOT mirrored onto body
    expect(document.body.style.getPropertyValue('--text-color')).toBe('')
  })

  it('clears previous body-level translucent overrides when hasCustomBg flips back to false', () => {
    applyThemeToDocument(THEME_PRESETS['kanagawa-wave'], true)
    expect(document.body.style.getPropertyValue('--bg-color')).not.toBe('')
    applyThemeToDocument(THEME_PRESETS['kanagawa-wave'], false)
    expect(document.body.style.getPropertyValue('--bg-color')).toBe('')
    // root value returns to the plain hex
    expect(document.documentElement.style.getPropertyValue('--bg-color')).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('reads has-custom-bg off body when hasCustomBg arg omitted', () => {
    document.body.classList.add('has-custom-bg')
    applyThemeToDocument(THEME_PRESETS['flexoki-light'])
    expect(document.documentElement.style.getPropertyValue('--bg-color')).toMatch(/^rgba\(/)
  })
})
