import { BrowserWindow } from 'electron'
import type { ChatermDatabaseService } from './storage/database'

// Title bar theme configuration
const TITLE_BAR_THEME = {
  dark: { color: '#141414', symbolColor: '#ffffff', height: 27 },
  light: { color: '#ffffff', symbolColor: '#141414', height: 27 }
} as const

/**
 * Get actual theme based on system preference for auto mode
 * @param theme - Theme setting ('light', 'dark', or 'auto')
 * @returns Actual theme to apply ('light' or 'dark')
 */
export function getActualTheme(theme: string): 'dark' | 'light' {
  if (theme === 'auto') {
    if (process.platform === 'win32') {
      const { nativeTheme } = require('electron')
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    }
    return 'light'
  }
  return theme as 'dark' | 'light'
}

/**
 * Apply theme to main window title bar
 * @param window - BrowserWindow instance
 * @param theme - Theme setting to apply
 */
export function applyThemeToTitleBar(window: BrowserWindow, theme: string): void {
  if (!window || window.isDestroyed() || process.platform === 'darwin') {
    return
  }
  const actualTheme = getActualTheme(theme)
  window.setTitleBarOverlay(TITLE_BAR_THEME[actualTheme])
}

/**
 * Load user theme configuration from database
 * @param dbService - ChatermDatabaseService instance
 * @returns User's theme setting or null if not found
 */
export async function loadUserTheme(dbService: ChatermDatabaseService): Promise<string | null> {
  try {
    const { safeParse } = await import('./storage/db/json-serializer')
    const configRow = dbService.getKeyValue('userConfig')

    if (!configRow?.value) {
      return null
    }

    const userConfig = await safeParse(configRow.value)
    return userConfig?.theme ?? null
  } catch (error) {
    console.error('Failed to read user theme:', error)
    return null
  }
}
