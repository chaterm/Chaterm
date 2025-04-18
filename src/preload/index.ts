import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
import os from 'os'
const getLocalIP = (): string => {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]
    if (!iface) continue
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address
      }
    }
  }
  return '127.0.0.1'
}
const getMacAddress = () => {
  const interfaces = os.networkInterfaces() || {}
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (!net.internal && net.mac !== '00:00:00:00:00:00') {
        return net.mac
      }
    }
  }
  return ''
}
// 获取当前 URL
const getCookieUrl = async () => {
  const cookieUrl = await ipcRenderer.invoke('get-cookie-url')
  return cookieUrl
}

// 设置 Cookie
const setCookie = async (name, value, expirationDays = 7) => {
  const result = await ipcRenderer.invoke('set-cookie', name, value, expirationDays)
  return result
}
// 获取cookie
const getCookie = async (name) => {
  try {
    const result = await ipcRenderer.invoke('get-cookie', name)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

// 获取所有 Cookies
const getAllCookies = async () => {
  try {
    const result = await ipcRenderer.invoke('get-cookie', null) // 如果不传 name，获取全部 Cookies
    return result
  } catch (error) {
    // console.log('获取所有 Cookie 失败:')
    return { success: false, error }
  }
}
// 移除一个 Cookie
const removeCookie = async (name) => {
  try {
    const result = await ipcRenderer.invoke('remove-cookie', { name })
    return result
  } catch (error) {
    // console.error('移除 Cookie 失败:', error)
    return { success: false, error }
  }
}
const getPlatform = () => ipcRenderer.invoke('get-platform')
const invokeCustomAdsorption = (data: { appX: number; appY: number }) =>
  ipcRenderer.invoke('custom-adsorption', data)
const api = {
  getLocalIP,
  getMacAddress,
  removeCookie,
  getAllCookies,
  getCookie,
  getCookieUrl,
  setCookie,
  invokeCustomAdsorption,
  getPlatform
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      electronAPI,
      getCurrentURL: () => window.location.href // 通过 window.location 获取当前 URL
    })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    // console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
