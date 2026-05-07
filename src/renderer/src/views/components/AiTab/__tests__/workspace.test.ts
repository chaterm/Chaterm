import { describe, it, expect, beforeEach } from 'vitest'
import { AI_TAB_DEFAULT_WORKSPACE, LEGACY_AI_TAB_STORAGE_KEY, aiTabStorageKey, isAiTabWorkspace, migrateLegacyAiTabStorage } from '../workspace'

describe('AiTab workspace helpers', () => {
  describe('aiTabStorageKey', () => {
    it('returns the terminal-namespaced key', () => {
      expect(aiTabStorageKey('terminal')).toBe('sharedAiTabState:terminal')
    })

    it('returns the database-namespaced key', () => {
      expect(aiTabStorageKey('database')).toBe('sharedAiTabState:database')
    })

    it('returns distinct keys so DB and terminal never share storage', () => {
      expect(aiTabStorageKey('terminal')).not.toBe(aiTabStorageKey('database'))
    })
  })

  describe('isAiTabWorkspace', () => {
    it('accepts the two valid literals', () => {
      expect(isAiTabWorkspace('terminal')).toBe(true)
      expect(isAiTabWorkspace('database')).toBe(true)
    })

    it('rejects anything else', () => {
      expect(isAiTabWorkspace('')).toBe(false)
      expect(isAiTabWorkspace(undefined)).toBe(false)
      expect(isAiTabWorkspace(null)).toBe(false)
      expect(isAiTabWorkspace('Terminal')).toBe(false)
      expect(isAiTabWorkspace({})).toBe(false)
    })
  })

  describe('AI_TAB_DEFAULT_WORKSPACE', () => {
    it("defaults to 'terminal' so existing mounts stay unchanged", () => {
      expect(AI_TAB_DEFAULT_WORKSPACE).toBe('terminal')
    })
  })

  describe('migrateLegacyAiTabStorage', () => {
    beforeEach(() => {
      const g = globalThis as unknown as { localStorage?: Storage }
      g.localStorage?.clear()
    })

    it('moves a legacy blob into the terminal namespace on first run', () => {
      localStorage.setItem(LEGACY_AI_TAB_STORAGE_KEY, '{"hello":"world"}')

      migrateLegacyAiTabStorage()

      expect(localStorage.getItem(LEGACY_AI_TAB_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(aiTabStorageKey('terminal'))).toBe('{"hello":"world"}')
    })

    it('does not clobber an existing terminal-namespaced value', () => {
      localStorage.setItem(aiTabStorageKey('terminal'), '{"kept":true}')
      localStorage.setItem(LEGACY_AI_TAB_STORAGE_KEY, '{"overwrite":"me"}')

      migrateLegacyAiTabStorage()

      expect(localStorage.getItem(LEGACY_AI_TAB_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(aiTabStorageKey('terminal'))).toBe('{"kept":true}')
    })

    it('is a no-op when neither key is set', () => {
      migrateLegacyAiTabStorage()
      expect(localStorage.getItem(LEGACY_AI_TAB_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(aiTabStorageKey('terminal'))).toBeNull()
    })

    it('is idempotent across repeated calls', () => {
      localStorage.setItem(LEGACY_AI_TAB_STORAGE_KEY, '{"a":1}')

      migrateLegacyAiTabStorage()
      migrateLegacyAiTabStorage()
      migrateLegacyAiTabStorage()

      expect(localStorage.getItem(LEGACY_AI_TAB_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(aiTabStorageKey('terminal'))).toBe('{"a":1}')
    })
  })
})
