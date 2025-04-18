import { defineStore } from 'pinia'

export const userInfoStore = defineStore('userInfo', {
  state: () => ({
    userInfo: {
      name: '',
      email: '',
      avatar: '',
      registrationType: '',
      token: ''
    },
    stashMenu: ''
  }),
  actions: {
    updateInfo(info) {
      this.userInfo = info
    },
    updateStashMenu(info) {
      this.stashMenu = info
    },
    deleteInfo() {
      this.userInfo = {
        name: '',
        email: '',
        avatar: '',
        registrationType: '',
        token: ''
      }
    }
  },
  getters: {},
  persist: true
})
