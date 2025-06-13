import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

interface FileRecord {
  name: string
  path: string
  isDir: boolean
  mode: string
  isLink: boolean
  modTime: string
  size: number
}

const envPath = path.resolve(__dirname, '../../../build/.env')

// 确保路径存在
if (!fs.existsSync(envPath)) {
  console.warn(`环境变量文件不存在: ${envPath}`)
  // 可以尝试其他路径或设置默认值
}

// 加载环境变量
dotenv.config({ path: envPath })

// 如果有特定环境的 .env 文件，也可以加载
const nodeEnv = process.env.NODE_ENV || 'development'
const envSpecificPath = path.resolve(__dirname, `../../build/.env.${nodeEnv}`)
const envContent: Record<string, string> = {}

if (fs.existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath })

  try {
    const fileContent = fs.readFileSync(envSpecificPath, 'utf8')
    // 手动解析环境变量
    fileContent.split('\n').forEach((line) => {
      // 忽略注释和空行
      if (!line || line.startsWith('#')) return

      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = match[2] || ''

        // 去除引号
        value = value.replace(/^['"]|['"]$/g, '')

        // 将解析的环境变量存储到对象中
        envContent[key] = value

        // 设置到 process.env 中
        process.env[key] = value
      }
    })
  } catch (error) {
    console.warn('Failed to read environment file:', error)
  }
} else {
  console.log(`Environment file not found: ${envSpecificPath}, using default values`)
}

// Custom APIs for renderer
import os from 'os'
import { ExecResult } from '../main/ssh/sshHandle'
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
    return { success: false, error }
  }
}
// 移除一个 Cookie
const removeCookie = async (name) => {
  try {
    const result = await ipcRenderer.invoke('remove-cookie', { name })
    return result
  } catch (error) {
    return { success: false, error }
  }
}

