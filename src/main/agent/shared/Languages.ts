//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

export type LanguageKey =
  | 'en'
  | 'en-US'
  | 'ar'
  | 'pt-BR'
  | 'cs'
  | 'fr'
  | 'de'
  | 'hi'
  | 'hu'
  | 'it'
  | 'ja'
  | 'ko'
  | 'pl'
  | 'pt-PT'
  | 'ru'
  | 'zh-CN'
  | 'es'
  | 'zh-TW'
  | 'tr'

export type LanguageDisplay =
  | 'English'
  | 'Arabic - العربية'
  | 'Portuguese - Português (Brasil)'
  | 'Czech - Čeština'
  | 'French - Français'
  | 'German - Deutsch'
  | 'Hindi - हिन्दी'
  | 'Hungarian - Magyar'
  | 'Italian - Italiano'
  | 'Japanese - 日本語'
  | 'Korean - 한국어'
  | 'Polish - Polski'
  | 'Portuguese - Português (Portugal)'
  | 'Russian - Русский'
  | 'Simplified Chinese - 简体中文'
  | 'Spanish - Español'
  | 'Traditional Chinese - 繁體中文'
  | 'Turkish - Türkçe'

// Default language based on edition (cn -> zh-CN, global -> en-US)
// Uses APP_EDITION env variable set at build time
// Returns locale code consistent with renderer i18n (zh-CN, en-US)
function getDefaultLanguageFromEdition(): LanguageKey {
  // `src/main` can access Node's `process`, but `src/renderer` (when importing this shared module)
  // may not have `process` defined at runtime.
  const edition = typeof process !== 'undefined' ? process.env.APP_EDITION || 'cn' : 'cn'
  return edition === 'global' ? 'en-US' : 'zh-CN'
}

export const DEFAULT_LANGUAGE_SETTINGS: LanguageKey = getDefaultLanguageFromEdition()

export const languageOptions: { key: LanguageKey; display: LanguageDisplay }[] = [
  { key: 'en', display: 'English' },
  { key: 'ar', display: 'Arabic - العربية' },
  { key: 'pt-BR', display: 'Portuguese - Português (Brasil)' },
  { key: 'cs', display: 'Czech - Čeština' },
  { key: 'fr', display: 'French - Français' },
  { key: 'de', display: 'German - Deutsch' },
  { key: 'hi', display: 'Hindi - हिन्दी' },
  { key: 'hu', display: 'Hungarian - Magyar' },
  { key: 'it', display: 'Italian - Italiano' },
  { key: 'ja', display: 'Japanese - 日本語' },
  { key: 'ko', display: 'Korean - 한국어' },
  { key: 'pl', display: 'Polish - Polski' },
  { key: 'pt-PT', display: 'Portuguese - Português (Portugal)' },
  { key: 'ru', display: 'Russian - Русский' },
  { key: 'zh-CN', display: 'Simplified Chinese - 简体中文' },
  { key: 'es', display: 'Spanish - Español' },
  { key: 'zh-TW', display: 'Traditional Chinese - 繁體中文' },
  { key: 'tr', display: 'Turkish - Türkçe' }
]

export function getLanguageKey(display: LanguageDisplay | undefined): LanguageKey {
  if (!display) {
    return DEFAULT_LANGUAGE_SETTINGS
  }
  const languageOption = languageOptions.find((option) => option.display === display)
  if (languageOption) {
    return languageOption.key
  }
  return DEFAULT_LANGUAGE_SETTINGS
}

export const KB_SEARCH_ENABLED_LABELS: Record<string, string> = {
  'zh-CN': '知识库检索',
  'zh-TW': '知識庫檢索',
  'en-US': 'Knowledge base search',
  'ja-JP': 'ナレッジベース検索',
  'ko-KR': '지식 베이스 검색',
  'de-DE': 'Wissensdatenbank-Suche',
  'fr-FR': 'Recherche dans la base de connaissances',
  'it-IT': 'Ricerca nella base di conoscenza',
  'pt-PT': 'Pesquisa na base de conhecimento',
  'ru-RU': 'Поиск по базе знаний',
  'ar-AR': 'البحث في قاعدة المعرفة'
}

export function getKbSearchEnabledLabel(locale: string): string {
  return KB_SEARCH_ENABLED_LABELS[locale] ?? KB_SEARCH_ENABLED_LABELS['en-US']
}
