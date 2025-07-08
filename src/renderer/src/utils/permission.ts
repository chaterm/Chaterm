export const CtmTokenKey: string = 'Ctm-Token'
import { userInfoStore } from '@/store/index'
import { pinia } from '@/main'

const baseSso = import.meta.env.RENDERER_SSO
const currentUrl = location.href
export function getLoginUrl() {
  return baseSso + currentUrl
}
export function removeToken() {
  localStorage.removeItem('ctm-token')
  localStorage.removeItem('bearer-token')
  localStorage.removeItem('userInfo')
  localStorage.removeItem('login-skipped')
}
export const setUserInfo = (info) => {
  const userStore = userInfoStore(pinia)
  userStore.updateInfo(info)
}
export const getUserInfo = () => {
  const userStore = userInfoStore(pinia)
  return userStore.userInfo
}
