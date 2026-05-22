// Supported locale list for the language selector.
// Order matters: more specific tags must precede less specific ones during matching.
export const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'de-DE', 'fr-FR', 'it-IT', 'pt-PT', 'ru-RU', 'ja-JP', 'ko-KR', 'ar-AR'] as const

export const SYSTEM_LANGUAGE_VALUE = 'system'

/**
 * Resolve a BCP-47 tag (e.g. from navigator.language) to a supported locale.
 * Falls back to 'en-US' when no language match is found.
 */
export function resolveSystemLanguage(tag?: string | null): string {
  const normalized = (tag || (typeof navigator !== 'undefined' ? navigator.language : '') || '').trim()
  if (!normalized) return 'en-US'

  // Exact match first
  const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === normalized.toLowerCase())
  if (exact) return exact

  const lower = normalized.toLowerCase()
  const primary = lower.split('-')[0]
  const region = lower.split('-')[1]

  // Chinese: distinguish Traditional regions from Simplified
  if (primary === 'zh') {
    if (region && ['tw', 'hk', 'mo', 'hant'].includes(region)) return 'zh-TW'
    if (lower.includes('hant')) return 'zh-TW'
    return 'zh-CN'
  }

  // Map by primary language tag
  const byPrimary: Record<string, string> = {
    en: 'en-US',
    de: 'de-DE',
    fr: 'fr-FR',
    it: 'it-IT',
    pt: 'pt-PT',
    ru: 'ru-RU',
    ja: 'ja-JP',
    ko: 'ko-KR',
    ar: 'ar-AR'
  }

  return byPrimary[primary] || 'en-US'
}

/**
 * Resolve the language stored in user preferences to an actual locale to apply.
 * If the value is the system sentinel, derive from navigator.language.
 */
export function resolveAppliedLanguage(stored: string | null | undefined): string {
  if (!stored || stored === SYSTEM_LANGUAGE_VALUE) {
    return resolveSystemLanguage()
  }
  return stored
}
