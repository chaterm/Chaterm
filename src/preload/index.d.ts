import { ElectronAPI } from '@electron-toolkit/preload'
interface Cookie {
  name: string
  value: string
}
interface ApiType {
  getCookie: (name: string) => Promise<{
    success: boolean
    value?: string
  }>
  setCookie: (
    name: string,
    value: string,
    expirationDays: number
  ) => Promise<{
    success: boolean
    value?: string
  }>

  getAllCookies: () => Promise<{
    success: boolean
    cookies?: Cookie[]
  }>
  removeCookie: (name: string) => Promise<{
    success: boolean
  }>
  getLocalIP: () => Promise<string>
  getMacAddress: () => Promise<string>
  getPlatform: () => Promise<string>
  invokeCustomAdsorption: (data: { appX: number; appY: number }) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiType
  }
}
