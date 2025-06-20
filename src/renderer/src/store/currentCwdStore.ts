import { defineStore } from 'pinia'

export const useCurrentCwdStore = defineStore('currentCwd', {
  state: () => ({
    keyValueMap: {} as Record<string, string>
  }),
  actions: {
    setKeyValue(key: string, value: string) {
      this.keyValueMap[key] = value
    },
    getKeyValue(key: string) {
      return this.keyValueMap[key]
    },
    removeKey(key: string) {
      delete this.keyValueMap[key]
    }
  }
})
