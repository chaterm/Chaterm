// src/shared/themes/resolve.ts
import { THEME_PRESETS } from './presets'
import type { Appearance, ThemeId, ThemePreset } from './types'

export function resolveEffectiveThemeId(themeId: ThemeId, system: Appearance): ThemeId {
  if (themeId === 'auto') return system
  if (themeId in THEME_PRESETS) return themeId
  // Unknown id: fall back to dark.
  return 'dark'
}

export function resolveThemeAppearance(themeId: ThemeId, system: Appearance): Appearance {
  const effective = resolveEffectiveThemeId(themeId, system)
  // `effective` is guaranteed to be a concrete, registered id here.
  return THEME_PRESETS[effective as keyof typeof THEME_PRESETS].appearance
}

export function resolveThemePreset(themeId: ThemeId, system: Appearance): ThemePreset {
  const effective = resolveEffectiveThemeId(themeId, system)
  return THEME_PRESETS[effective as keyof typeof THEME_PRESETS]
}
