import { describe, expect, it } from 'vitest'
import { resolveAliasExpansion, shouldSuppressCtrlVAfterNativePaste } from '../terminalInput'

describe('terminalInput helpers', () => {
  describe('shouldSuppressCtrlVAfterNativePaste', () => {
    it('suppresses Ctrl+V immediately after a native paste event', () => {
      expect(shouldSuppressCtrlVAfterNativePaste(1000, 1100)).toBe(true)
    })

    it('does not suppress Ctrl+V after the debounce window', () => {
      expect(shouldSuppressCtrlVAfterNativePaste(1000, 1300)).toBe(false)
    })

    it('does not suppress Ctrl+V when no native paste has happened', () => {
      expect(shouldSuppressCtrlVAfterNativePaste(0, 100)).toBe(false)
    })
  })

  describe('resolveAliasExpansion', () => {
    it('returns the aliased command when global alias is enabled', () => {
      const result = resolveAliasExpansion('srdproxy', 1, (name) => (name === 'srdproxy' ? 'export http_proxy=1' : null))
      expect(result).toBe('export http_proxy=1')
    })

    it('returns null when alias is disabled', () => {
      const result = resolveAliasExpansion('srdproxy', 2, () => 'export http_proxy=1')
      expect(result).toBeNull()
    })

    it('returns null when the command is not an alias', () => {
      const result = resolveAliasExpansion('ls', 1, () => null)
      expect(result).toBeNull()
    })

    it('returns null when the alias resolves to the same command', () => {
      const result = resolveAliasExpansion('ls', 1, () => 'ls')
      expect(result).toBeNull()
    })
  })
})
