import { defineStore } from 'pinia'

interface UserInfoState {
  name: string
  email: string
  avatar: string
  registrationType: string
  token: string
  uid: number
  subscription: string
}

const createDefaultUserInfo = (): UserInfoState => ({
  name: '',
  email: '',
  avatar: '',
  registrationType: '',
  token: '',
  uid: 0,
  subscription: ''
})

export const userInfoStore = defineStore('userInfo', {
  state: () => ({
    userInfo: createDefaultUserInfo(),
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
      this.userInfo = createDefaultUserInfo()
    }
  },
  getters: {},
  persist: true
})
