// src/renderer/src/themes/applyTheme.ts
import type { ThemePreset } from '../../../shared/themes/types'
import { hexToRgb } from '../../../shared/themes/colorUtils'

// Only the large-surface background tokens become semi-transparent under
// has-custom-bg. Text/border/scrollbar/modal/dropdown tokens stay fully
// opaque so content remains readable over the image.
const TRANSLUCENT_BG_KEYS = [
  '--bg-color',
  '--bg-color-secondary',
  '--bg-color-tertiary',
  '--bg-color-quaternary',
  '--bg-color-quinary',
  '--command-output-bg'
] as const

function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function toTranslucent(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, var(--custom-opacity, 0.8))`
}

export function isCustomBgActive(): boolean {
  return typeof document !== 'undefined' && document.body?.classList.contains('has-custom-bg') === true
}

/**
 * Apply a resolved theme preset to the document.
 *
 * Responsibilities:
 * - Keep the legacy `theme-dark` / `theme-light` class on <html> for existing
 *   less variable branches and transparent-background logic.
 * - Set `data-theme-id` on <html> so future CSS can opt into per-theme tweaks.
 * - Write each uiTokens entry as a CSS custom property on <html>.
 * - When `hasCustomBg` is true, rewrite large-surface backgrounds as
 *   rgba(..., var(--custom-opacity, 0.8)) so the background image shows through
 *   while the theme's identity (its color) is preserved. We also mirror the
 *   variables onto <body> so they override the `body.has-custom-bg.theme-*`
 *   selectors that previously hard-coded two fixed palettes.
 */
export function applyThemeToDocument(preset: ThemePreset, hasCustomBg: boolean = isCustomBgActive()): void {
  const root = document.documentElement
  root.className = `theme-${preset.appearance}`
  root.dataset.themeId = preset.id

  const translucentSet = new Set<string>(TRANSLUCENT_BG_KEYS)

  // Clear any previous body-level overrides so switching away from custom-bg
  // does not leave stale translucent values behind.
  const body = document.body
  if (body) {
    for (const key of TRANSLUCENT_BG_KEYS) {
      body.style.removeProperty(key)
    }
  }

  for (const [cssVar, value] of Object.entries(preset.uiTokens)) {
    const shouldTranslucent = hasCustomBg && translucentSet.has(cssVar) && isHex(value)
    const finalValue = shouldTranslucent ? toTranslucent(value) : value
    root.style.setProperty(cssVar, finalValue)
    // Mirror the translucent ones onto <body> too — the body.has-custom-bg
    // selector in theme.less lives on <body>, so body-level inline styles are
    // required to win when that branch is active.
    if (shouldTranslucent && body) {
      body.style.setProperty(cssVar, finalValue)
    }
  }
}
