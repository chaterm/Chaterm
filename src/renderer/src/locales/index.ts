import { createI18n } from 'vue-i18n'
import zhCN from './lang/zh-CN'
import enUS from './lang/en-US'

const messages = {
  'zh-CN': {
    ...zhCN
  },
  'en-US': {
    ...enUS
  }
}

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('lang') || 'zh-CN',
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
    'en-US': {
      short: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    }
  }
})

export default i18n
