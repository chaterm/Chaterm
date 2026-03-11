import { describe, it, expect, vi } from 'vitest'

// Mock the edition utility used by locales/index.ts
vi.mock('@utils/edition', () => ({
  getDefaultLanguage: vi.fn(() => 'en-US')
}))

describe('i18n configuration - Arabic (ar-AR) locale support', () => {
  it('should register ar-AR in messages', async () => {
    const i18nModule = await import('../index')
    const i18n = i18nModule.default

    const availableLocales = i18n.global.availableLocales
    expect(availableLocales).toContain('ar-AR')
  })

  it('should have ar-AR messages with content', async () => {
    const i18nModule = await import('../index')
    const i18n = i18nModule.default

    const arMessages = i18n.global.getLocaleMessage('ar-AR')
    expect(arMessages).toBeDefined()
    expect(Object.keys(arMessages).length).toBeGreaterThan(0)
  })

  it('should register ar-AR datetime format', async () => {
    const i18nModule = await import('../index')
    const i18n = i18nModule.default

    const arDatetimeFormat = i18n.global.getDateTimeFormat('ar-AR')
    expect(arDatetimeFormat).toBeDefined()
    expect(arDatetimeFormat.short).toBeDefined()
    expect(arDatetimeFormat.short).toEqual({
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  })

  it('should have all 11 supported locales registered', async () => {
    const i18nModule = await import('../index')
    const i18n = i18nModule.default

    const expectedLocales = ['zh-CN', 'zh-TW', 'en-US', 'de-DE', 'fr-FR', 'it-IT', 'pt-PT', 'ru-RU', 'ja-JP', 'ko-KR', 'ar-AR']

    const availableLocales = i18n.global.availableLocales
    for (const locale of expectedLocales) {
      expect(availableLocales).toContain(locale)
    }
  })
})
