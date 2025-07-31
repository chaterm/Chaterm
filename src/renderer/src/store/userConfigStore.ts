import { defineStore } from 'pinia'

export const userConfigStore = defineStore('userConfig', {
  state: () => {
    return {
      userConfig: {
        language: 'zh-CN',
        aliasStatus: 1,
        uid: 0,
        autoCompleteStatus: 1,
        commonVimStatus: 2,
        quickVimStatus: 1,
        cursorStyle: 'bar',
        fontSize: 12,
        highlightStatus: 1,
        scrollBack: 1000,
        watermark: 'open',
        feature: 0.0,
        terminalType: 'xterm'
      }
    }
  },
  getters: {
    getUserConfig: (
      state
    ): {
      language: string
      aliasStatus: number
      uid: number
      autoCompleteStatus: number
      commonVimStatus: number
      quickVimStatus: number
      cursorStyle: string
      fontSize: number
      highlightStatus: number
      scrollBack: number
      watermark: string
      feature: number
      terminalType: string
    } => {
      return (
        state?.userConfig || {
          language: 'zh-CN',
          aliasStatus: 2,
          uid: 0,
          autoCompleteStatus: 2,
          commonVimStatus: 2,
          quickVimStatus: 2,
          cursorStyle: 'bar',
          fontSize: 12,
          highlightStatus: 2,
          scrollBack: 1000,
          watermark: 'open',
          feature: 0.0,
          terminalType: 'xterm'
        }
      )
    }
  },
  actions: {
    setUserConfig(data) {
      this.userConfig = data
    },
    updateLanguage(language: string) {
      this.userConfig.language = language
    }
  }
})
