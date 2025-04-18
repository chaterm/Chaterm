import { defineStore } from 'pinia'

export const useDeviceStore = defineStore('device', {
  state: () => {
    return {
      ip: '',
      macAddress: ''
    }
  },
  getters: {
    getDeviceIp: (state): string => {
      return state?.ip || 'Unknown'
    },
    getMacAddress: (state): string => {
      return state?.macAddress || 'Unknown'
    }
  },
  actions: {
    setDeviceIp(ipStr) {
      this.ip = ipStr
    },
    setMacAddress(macAddressStr) {
      this.macAddress = macAddressStr
    }
  }
})
