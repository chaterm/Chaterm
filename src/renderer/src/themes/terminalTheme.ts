// src/renderer/src/themes/terminalTheme.ts
import { resolveThemePreset } from '../../../shared/themes/resolve'
import type { Appearance, ThemeId } from '../../../shared/themes/types'
import { getSystemTheme } from '@/utils/themeUtils'

export interface BackgroundConfig {
  hasCustomBg: boolean
}

/**
 * Resolve the xterm.js theme object for the current user theme.
 *
 * Background handling:
 * - When a custom background image is active and appearance === 'dark',
 *   return 'transparent' so the terminal shows the image through.
 * - When custom bg + light appearance, keep a semi-transparent light surface
 *   (rgba of the preset bg) so foreground text stays readable.
 * - Otherwise use the preset background as-is.
 */
export function getResolvedTerminalTheme(userTheme: ThemeId, background?: BackgroundConfig, system?: Appearance) {
  const sys: Appearance = system ?? (getSystemTheme() as Appearance)
  const preset = resolveThemePreset(userTheme, sys)
  const theme = { ...preset.terminalTheme }

  if (background?.hasCustomBg) {
    if (preset.appearance === 'dark') {
      theme.background = 'transparent'
    } else {
      // Keep light readable on top of an image.
      theme.background = hexToRgba(preset.terminalTheme.background, 0.75)
    }
  }

  return theme
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const r = parseInt(m[1].slice(0, 2), 16)
  const g = parseInt(m[1].slice(2, 4), 16)
  const b = parseInt(m[1].slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
