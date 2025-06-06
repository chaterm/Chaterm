import { defineStore } from 'pinia'

export const useCurrentCwdStore = defineStore('currentCwd', {
  state: () => ({
    currentCwd: ''
  }),
  actions: {
    setCurrentCwd(cwd: string) {
      this.currentCwd = cwd
    }
  }
})
