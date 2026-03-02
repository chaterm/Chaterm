import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getModifierSymbol, hasPreviewTextSelection, isMacPlatform, isShortcutEvent } from '../utils/kbShortcuts'

describe('kbShortcuts', () => {
  const originalNavigator = global.navigator

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true
    })
  })

  describe('isMacPlatform', () => {
    it('should return true on macOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        writable: true
      })
      expect(isMacPlatform()).toBe(true)
    })

    it('should return true on Mac with ARM', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacARM' },
        writable: true
      })
      expect(isMacPlatform()).toBe(true)
    })

    it('should return false on Windows', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Win32' },
        writable: true
      })
      expect(isMacPlatform()).toBe(false)
    })

    it('should return false on Linux', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Linux x86_64' },
        writable: true
      })
      expect(isMacPlatform()).toBe(false)
    })
  })

  describe('getModifierSymbol', () => {
    it('should return Command symbol on macOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        writable: true
      })
      expect(getModifierSymbol()).toBe('⌘')
    })

    it('should return Ctrl+ on Windows', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Win32' },
        writable: true
      })
      expect(getModifierSymbol()).toBe('Ctrl+')
    })

    it('should return Ctrl+ on Linux', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Linux x86_64' },
        writable: true
      })
      expect(getModifierSymbol()).toBe('Ctrl+')
    })
  })

  describe('isShortcutEvent', () => {
    const createKeyboardEvent = (key: string, metaKey = false, ctrlKey = false): KeyboardEvent => {
      return {
        key,
        metaKey,
        ctrlKey,
        preventDefault: vi.fn()
      } as unknown as KeyboardEvent
    }

    describe('on macOS', () => {
      beforeEach(() => {
        Object.defineProperty(global, 'navigator', {
          value: { platform: 'MacIntel' },
          writable: true
        })
      })

      it('should detect Cmd+C as copy shortcut', () => {
        const event = createKeyboardEvent('c', true, false)
        expect(isShortcutEvent(event, 'copy')).toBe(true)
      })

      it('should detect Cmd+X as cut shortcut', () => {
        const event = createKeyboardEvent('x', true, false)
        expect(isShortcutEvent(event, 'cut')).toBe(true)
      })

      it('should detect Cmd+V as paste shortcut', () => {
        const event = createKeyboardEvent('v', true, false)
        expect(isShortcutEvent(event, 'paste')).toBe(true)
      })

      it('should not detect Ctrl+C as copy shortcut on Mac', () => {
        const event = createKeyboardEvent('c', false, true)
        expect(isShortcutEvent(event, 'copy')).toBe(false)
      })

      it('should be case insensitive', () => {
        const event = createKeyboardEvent('C', true, false)
        expect(isShortcutEvent(event, 'copy')).toBe(true)
      })
    })

    describe('on Windows/Linux', () => {
      beforeEach(() => {
        Object.defineProperty(global, 'navigator', {
          value: { platform: 'Win32' },
          writable: true
        })
      })

      it('should detect Ctrl+C as copy shortcut', () => {
        const event = createKeyboardEvent('c', false, true)
        expect(isShortcutEvent(event, 'copy')).toBe(true)
      })

      it('should detect Ctrl+X as cut shortcut', () => {
        const event = createKeyboardEvent('x', false, true)
        expect(isShortcutEvent(event, 'cut')).toBe(true)
      })

      it('should detect Ctrl+V as paste shortcut', () => {
        const event = createKeyboardEvent('v', false, true)
        expect(isShortcutEvent(event, 'paste')).toBe(true)
      })

      it('should not detect Cmd+C as copy shortcut on Windows', () => {
        const event = createKeyboardEvent('c', true, false)
        expect(isShortcutEvent(event, 'copy')).toBe(false)
      })
    })

    it('should return false for unrecognized action', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        writable: true
      })
      const event = createKeyboardEvent('c', true, false)
      expect(isShortcutEvent(event, 'unknown' as 'copy')).toBe(false)
    })

    it('should return false when no modifier key is pressed', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        writable: true
      })
      const event = createKeyboardEvent('c', false, false)
      expect(isShortcutEvent(event, 'copy')).toBe(false)
    })
  })

  describe('hasPreviewTextSelection', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      document.body.innerHTML = ''
    })

    it('should return true when selected text is inside markdown preview', () => {
      document.body.innerHTML = '<div class="kb-preview"><p id="preview-text">preview selected text</p></div>'
      const node = document.getElementById('preview-text')?.firstChild
      expect(node).toBeTruthy()

      vi.spyOn(window, 'getSelection').mockReturnValue({
        rangeCount: 1,
        isCollapsed: false,
        toString: () => 'preview selected text',
        anchorNode: node,
        focusNode: node
      } as Selection)

      expect(hasPreviewTextSelection()).toBe(true)
    })

    it('should return false when selected text is outside markdown preview', () => {
      document.body.innerHTML = '<div class="other-container"><p id="outside-text">outside selected text</p></div>'
      const node = document.getElementById('outside-text')?.firstChild
      expect(node).toBeTruthy()

      vi.spyOn(window, 'getSelection').mockReturnValue({
        rangeCount: 1,
        isCollapsed: false,
        toString: () => 'outside selected text',
        anchorNode: node,
        focusNode: node
      } as Selection)

      expect(hasPreviewTextSelection()).toBe(false)
    })

    it('should return false when there is no selected text', () => {
      vi.spyOn(window, 'getSelection').mockReturnValue({
        rangeCount: 0,
        isCollapsed: true,
        toString: () => '',
        anchorNode: null,
        focusNode: null
      } as Selection)

      expect(hasPreviewTextSelection()).toBe(false)
    })
  })
})
