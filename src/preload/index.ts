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

// Ensure path exists
if (!fs.existsSync(envPath)) {
  console.warn(`Environment file does not exist: ${envPath}`)
  // Can try other paths or set default values
}

// Load environment variables
dotenv.config({ path: envPath })

// If there is a .env file for a specific environment, it can also be loaded
const nodeEnv = process.env.NODE_ENV || 'development'
const envSpecificPath = path.resolve(__dirname, `../../build/.env.${nodeEnv}`)
const envContent: Record<string, string> = {}

if (fs.existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath })

  try {
    const fileContent = fs.readFileSync(envSpecificPath, 'utf8')
    // Manually parse environment variables
    fileContent.split('\n').forEach((line) => {
      // Ignore comments and empty lines
      if (!line || line.startsWith('#')) return

      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = match[2] || ''

        // Remove quotes
        value = value.replace(/^['"]|['"]$/g, '')

        // Store parsed environment variables in an object
        envContent[key] = value

        // Set to process.env
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
// Get current URL
const getCookieUrl = async () => {
  const cookieUrl = await ipcRenderer.invoke('get-cookie-url')
  return cookieUrl
}

// Set Cookie
const setCookie = async (name, value, expirationDays = 7) => {
  const result = await ipcRenderer.invoke('set-cookie', name, value, expirationDays)
  return result
}
// Get cookie
const getCookie = async (name) => {
  try {
    const result = await ipcRenderer.invoke('get-cookie', name)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

// Get all Cookies
const getAllCookies = async () => {
  try {
    const result = await ipcRenderer.invoke('get-cookie', null) // If no name is passed, get all Cookies
    return result
  } catch (error) {
    return { success: false, error }
  }
}
// Remove a Cookie
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

// Chaterm database related IPC handlers
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
const invokeCustomAdsorption = (data: { appX: number; appY: number }) => ipcRenderer.invoke('custom-adsorption', data)

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

const initUserDatabase = async (data: { uid: number }) => {
  try {
    const result = await ipcRenderer.invoke('init-user-database', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

// User snippet operations
const userSnippetOperation = async (data: { operation: 'list' | 'create' | 'delete' | 'update' | 'swap'; params?: any }) => {
  try {
    const result = await ipcRenderer.invoke('user-snippet-operation', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const refreshOrganizationAssets = async (data: { organizationUuid: string; jumpServerConfig: any }) => {
  try {
    const result = await ipcRenderer.invoke('refresh-organization-assets', data)
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const updateOrganizationAssetFavorite = async (data: { organizationUuid: string; host: string; status: number }) => {
  console.log('=== preload updateOrganizationAssetFavorite 开始 ===')
  console.log('传入参数:', data)

  try {
    console.log('调用 IPC: organization-asset-favorite')
    const result = await ipcRenderer.invoke('organization-asset-favorite', data)
    console.log('IPC 返回结果:', result)
    return result
  } catch (error) {
    console.error('preload updateOrganizationAssetFavorite 错误:', error)
    return Promise.reject(error)
  }
}

const updateOrganizationAssetComment = async (data: { organizationUuid: string; host: string; comment: string }) => {
  console.log('=== preload updateOrganizationAssetComment 开始 ===')
  console.log('传入参数:', data)

  try {
    console.log('调用 IPC: organization-asset-comment')
    const result = await ipcRenderer.invoke('organization-asset-comment', data)
    console.log('IPC 返回结果:', result)
    return result
  } catch (error) {
    console.error('preload updateOrganizationAssetComment 错误:', error)
    return Promise.reject(error)
  }
}
const getSystemInfo = async (id: string) => {
  try {
    const result = await ipcRenderer.invoke('ssh:get-system-info', { id })
    return result
  } catch (error) {
    return Promise.reject(error)
  }
}

const api = {
  getSystemInfo,
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
  initUserDatabase,
  userSnippetOperation,
  refreshOrganizationAssets,
  updateOrganizationAssetFavorite,
  updateOrganizationAssetComment,
  setDataSyncEnabled: (enabled: boolean) => ipcRenderer.invoke('data-sync:set-enabled', enabled),
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
  onNavigationStateChanged: (callback: (state: { canGoBack: boolean; canGoForward: boolean }) => void): void => {
    ipcRenderer.on('navigation-state-changed', (_event, state) => callback(state))
  },
  // 添加处理协议 URL 的函数，特别用于 Linux 系统
  handleProtocolUrl: (url: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('handle-protocol-url', url)
  },

  // keyboard-interactive authentication
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
  submitKeyboardInteractiveResponse: (id, code) => {
    ipcRenderer.send(`ssh:keyboard-interactive-response:${id}`, [code])
  },
  cancelKeyboardInteractive: (id) => {
    ipcRenderer.send(`ssh:keyboard-interactive-cancel:${id}`)
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
  checkSftpConnAvailable: (id: string) => ipcRenderer.invoke('ssh:sftp:conn:check', { id }),
  shell: (params) => ipcRenderer.invoke('ssh:shell', params),
  resizeShell: (id, cols, rows) => ipcRenderer.invoke('ssh:shell:resize', { id, cols, rows }),
  sshSftpList: (opts: { id: string; remotePath: string }) => ipcRenderer.invoke('ssh:sftp:list', opts) as Promise<FileRecord[] | string[]>,
  sftpConnList: () => ipcRenderer.invoke('ssh:sftp:conn:list') as Promise<string[]>,
  sshConnExec: (args: { id: string; cmd: string }) => ipcRenderer.invoke('ssh:conn:exec', args) as Promise<ExecResult>,
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
  gracefulCancelTask: async () => {
    try {
      const result = await ipcRenderer.invoke('graceful-cancel-task')
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
  // New method to call executeRemoteCommand in the main process
  executeRemoteCommandViaPreload: async () => {
    try {
      console.log('Calling execute-remote-command via preload') // Add log
      const result = await ipcRenderer.invoke('execute-remote-command')
      console.log('Result from main process:', result) // Add log
      return result
    } catch (error) {
      console.error('Error invoking execute-remote-command from preload:', error) // Add log
      // Ensure error is a serializable object
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
  },
  validateApiKey: async (configuration?: any) => {
    try {
      const result = await ipcRenderer.invoke('validate-api-key', configuration)
      return result
    } catch (error) {
      return Promise.reject(error)
    }
  },
  // Telemetry events
  captureButtonClick: async (button: string, properties?: Record<string, any>) => {
    try {
      const result = await ipcRenderer.invoke('capture-telemetry-event', {
        eventType: 'button_click',
        data: { button, properties }
      })
      return result
    } catch (error) {
      return Promise.reject(error)
    }
  },
  checkUpdate: () => ipcRenderer.invoke('update:checkUpdate'),
  download: () => ipcRenderer.invoke('update:download'),
  autoUpdate: (update) => {
    ipcRenderer.on('update:autoUpdate', (event, params) => update(params))
  },
  quitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
  updateTheme: (params) => ipcRenderer.invoke('update-theme', params),
  mainWindowInit: (params) => ipcRenderer.invoke('main-window-init', params),
  mainWindowShow: () => ipcRenderer.invoke('main-window-show'),
  // 添加 JumpServer 状态更新监听
  onJumpServerStatusUpdate: (callback) => {
    const listener = (_event, data) => {
      callback(data)
    }
    ipcRenderer.on('jumpserver:status-update', listener)
    return () => ipcRenderer.removeListener('jumpserver:status-update', listener)
  },
  openExternalLogin: () => ipcRenderer.invoke('open-external-login'),
  detectIpLocation: () => ipcRenderer.invoke('detect-ip-location'),

  // sftp
  uploadFile: (opts: { id: string; remotePath: string; localPath: string }) => ipcRenderer.invoke('ssh:sftp:upload-file', opts),
  downloadFile: (opts: { id: string; remotePath: string; localPath: string }) => ipcRenderer.invoke('ssh:sftp:download-file', opts),
  uploadDirectory: (opts: { id: string; remoteDir: string; localDir: string }) => ipcRenderer.invoke('ssh:sftp:upload-dir', opts),
  renameFile: (opts: { id: string; oldPath: string; newPath: string }) => ipcRenderer.invoke('ssh:sftp:rename-move', opts),
  deleteFile: (opts: { id: string; remotePath: string }) => ipcRenderer.invoke('ssh:sftp:delete-file', opts),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:open-directory'),
  openSaveDialog: (opts: { fileName: string }) => ipcRenderer.invoke('dialog:save-file', opts),
  agentEnableAndConfigure: (opts: { enabled: boolean }) => ipcRenderer.invoke('ssh:agent:enable-and-configure', opts),
  addKey: (opts: { keyData: string; passphrase?: string; comment?: string }) => ipcRenderer.invoke('ssh:agent:add-key', opts),
  removeKey: (opts: { keyId: string }) => ipcRenderer.invoke('ssh:agent:remove-key', opts),
  listKeys: () => ipcRenderer.invoke('ssh:agent:list-key') as Promise<[]>
}
// 自定义 API 用于浏览器控制

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      electronAPI,
      ipcRenderer: {
        on: (channel, listener) => ipcRenderer.on(channel, listener),
        removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
      },
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
