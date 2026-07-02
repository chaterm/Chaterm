import { describe, expect, it } from 'vitest'
import { isMonacoEditorShortcutTarget } from '../preload/shortcutGuards'

describe('preload shortcut guards', () => {
  it('lets Monaco editor targets handle editor shortcuts', () => {
    const target = {
      closest: (selector: string) => (selector.includes('.monaco-editor') ? {} : null)
    } as any

    expect(isMonacoEditorShortcutTarget(target)).toBe(true)
    expect(isMonacoEditorShortcutTarget({ closest: () => null } as any)).toBe(false)
    expect(isMonacoEditorShortcutTarget(null)).toBe(false)
  })
})
