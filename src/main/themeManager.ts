import { BrowserWindow, nativeTheme } from 'electron'
import type { ChatermDatabaseService } from './storage/database'
import { resolveThemePreset } from '../shared/themes/resolve'
import type { ThemeId, Appearance } from '../shared/themes/types'
const logger = createLogger('theme')

function getSystemAppearance(): Appearance {
  if (process.platform === 'win32') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return 'light'
}

export function getActualTheme(theme: string): Appearance {
  const preset = resolveThemePreset(theme as ThemeId, getSystemAppearance())
  return preset.appearance
}

export function applyThemeToTitleBar(window: BrowserWindow, theme: string): void {
  if (!window || window.isDestroyed() || process.platform === 'darwin') {
    return
  }
  const preset = resolveThemePreset(theme as ThemeId, getSystemAppearance())
  window.setTitleBarOverlay(preset.titleBarOverlay)
}

export async function loadUserTheme(dbService: ChatermDatabaseService): Promise<string | null> {
  try {
    const { safeParse } = await import('./storage/db/json-serializer')
    const configRow = dbService.getKeyValue('userConfig')
    if (!configRow?.value) return null
    const userConfig = await safeParse(configRow.value)
    return userConfig?.theme ?? null
  } catch (error) {
    logger.error('Failed to read user theme', { error })
    return null
  }
}