const queryCommand = async (data: { command: string; ip: string }) => {
  try {
    const result = await ipcRenderer.invoke('query-command', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const insertCommand = async (data: { command: string; ip: string }) => {
  try {
    const result = await ipcRenderer.invoke('insert-command', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

// Chaterm数据库相关的IPC处理程序
const getLocalAssetRoute = async (data: { searchType: string; params?: any[] }) => {
  try {
    const result = await ipcRenderer.invoke('asset-route-local-get', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const updateLocalAssetLabel = async (data: { uuid: string; label: string }) => {
  try {
    const result = await ipcRenderer.invoke('asset-route-local-update', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const updateLocalAsseFavorite = async (data: { uuid: string; status: number }) => {
  try {
    const result = await ipcRenderer.invoke('asset-route-local-favorite', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const getKeyChainSelect = async () => {
  try {
    const result = await ipcRenderer.invoke('key-chain-local-get')
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const getAssetGroup = async () => {
  try {
    const result = await ipcRenderer.invoke('asset-group-local-get')
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const chatermInsert = async (data: { sql: string; params?: any[] }) => {
  try {
    const result = await ipcRenderer.invoke('chaterm-insert', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const chatermUpdate = async (data: { sql: string; params?: any[] }) => {
  try {
    const result = await ipcRenderer.invoke('chaterm-update', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const deleteAsset = async (data: { uuid: string }) => {
  try {
    const result = await ipcRenderer.invoke('asset-delete', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const createAsset = async (data: { form: any }) => {
  try {
    const result = await ipcRenderer.invoke('asset-create', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const updateAsset = async (data: { form: any }) => {
  try {
    const result = await ipcRenderer.invoke('asset-update', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const getKeyChainList = async () => {
  try {
    const result = await ipcRenderer.invoke('key-chain-local-get-list')
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const createKeyChain = async (data: { form: any }) => {
  try {
    const result = await ipcRenderer.invoke('key-chain-local-create', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const deleteKeyChain = async (data: { id: number }) => {
  try {
    const result = await ipcRenderer.invoke('key-chain-local-delete', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const getKeyChainInfo = async (data: { id: number }) => {
  try {
    const result = await ipcRenderer.invoke('key-chain-local-get-info', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const updateKeyChain = async (data: { form: any }) => {
  try {
    const result = await ipcRenderer.invoke('key-chain-local-update', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const connectAssetInfo = async (data: { uuid: string }) => {
  try {
    const result = await ipcRenderer.invoke('chaterm-connect-asset-info', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}
const chatermGetChatermMessages = async (data: { taskId: string }) => {
  try {
    const result = await ipcRenderer.invoke('agent-chaterm-messages', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const getPlatform = () => ipcRenderer.invoke('get-platform')
const invokeCustomAdsorption = (data: { appX: number; appY: number }) =>
  ipcRenderer.invoke('custom-adsorption', data)

const getTaskMetadata = async (taskId) => {
  try {
    const result = await ipcRenderer.invoke('get-task-metadata', { taskId })
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const getUserHosts = async (search: string) => {
  try {
    const result = await ipcRenderer.invoke('get-user-hosts', { search })
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const api = {
  getLocalIP,
  getMacAddress,
  removeCookie,
  getAllCookies,
  getCookie,
  getCookieUrl,
  setCookie,
  invokeCustomAdsorption,
  getPlatform,
  queryCommand,
  insertCommand,
  getLocalAssetRoute,
  updateLocalAssetLabel,
  updateLocalAsseFavorite,
  getKeyChainSelect,
  getKeyChainList,
  getAssetGroup,
  chatermInsert,
  chatermUpdate,
  deleteAsset,
  createAsset,
  updateAsset,
  createKeyChain,
  deleteKeyChain,
  getKeyChainInfo,
  updateKeyChain,
  connectAssetInfo,
  chatermGetChatermMessages,
  getTaskMetadata,
  getUserHosts,
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  unmaximizeWindow: () => ipcRenderer.invoke('window:unmaximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  openBrowserWindow: (url: string): void => {
    ipcRenderer.send('open-browser-window', url)
  },
  onUrlChange: (callback: (url: string) => void): void => {
    ipcRenderer.on('url-changed', (_event, url) => callback(url))
  },
  goBack: (): void => {
    ipcRenderer.send('browser-go-back')
  },
  goForward: (): void => {
    ipcRenderer.send('browser-go-forward')
  },
  refresh: (): void => {
    ipcRenderer.send('browser-refresh')
  },
  onNavigationStateChanged: (
    callback: (state: { canGoBack: boolean; canGoForward: boolean }) => void
  ): void => {
    ipcRenderer.on('navigation-state-changed', (_event, state) => callback(state))
  },

  // keyboard-interactive 认证
  onKeyboardInteractiveTimeout: (callback) => {
    const listener = (_event, data) => {
      callback(data)
    }
    ipcRenderer.on('ssh:keyboard-interactive-timeout', listener)
    return () => ipcRenderer.removeListener('ssh:keyboard-interactive-timeout', listener)
  },
  onKeyboardInteractiveRequest: (callback) => {
    const listener = (_event, data) => {
      callback(data)
    }
    ipcRenderer.on('ssh:keyboard-interactive-request', listener)
    return () => ipcRenderer.removeListener('ssh:keyboard-interactive-request', listener)
  },
  onKeyboardInteractiveResult: (callback) => {
    const listener = (_event, data) => {
      callback(data)
    }
    ipcRenderer.on('ssh:keyboard-interactive-result', listener)
    return () => ipcRenderer.removeListener('ssh:keyboard-interactive-result', listener)
  },
  // sshAPI
  connect: (connectionInfo) => ipcRenderer.invoke('ssh:connect', connectionInfo),
  connectReadyData: (id) => {
    return new Promise((resolve) => {
      const channel = `ssh:connect:data:${id}`
      ipcRenderer.once(channel, (_event, data) => {
        resolve(data)
      })
    })
  },
  checkSftpConnAvailable: (id: string) => {
    ipcRenderer.invoke('ssh:sftp:conn:check', { id })
  },
  shell: (params) => ipcRenderer.invoke('ssh:shell', params),
  resizeShell: (id, cols, rows) => ipcRenderer.invoke('ssh:shell:resize', { id, cols, rows }),
  sshSftpList: (opts: { id: string; remotePath: string }) =>
    ipcRenderer.invoke('ssh:sftp:list', opts) as Promise<FileRecord[] | string[]>,
  sftpConnList: () => ipcRenderer.invoke('ssh:sftp:conn:list') as Promise<string[]>,
  sshConnExec: (args: { id: string; cmd: string }) =>
    ipcRenderer.invoke('ssh:conn:exec', args) as Promise<ExecResult>,
  writeToShell: (params) => ipcRenderer.send('ssh:shell:write', params),
  disconnect: (params) => ipcRenderer.invoke('ssh:disconnect', params),
  selectPrivateKey: () => ipcRenderer.invoke('ssh:select-private-key'),

  onShellData: (id, callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on(`ssh:shell:data:${id}`, listener)
    return () => ipcRenderer.removeListener(`ssh:shell:data:${id}`, listener)
  },
  onShellError: (id, callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on(`ssh:shell:stderr:${id}`, listener)
    return () => ipcRenderer.removeListener(`ssh:shell:stderr:${id}`, listener)
  },
  onShellClose: (id, callback) => {
    const listener = () => callback()
    ipcRenderer.on(`ssh:shell:close:${id}`, listener)
    return () => ipcRenderer.removeListener(`ssh:shell:close:${id}`, listener)
  },
  recordTerminalState: (params) => ipcRenderer.invoke('ssh:recordTerminalState', params),
  recordCommand: (params) => ipcRenderer.invoke('ssh:recordCommand', params),

  chatermConnectAssetInfo: async (data) => {
    const result = await ipcRenderer.invoke('chaterm-connect-asset-info', data)
    return result
  },
  cancelTask: async () => {
    try {
      const result = await ipcRenderer.invoke('cancel-task')
      return result
    } catch (error) {
      return Promise.reject(error)
    }
  },
  sendToMain: (message: any) => ipcRenderer.invoke('webview-to-main', message),
  onMainMessage: (callback) => {
    const handler = (_event, message) => callback(message)
    ipcRenderer.on('main-to-webview', handler)
    return () => {
      ipcRenderer.removeListener('main-to-webview', handler)
    }
  },
  // 新增的方法，用于调用主进程的 executeRemoteCommand
  executeRemoteCommandViaPreload: async () => {
    try {
      console.log('Calling execute-remote-command via preload') // 添加日志
      const result = await ipcRenderer.invoke('execute-remote-command')
      console.log('Result from main process:', result) // 添加日志
      return result
    } catch (error) {
      console.error('Error invoking execute-remote-command from preload:', error) // 添加日志
      // 确保错误是一个可序列化的对象
      if (error instanceof Error) {
        return {
          success: false,
          error: { message: error.message, name: error.name, stack: error.stack }
        }
      }
      return { success: false, error: { message: 'An unknown error occurred in preload' } }
    }
  },
  closeHeartbeatWindow: (heartbeatId: string) => {
    ipcRenderer.invoke('heartbeat-stop', { heartbeatId })
  },
  openHeartbeatWindow: (heartbeatId: string, interval: number = 5000) => {
    ipcRenderer.invoke('heartbeat-start', { heartbeatId, interval })
  },
  heartBeatTick: (callback: (heartbeatId: string) => void) => {
    ipcRenderer.on('heartbeat-tick', (event, heartbeatId) => {
      callback(heartbeatId)
    })
  }
}
// 自定义 API 用于浏览器控制

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
