import { defineStore } from 'pinia'

export const userConfigStore = defineStore('userConfig', {
  state: () => {
    return {
      userConfig: {
        language: 'en-US',
        aliasStatus: 2,
        uid: 0
      }
    }
  },
  getters: {
    getUserConfig: (state): { language: string; aliasStatus: number; uid: number } => {
      return state?.userConfig || { language: 'en-US', aliasStatus: 2, uid: 0 }
    }
  },
  actions: {
    setUserConfig(data) {
      this.userConfig = data
    }
  }
})
