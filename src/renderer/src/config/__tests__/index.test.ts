import { describe, it, expect } from 'vitest'
import config from '../index'

describe('config - language list', () => {
  it('LANG array should contain all supported languages', () => {
    const expectedLocales = ['zh-CN', 'zh-TW', 'en-US', 'de-DE', 'fr-FR', 'it-IT', 'pt-PT', 'ru-RU', 'ja-JP', 'ko-KR', 'ar-AR']
    const actualLocales = config.LANG.map((lang) => lang.value)
    for (const locale of expectedLocales) {
      expect(actualLocales).toContain(locale)
    }
  })

  it('LANG array should include Arabic (ar-AR) entry', () => {
    const arabicEntry = config.LANG.find((lang) => lang.value === 'ar-AR')
    expect(arabicEntry).toBeDefined()
    expect(arabicEntry!.name).toBe('العربية')
    expect(arabicEntry!.value).toBe('ar-AR')
  })

  it('each LANG entry should have name and value properties', () => {
    for (const lang of config.LANG) {
      expect(lang).toHaveProperty('name')
      expect(lang).toHaveProperty('value')
      expect(typeof lang.name).toBe('string')
      expect(typeof lang.value).toBe('string')
      expect(lang.name.length).toBeGreaterThan(0)
      expect(lang.value).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
    }
  })
})
