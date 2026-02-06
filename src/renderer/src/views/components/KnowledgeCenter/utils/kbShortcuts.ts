/**
 * Keyboard shortcuts utility for Knowledge Center
 * Provides platform detection and shortcut key handling
 */

type ShortcutAction = 'copy' | 'cut' | 'paste'

// Key mappings for each action
const ACTION_KEYS: Record<ShortcutAction, string> = {
  copy: 'c',
  cut: 'x',
  paste: 'v'
}

/**
 * Check if current platform is macOS
 */
export function isMacPlatform(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

/**
 * Get the modifier key symbol for display in menus
 * Returns Command symbol for macOS, Ctrl+ for Windows/Linux
 */
export function getModifierSymbol(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl+'
}

/**
 * Check if keyboard event matches a specific shortcut action
 * Uses metaKey (Cmd) on macOS, ctrlKey on Windows/Linux
 */
export function isShortcutEvent(event: KeyboardEvent, action: ShortcutAction): boolean {
  const expectedKey = ACTION_KEYS[action]
  if (!expectedKey) return false

  const isMac = isMacPlatform()
  const hasModifier = isMac ? event.metaKey : event.ctrlKey

  if (!hasModifier) return false

  return event.key.toLowerCase() === expectedKey
}
