import { describe, expect, it } from 'vitest'
import { shouldPreventReloadShortcut, shouldRequestFileEditorReplaceShortcut } from './windowShortcutGuards'

describe('window shortcut guards', () => {
  const baseInput = { type: 'keyDown', key: 'r', meta: false, control: true, alt: false, shift: false }

  it('blocks Ctrl+R reload in the file editor while still blocking reload elsewhere on Windows', () => {
    expect(shouldPreventReloadShortcut(baseInput, { platform: 'win32', isTerminalFocused: false, isFileEditorFocused: false })).toBe(true)
    expect(shouldPreventReloadShortcut(baseInput, { platform: 'win32', isTerminalFocused: false, isFileEditorFocused: true })).toBe(true)
  })

  it('keeps allowing Ctrl+R for focused terminals on Windows', () => {
    expect(shouldPreventReloadShortcut(baseInput, { platform: 'win32', isTerminalFocused: true, isFileEditorFocused: false })).toBe(false)
  })

  it('requests file editor replace only for the file editor shortcut', () => {
    expect(shouldRequestFileEditorReplaceShortcut(baseInput, { platform: 'win32', isFileEditorFocused: true })).toBe(true)
    expect(shouldRequestFileEditorReplaceShortcut(baseInput, { platform: 'win32', isFileEditorFocused: false })).toBe(false)
    expect(shouldRequestFileEditorReplaceShortcut({ ...baseInput, key: 'f' }, { platform: 'win32', isFileEditorFocused: true })).toBe(false)
  })
})
