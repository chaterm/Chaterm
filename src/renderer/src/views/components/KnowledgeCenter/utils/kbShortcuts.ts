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

function getSelectionContainer(node: Node | null): HTMLElement | null {
  if (!node) return null
  if (node instanceof HTMLElement) return node
  return node.parentElement
}

/**
 * Check whether current selected text belongs to markdown preview area.
 * When true, global file shortcuts should not intercept native copy behavior.
 */
export function hasPreviewTextSelection(previewSelector = '.kb-preview'): boolean {
  const selection = window.getSelection?.()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false
  if (!selection.toString().trim()) return false

  const anchorContainer = getSelectionContainer(selection.anchorNode)
  const focusContainer = getSelectionContainer(selection.focusNode)

  return !!anchorContainer?.closest(previewSelector) || !!focusContainer?.closest(previewSelector)
}
