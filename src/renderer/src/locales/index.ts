import { createI18n } from 'vue-i18n'
import zhCN from './lang/zh-CN'
import zhTW from './lang/zh-TW'
import enUS from './lang/en-US'
import deDE from './lang/de-DE'
import frFR from './lang/fr-FR'
import itIT from './lang/it-IT'
import ptPT from './lang/pt-PT'
import ruRU from './lang/ru-RU'
import jaJP from './lang/ja-JP'
import koKR from './lang/ko-KR'
import { getDefaultLanguage } from '@utils/edition'

const messages = {
  'zh-CN': {
    ...zhCN
  },
  'zh-TW': {
    ...zhTW
  },
  'en-US': {
    ...enUS
  },
  'de-DE': {
    ...deDE
  },
  'fr-FR': {
    ...frFR
  },
  'it-IT': {
    ...itIT
  },
  'pt-PT': {
    ...ptPT
  },
  'ru-RU': {
    ...ruRU
  },
  'ja-JP': {
    ...jaJP
  },
  'ko-KR': {
    ...koKR
  }
}

// Get default language from edition config (cn -> zh-CN, global -> en-US)
const defaultLanguage = getDefaultLanguage()

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('lang') || defaultLanguage,
  fallbackLocale: 'en-US',
  messages,
  globalInjection: true,
  datetimeFormats: {
    'zh-CN': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'zh-TW': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'en-US': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'de-DE': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'fr-FR': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'it-IT': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'pt-PT': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'ru-RU': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'ja-JP': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    },
    'ko-KR': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    }
  }
})

export default i18n
